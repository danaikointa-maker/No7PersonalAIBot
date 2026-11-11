#!/usr/bin/env node
// Optional local companion server (zero dependencies).
// Why it exists:
//   1. serve dist/ to other devices on your LAN (phone ↔ PC, same app)
//   2. proxy AI calls that browsers block with CORS (Ollama on localhost, some providers)
//   3. expose /api/tools so an ESP32 / Phone-Link client can use the same tool registry
//   4. HMAC-signed pairing endpoint (docs/PHONE_LINK.md)
//
// Run: npm run server   →  http://localhost:8787

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  BotSessions, normalizeTelegramUpdate, normalizeLineEvents, verifyLineSignature,
  handleBotMessage, sendTelegramMessage, replyLine,
} from './bots.js';
import { normalizeTask, nextOccurrence, mergeTaskLists } from '../web/src/core/tasks.js';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APP_VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '0.0.0'; }
  catch { return '0.0.0'; }
})();

const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.NO7_PORT || 8787);
const HOST = process.env.NO7_HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/** In-memory pairing registry: code -> { secret, createdAt } */
const pairings = new Map();

/** Sync store: เก็บล่าสุดในหน่วยความจำ + ไฟล์ .no7/sync.json (ถ้าเขียนได้) */
const DATA_DIR = process.env.NO7_DATA_DIR ? path.resolve(process.env.NO7_DATA_DIR) : path.join(ROOT, '.no7');
const SYNC_DIR = DATA_DIR;
const SYNC_FILE = path.join(SYNC_DIR, 'sync.json');
const SYNC_TOKEN = process.env.NO7_SYNC_TOKEN || '';

function readSync() {
  try { return JSON.parse(fs.readFileSync(SYNC_FILE, 'utf8')); } catch { return null; }
}
function writeSync(data) {
  try {
    fs.mkdirSync(SYNC_DIR, { recursive: true });
    fs.writeFileSync(SYNC_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch { return false; }
}
/* ---------------- Reminders pushed by the server ----------------
 * ไคลเอนต์ PUT งานที่มีเวลามาที่นี่ → server ตรวจทุก TICK และ
 *   - เก็บคิวให้ไคลเอนต์ดึง (GET /api/reminders/due)
 *   - ส่ง Telegram ให้ถ้าตั้ง TELEGRAM_REMINDER_CHAT_ID
 * งานซ้ำจะถูกเลื่อนรอบถัดไปอัตโนมัติหลังแจ้ง
 */
const REMINDER_FILE = path.join(SYNC_DIR, 'reminders.json');
const REMINDER_TICK_MS = Number(process.env.NO7_REMINDER_TICK_MS || 30000);
const REMINDER_CHAT_ID = process.env.TELEGRAM_REMINDER_CHAT_ID || '';

function readReminders() {
  try {
    const data = JSON.parse(fs.readFileSync(REMINDER_FILE, 'utf8'));
    return Array.isArray(data?.items) ? data : { updatedAt: 0, items: [] };
  } catch { return { updatedAt: 0, items: [] }; }
}

function writeReminders(data) {
  try {
    fs.mkdirSync(SYNC_DIR, { recursive: true });
    fs.writeFileSync(REMINDER_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch { return false; }
}

let reminderState = readReminders();

function reminderDueList(now = Date.now()) {
  return reminderState.items.filter((t) => !t.done && !t.deleted && t.due
    && !t.pushedAt && Date.parse(t.due) <= now);
}

function reminderUpcoming(days = 7, limit = 10, now = Date.now()) {
  const until = now + days * 24 * 3600 * 1000;
  return reminderState.items
    .filter((t) => !t.done && !t.deleted && !t.pushedAt && t.due && Date.parse(t.due) <= until)
    .sort((a, b) => Date.parse(a.due) - Date.parse(b.due))
    .slice(0, limit);
}

async function pushReminders() {
  const due = reminderDueList();
  if (!due.length) return [];
  const sent = [];
  for (const item of due) {
    if (REMINDER_CHAT_ID && BOTS.telegram.token) {
      try {
        await sendTelegramMessage({
          token: BOTS.telegram.token,
          chatId: REMINDER_CHAT_ID,
          text: `⏰ ${item.title}${item.recurrence ? ' 🔁' : ''}\n${new Date(item.due).toLocaleString('th-TH')}`,
          apiBase: BOTS.telegram.apiBase,
        });
        sent.push(item.id);
      } catch (e) {
        console.warn('[reminders] telegram:', e.message);
      }
    }
    item.pushedAt = Date.now();
    if (item.recurrence) {
      const next = nextOccurrence(item.due, item.recurrence, Date.now());
      if (next) {
        item.due = next;
        item.pushedAt = null;          // รอบถัดไปต้องแจ้งอีก
        item.repeatCount = (item.repeatCount || 0) + 1;
      } else {
        item.done = true;
      }
    }
  }
  reminderState.updatedAt = Date.now();
  writeReminders(reminderState);
  return sent;
}

/* ---------------- Chat bots: Telegram / LINE ---------------- */
const BOTS = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    secret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
    apiBase: process.env.TELEGRAM_API_BASE || 'https://api.telegram.org',
  },
  line: {
    token: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    secret: process.env.LINE_CHANNEL_SECRET || '',
    apiBase: process.env.LINE_API_BASE || 'https://api.line.me',
  },
  provider: process.env.NO7_BOT_PROVIDER || 'pollinations',
  model: process.env.NO7_BOT_MODEL || '',
};
const botSessions = new BotSessions();
const botLog = []; // {at, provider, chatId, ok, error}

function noteBot(entry) {
  botLog.push({ at: Date.now(), ...entry });
  if (botLog.length > 50) botLog.shift();
}

async function botChat(messages) {
  return proxyChat({ provider: BOTS.provider, model: BOTS.model || undefined, messages });
}

async function processTelegramUpdate(update) {
  const msg = normalizeTelegramUpdate(update);
  if (!msg) return;
  try {
    const parts = await handleBotMessage({
      text: msg.text,
      chatId: `tg:${msg.chatId}`,
      provider: 'telegram',
      sessions: botSessions,
      chat: botChat,
    });
    for (const part of parts) {
      await sendTelegramMessage({
        token: BOTS.telegram.token,
        chatId: msg.chatId,
        text: part,
        apiBase: BOTS.telegram.apiBase,
      });
    }
    noteBot({ provider: 'telegram', chatId: msg.chatId, ok: true });
  } catch (e) {
    noteBot({ provider: 'telegram', chatId: msg.chatId, ok: false, error: e.message });
    console.warn('[bot:telegram]', e.message);
  }
}

async function processLineEvent(ev) {
  try {
    const parts = await handleBotMessage({
      text: ev.text,
      chatId: `line:${ev.chatId}`,
      provider: 'line',
      sessions: botSessions,
      chat: botChat,
    });
    for (const part of parts) {
      await replyLine({
        token: BOTS.line.token,
        replyToken: ev.replyToken,
        text: part,
        apiBase: BOTS.line.apiBase,
      });
    }
    noteBot({ provider: 'line', chatId: ev.chatId, ok: true });
  } catch (e) {
    noteBot({ provider: 'line', chatId: ev.chatId, ok: false, error: e.message });
    console.warn('[bot:line]', e.message);
  }
}

/* ---------------- MCP stdio bridge ----------------
 * MCP servers แบบ process-local (stdio) ถูกประกาศผ่าน env เท่านั้น:
 *   MCP_STDIO_SERVERS='{"everything":{"command":"npx","args":["-y","@modelcontextprotocol/server-everything"]}}'
 * เบราว์เซอร์เลือกได้แค่ id ที่ประกาศไว้ — ห้ามสั่งรันคำสั่งอะไรก็ได้จากหน้าเว็บ
 */
const MCP_STDIO_SERVERS = (() => {
  const raw = process.env.MCP_STDIO_SERVERS || '';
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    const out = {};
    for (const [id, cfg] of Object.entries(parsed || {})) {
      if (!cfg || typeof cfg.command !== 'string' || !cfg.command.trim()) continue;
      out[id] = {
        id,
        command: cfg.command,
        args: Array.isArray(cfg.args) ? cfg.args.map(String) : [],
        env: cfg.env && typeof cfg.env === 'object' ? Object.fromEntries(
          Object.entries(cfg.env).filter(([, v]) => typeof v === 'string')
        ) : {},
        cwd: typeof cfg.cwd === 'string' ? cfg.cwd : ROOT,
      };
    }
    return out;
  } catch (e) {
    console.warn('[mcp] MCP_STDIO_SERVERS ไม่ใช่ JSON ที่ถูกต้อง:', e.message);
    return {};
  }
})();

const mcpStdio = new Map(); // id -> { child, pending: Map, buffer, stderr }

function stdioEntry(id) {
  const cfg = MCP_STDIO_SERVERS[id];
  if (!cfg) throw new Error(`ไม่รู้จัก stdio MCP server "${id}"`);
  let entry = mcpStdio.get(id);
  if (entry && entry.child.exitCode === null) return entry;

  const child = spawn(cfg.command, cfg.args, {
    cwd: cfg.cwd,
    env: { ...process.env, ...cfg.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const fresh = { child, pending: new Map(), buffer: '', stderr: '' };
  mcpStdio.set(id, fresh);

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    fresh.buffer += chunk;
    let idx;
    while ((idx = fresh.buffer.indexOf('\n')) >= 0) {
      const line = fresh.buffer.slice(0, idx).trim();
      fresh.buffer = fresh.buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      const wait = msg && msg.id != null ? fresh.pending.get(msg.id) : null;
      if (wait) {
        clearTimeout(wait.timer);
        fresh.pending.delete(msg.id);
        wait.resolve(msg);
      }
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { fresh.stderr = (fresh.stderr + chunk).slice(-2000); });
  child.on('exit', (code) => {
    for (const [, wait] of fresh.pending) {
      clearTimeout(wait.timer);
      wait.reject(new Error(`MCP process exited (code ${code})${fresh.stderr ? `: ${fresh.stderr.slice(-200)}` : ''}`));
    }
    fresh.pending.clear();
    mcpStdio.delete(id);
  });
  child.on('error', (err) => {
    for (const [, wait] of fresh.pending) {
      clearTimeout(wait.timer);
      wait.reject(err);
    }
    fresh.pending.clear();
    mcpStdio.delete(id);
  });
  return fresh;
}

function mcpStdioCall(id, payload, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    let entry;
    try { entry = stdioEntry(id); } catch (e) { reject(e); return; }
    const timer = setTimeout(() => {
      entry.pending.delete(payload.id);
      reject(new Error(`MCP stdio timeout (${timeoutMs}ms)${entry.stderr ? `: ${entry.stderr.slice(-200)}` : ''}`));
    }, timeoutMs);
    if (payload.id == null) {
      // notification: เขียนแล้วจบ
      clearTimeout(timer);
      try { entry.child.stdin.write(`${JSON.stringify(payload)}\n`); resolve(null); } catch (e) { reject(e); }
      return;
    }
    entry.pending.set(payload.id, { resolve, reject, timer });
    try {
      entry.child.stdin.write(`${JSON.stringify(payload)}\n`);
    } catch (e) {
      clearTimeout(timer);
      entry.pending.delete(payload.id);
      reject(e);
    }
  });
}

/* ---------------- Phone-Link: command queue + results ---------------- */
const linkState = {
  queues: new Map(),    // code -> [{id, command, args, ts, delivered}]
  results: new Map(),   // code -> [{id, command, ok, data, ts}]
  seen: new Map(),      // code -> lastSeen ms
  devices: new Map(),   // code -> {code,name,kind,firmware,capabilities,firstSeen,lastSeen,ip}
  eyes: new Map(),      // code -> {emotion,mood,intensity,text,ttlMs,ts}
  voice: new Map(),     // code -> {chunks:[{seq,mime,chunk,ts,final}], bytes, lastSeq}
};

/* ---------------- Phone-Link: hello / eyes / voice ---------------- */
const LINK_DEVICES_FILE = path.join(SYNC_DIR, 'devices.json');
const LINK_EYES_TTL_MS = 15000;
const LINK_VOICE_MAX_CHUNK = 256 * 1024;       // ต่อ chunk (base64 decoded)
const LINK_VOICE_MAX_BYTES = 2 * 1024 * 1024;  // ต่ออุปกรณ์ (ค้างในคิว)
const LINK_VOICE_MAX_CHUNKS = 40;
const LINK_VOICE_MIMES = ['audio/ogg', 'audio/opus', 'audio/pcm', 'audio/wav', 'audio/webm', 'audio/mpeg'];

function loadLinkDevices() {
  try {
    const data = JSON.parse(fs.readFileSync(LINK_DEVICES_FILE, 'utf8'));
    for (const [code, device] of Object.entries(data || {})) {
      if (device && typeof device === 'object') linkState.devices.set(code, { ...device, code });
    }
  } catch { /* ยังไม่มีไฟล์ = เริ่มใหม่ */ }
}
function saveLinkDevices() {
  try {
    fs.mkdirSync(SYNC_DIR, { recursive: true });
    const out = {};
    for (const [code, device] of linkState.devices) out[code] = device;
    fs.writeFileSync(LINK_DEVICES_FILE, JSON.stringify(out, null, 2));
    return true;
  } catch { return false; }
}
loadLinkDevices();

function linkVoiceQueue(code) {
  if (!linkState.voice.has(code)) linkState.voice.set(code, { chunks: [], bytes: 0, lastSeq: 0 });
  return linkState.voice.get(code);
}

function currentEyes(code, ttlOverride) {
  const eye = linkState.eyes.get(code);
  if (!eye) return null;
  const ttl = Number(ttlOverride) || eye.ttlMs || LINK_EYES_TTL_MS;
  const ageMs = Date.now() - eye.ts;
  return { ...eye, ageMs, stale: ageMs > ttl };
}

function verifyLink(req, method, raw = '') {
  const code = String(req.headers['x-no7-code'] || '');
  const sig = String(req.headers['x-no7-signature'] || '');
  const entry = pairings.get(code);
  if (!entry || !sig) return null;
  const path = new URL(req.url, 'http://x').pathname;
  const candidates = [
    crypto.createHmac('sha256', Buffer.from(entry.secret)).update(`${method}\n${path}\n${raw}`).digest('hex'),
    crypto.createHmac('sha256', Buffer.from(entry.secret)).update(raw).digest('hex'),  // legacy: body only
  ];
  for (const expected of candidates) {
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      linkState.seen.set(code, Date.now());
      return code;
    }
  }
  return null;
}

function syncAuthorized(req) {
  if (!SYNC_TOKEN) return true;                       // ไม่ตั้ง token = เปิดให้ใน LAN
  return String(req.headers['x-no7-sync'] || '') === SYNC_TOKEN;
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-No7-Signature, X-No7-Code',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function readRawBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function hmac(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/** Verify X-No7-Code + X-No7-Signature over the raw body. */
function verifySignature(req, raw) {
  const code = req.headers['x-no7-code'];
  const sig = req.headers['x-no7-signature'];
  const entry = pairings.get(code);
  if (!entry || !sig) return false;
  const expected = hmac(Buffer.from(entry.secret), raw);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') return json(res, 204, {});

  if (url.pathname === '/api/health') {
    return json(res, 200, {
      ok: true, app: 'no7-personal-ai-bot', version: APP_VERSION,
      platform: process.platform, node: process.version,
      hasDist: fs.existsSync(path.join(DIST, 'index.html')),
      sync: { enabled: true, requiresToken: !!SYNC_TOKEN, hasData: !!readSync() },
      endpoints: ['/api/health', '/api/chat', '/api/tools', '/api/tools/run', '/api/pair', '/api/sync', '/api/fetch',
        '/api/link/command', '/api/link/poll', '/api/link/status', '/api/link/results',
        '/api/link/hello', '/api/link/eyes', '/api/link/voice', '/api/link/voice/ack', '/api/link/voice/status', '/api/tts', '/api/mcp',
        '/api/mcp/stdio', '/api/oauth/token', '/api/oauth/device', '/api/oauth/register',
        '/api/bots/status', '/api/telegram/webhook', '/api/line/webhook',
        '/api/reminders', '/api/reminders/due', '/api/reminders/upcoming', '/api/reminders/ack', '/api/reminders/status'],
      aiKeys: {
        gemini: !!process.env.GEMINI_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
        elevenlabs: !!process.env.ELEVENLABS_API_KEY,
      },
    });
  }

  // ---- pairing: create a code, returns a one-time secret ----
  if (url.pathname === '/api/pair' && req.method === 'POST') {
    const body = await readBody(req);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const secret = crypto.randomBytes(32).toString('hex');
    pairings.set(code, { secret, name: body.name || 'phone', createdAt: Date.now() });
    const proof = hmac(Buffer.from(secret), `pair:${code}`);
    return json(res, 200, { code, secret, proof, expiresIn: 600 });
  }

  // ---- AI proxy (browser → here → provider; fixes CORS + keeps keys off the client) ----
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    const raw = await readBody(req);
    const { provider = 'pollinations', model, messages = [], baseUrl } = raw;
    // If pairing headers are present they must be valid; otherwise local-only access.
    if (req.headers['x-no7-code'] && !verifySignature(req, JSON.stringify(raw))) {
      return json(res, 401, { error: 'bad signature' });
    }
    try {
      const text = await proxyChat({ provider, model, messages, baseUrl });
      return json(res, 200, { text });
    } catch (e) {
      return json(res, 502, { error: e.message });
    }
  }

  // ---- TTS proxy: เลี่ยง CORS และซ่อน API key ไว้ที่ server ----
  if (url.pathname === '/api/tts' && req.method === 'POST') {
    const body = await readBody(req);
    const text = String(body.text || '').slice(0, 3000);
    if (!text) return json(res, 400, { error: 'ต้องมี text' });
    const provider = String(body.provider || 'openai');

    // ---- ElevenLabs: เสียงพรีเมียม (คืน mp3 เหมือนกัน) ----
    if (provider === 'elevenlabs') {
      const key = body.apiKey || process.env.ELEVENLABS_API_KEY;
      if (!key) return json(res, 400, { error: 'ไม่มี API key — ตั้ง ELEVENLABS_API_KEY ที่ server หรือกรอกในแอป' });
      const base = String(body.baseUrl || process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io/v1').replace(/\/$/, '');
      const voiceId = encodeURIComponent(String(body.voice || '21m00Tcm4TlvDq8ikWAM'));
      try {
        const r = await fetch(`${base}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg', 'xi-api-key': String(key) },
          body: JSON.stringify({
            text,
            model_id: body.model || 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        });
        if (!r.ok) {
          const detail = await r.text().catch(() => '');
          return json(res, 502, { error: `provider ${r.status}: ${detail.slice(0, 200)}` });
        }
        const buf = Buffer.from(await r.arrayBuffer());
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': buf.length,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        });
        res.end(buf);
      } catch (e) {
        json(res, 502, { error: e.message });
      }
      return;
    }

    const key = body.apiKey || process.env.OPENAI_API_KEY;
    if (!key) return json(res, 400, { error: 'ไม่มี API key — ตั้ง OPENAI_API_KEY ที่ server หรือกรอกในแอป' });
    const base = String(body.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    try {
      const r = await fetch(`${base}/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: body.model || 'tts-1',
          voice: body.voice || 'alloy',
          input: text,
          response_format: 'mp3',
        }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        return json(res, 502, { error: `provider ${r.status}: ${detail.slice(0, 200)}` });
      }
      const buf = Buffer.from(await r.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buf.length,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      res.end(buf);
    } catch (e) {
      json(res, 502, { error: e.message });
    }
    return;
  }

  // ---- Reminders (server-side push) ----
  if (url.pathname === '/api/reminders' && req.method === 'PUT') {
    let body;
    try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }); }
    const incoming = Array.isArray(body.tasks) ? body.tasks : [];
    const normalized = incoming.map((t) => normalizeTask(t)).filter((t) => t && !t.deleted && t.due);
    const merged = mergeTaskLists(reminderState.items, normalized).tasks
      .filter((t) => !t.deleted && t.due);
    reminderState = { updatedAt: Date.now(), items: merged };
    const persisted = writeReminders(reminderState);
    return json(res, 200, { ok: true, count: merged.length, persisted });
  }

  if (url.pathname === '/api/reminders/due' && req.method === 'GET') {
    return json(res, 200, { now: Date.now(), items: reminderDueList() });
  }

  if (url.pathname === '/api/reminders/upcoming' && req.method === 'GET') {
    const days = Math.max(1, Math.min(60, Number(url.searchParams.get('days')) || 7));
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit')) || 10));
    return json(res, 200, { items: reminderUpcoming(days, limit) });
  }

  if (url.pathname === '/api/reminders/ack' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }); }
    const ids = new Set(Array.isArray(body.ids) ? body.ids.map(String) : []);
    let changed = 0;
    for (const item of reminderState.items) {
      if (ids.has(item.id) && !item.pushedAt) { item.pushedAt = Date.now(); changed += 1; }
    }
    reminderState.updatedAt = Date.now();
    writeReminders(reminderState);
    return json(res, 200, { ok: true, changed });
  }

  if (url.pathname === '/api/reminders/status' && req.method === 'GET') {
    const now = Date.now();
    const upcoming = reminderUpcoming(7, 3, now);
    return json(res, 200, {
      count: reminderState.items.length,
      due: reminderDueList(now).length,
      next: upcoming[0] || null,
      telegram: { configured: !!(REMINDER_CHAT_ID && BOTS.telegram.token), chatId: REMINDER_CHAT_ID ? `***${String(REMINDER_CHAT_ID).slice(-4)}` : null },
      tickMs: REMINDER_TICK_MS,
      updatedAt: reminderState.updatedAt,
    });
  }

  // ---- Chat bots ----
  if (url.pathname === '/api/bots/status' && req.method === 'GET') {
    return json(res, 200, {
      provider: BOTS.provider,
      model: BOTS.model || null,
      telegram: {
        configured: !!BOTS.telegram.token,
        requiresSecret: !!BOTS.telegram.secret,
        webhookPath: '/api/telegram/webhook',
      },
      line: {
        configured: !!(BOTS.line.token && BOTS.line.secret),
        webhookPath: '/api/line/webhook',
      },
      sessions: botSessions.size(),
      recent: botLog.slice(-10),
    });
  }

  if (url.pathname === '/api/telegram/webhook' && req.method === 'POST') {
    if (!BOTS.telegram.token) return json(res, 503, { error: 'ยังไม่ได้ตั้ง TELEGRAM_BOT_TOKEN ที่ server' });
    if (BOTS.telegram.secret) {
      const got = req.headers['x-telegram-bot-api-secret-token'] || '';
      if (got !== BOTS.telegram.secret) return json(res, 401, { error: 'secret token ไม่ตรง' });
    } else {
      console.warn('[bot:telegram] ไม่ได้ตั้ง TELEGRAM_WEBHOOK_SECRET — ควรตั้งเพื่อกันคนอื่นยิง webhook ปลอม');
    }
    let update;
    try { update = await readBody(req); } catch (e) { return json(res, 400, { error: e.message }); }
    json(res, 200, { ok: true });
    void processTelegramUpdate(update);
    return;
  }

  if (url.pathname === '/api/line/webhook' && req.method === 'POST') {
    if (!BOTS.line.token || !BOTS.line.secret) {
      return json(res, 503, { error: 'ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET' });
    }
    let raw;
    try { raw = await readRawBody(req); } catch (e) { return json(res, 400, { error: e.message }); }
    const signature = req.headers['x-line-signature'] || '';
    if (!verifyLineSignature({ secret: BOTS.line.secret, rawBody: raw, signature, cryptoImpl: crypto })) {
      return json(res, 401, { error: 'signature ไม่ถูกต้อง' });
    }
    let body;
    try { body = raw ? JSON.parse(raw) : {}; } catch { return json(res, 400, { error: 'invalid JSON' }); }
    json(res, 200, { ok: true });
    for (const ev of normalizeLineEvents(body)) void processLineEvent(ev);
    return;
  }

  // ---- OAuth token proxy: แลก/ต่ออายุ token ให้เบราว์เซอร์ (เลี่ยง CORS) ----
  if (url.pathname === '/api/oauth/token' && req.method === 'POST') {
    const body = await readBody(req);
    let target;
    try { target = new URL(String(body.tokenUrl || '')); } catch { return json(res, 400, { error: 'tokenUrl ไม่ถูกต้อง' }); }
    if (!/^https?:$/.test(target.protocol)) return json(res, 400, { error: 'รองรับเฉพาะ http/https' });
    const form = new URLSearchParams();
    for (const key of ['grant_type', 'code', 'redirect_uri', 'client_id', 'code_verifier', 'refresh_token', 'scope', 'device_code']) {
      if (body[key] != null && body[key] !== '') form.set(key, String(body[key]));
    }
    if (!form.get('grant_type')) return json(res, 400, { error: 'ต้องมี grant_type' });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
    if (body.clientSecret) {
      headers.Authorization = `Basic ${Buffer.from(`${body.clientId || ''}:${body.clientSecret}`).toString('base64')}`;
    }
    try {
      const r = await fetch(target, { method: 'POST', headers, body: form.toString() });
      const text = await r.text();
      return json(res, 200, {
        status: r.status,
        contentType: r.headers.get('content-type') || '',
        body: text.slice(0, 100000),
      });
    } catch (e) {
      return json(res, 502, { error: e.message, status: 0, body: '' });
    }
  }

  // ---- OAuth device flow proxy (RFC 8628): ขอ device code ให้เบราว์เซอร์ ----
  if (url.pathname === '/api/oauth/device' && req.method === 'POST') {
    const body = await readBody(req);
    let target;
    try { target = new URL(String(body.deviceAuthorizationUrl || '')); } catch { return json(res, 400, { error: 'deviceAuthorizationUrl ไม่ถูกต้อง' }); }
    if (!/^https?:$/.test(target.protocol)) return json(res, 400, { error: 'รองรับเฉพาะ http/https' });
    const form = new URLSearchParams();
    for (const key of ['client_id', 'scope']) {
      if (body[key] != null && body[key] !== '') form.set(key, String(body[key]));
    }
    if (body.extra && typeof body.extra === 'object') {
      for (const [k, v] of Object.entries(body.extra)) {
        if (typeof k === 'string' && (typeof v === 'string' || typeof v === 'number')) form.set(k, String(v));
      }
    }
    try {
      const r = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: form.toString(),
      });
      const text = await r.text();
      return json(res, 200, { status: r.status, contentType: r.headers.get('content-type') || '', body: text.slice(0, 100000) });
    } catch (e) {
      return json(res, 502, { error: e.message, status: 0, body: '' });
    }
  }

  // ---- OAuth dynamic client registration proxy (RFC 7591) ----
  if (url.pathname === '/api/oauth/register' && req.method === 'POST') {
    const body = await readBody(req);
    let target;
    try { target = new URL(String(body.registrationUrl || '')); } catch { return json(res, 400, { error: 'registrationUrl ไม่ถูกต้อง' }); }
    if (!/^https?:$/.test(target.protocol)) return json(res, 400, { error: 'รองรับเฉพาะ http/https' });
    const client = body.client && typeof body.client === 'object' ? body.client : {};
    try {
      const r = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(client),
      });
      const text = await r.text();
      return json(res, 200, { status: r.status, contentType: r.headers.get('content-type') || '', body: text.slice(0, 100000) });
    } catch (e) {
      return json(res, 502, { error: e.message, status: 0, body: '' });
    }
  }

  // ---- MCP stdio servers ที่ประกาศไว้ (ไม่เปิดเผย env/secret) ----
  if (url.pathname === '/api/mcp/stdio' && req.method === 'GET') {
    return json(res, 200, {
      servers: Object.values(MCP_STDIO_SERVERS).map((c) => ({
        id: c.id,
        command: c.command,
        args: c.args,
        running: mcpStdio.has(c.id),
      })),
    });
  }

  // ---- MCP proxy: JSON-RPC 2.0 ไปยัง MCP server (เลี่ยง CORS) ----
  if (url.pathname === '/api/mcp' && req.method === 'POST') {
    const body = await readBody(req);

    // stdio transport: ไม่มี URL — ใช้ id ที่ประกาศใน env
    if (body.transport === 'stdio' || (!body.url && body.server)) {
      const id = String(body.server || '');
      if (!MCP_STDIO_SERVERS[id]) {
        return json(res, 400, { error: `ไม่รู้จัก stdio MCP server "${id}" — ประกาศใน MCP_STDIO_SERVERS ก่อน` });
      }
      try {
        const msg = await mcpStdioCall(id, body.payload || {}, Number(body.timeoutMs) || 25000);
        return json(res, 200, {
          status: 200,
          contentType: 'application/json',
          headers: {},
          body: msg ? JSON.stringify(msg) : '',
        });
      } catch (e) {
        return json(res, 502, { error: e.message, status: 0, body: '' });
      }
    }

    const target = String(body.url || '');
    let parsed;
    try { parsed = new URL(target); } catch { return json(res, 400, { error: 'url ไม่ถูกต้อง' }); }
    if (!/^https?:$/.test(parsed.protocol)) return json(res, 400, { error: 'รองรับเฉพาะ http/https' });
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(body.headers && typeof body.headers === 'object' ? Object.fromEntries(
        Object.entries(body.headers).filter(([k, v]) => typeof k === 'string' && typeof v === 'string')
      ) : {}),
    };
    const key = body.apiKey || body.token || '';
    if (key) headers.Authorization = `Bearer ${key}`;
    if (body.sessionId) headers['mcp-session-id'] = String(body.sessionId);
    try {
      const r = await fetch(target, {
        method: 'POST',
        headers,
        body: JSON.stringify(body.payload || {}),
      });
      const text = await r.text();
      return json(res, 200, {
        status: r.status,
        contentType: r.headers.get('content-type') || '',
        headers: { 'mcp-session-id': r.headers.get('mcp-session-id') || '' },
        body: text.slice(0, 400000),
      });
    } catch (e) {
      return json(res, 502, { error: e.message, status: 0, body: '' });
    }
  }

  // ---- Phone-Link endpoints (HMAC signed) ----
  if (url.pathname.startsWith('/api/link/')) {
    const method = req.method;
    if (method === 'POST') {
      const raw = await new Promise((resolve, reject) => {
        let b = '';
        req.on('data', (c) => {
          b += c;
          if (b.length > 3_000_000) { reject(new Error('body ใหญ่เกิน 3 MB')); req.destroy(); }
        });
        req.on('end', () => resolve(b));
        req.on('error', reject);
      }).catch((e) => { json(res, 413, { error: e.message }); return null; });
      if (raw === null) return;
      const code = verifyLink(req, method, raw);
      if (!code) return json(res, 401, { error: 'bad signature' });

      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { return json(res, 400, { error: 'invalid JSON' }); }

      if (url.pathname === '/api/link/command') {
        const q = linkState.queues.get(code) || [];
        const item = {
          id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 4)}`,
          command: String(body.command || 'ping').slice(0, 40),
          args: body.args || {},
          ts: Date.now(),
          delivered: false,
        };
        q.push(item);
        linkState.queues.set(code, q.slice(-100));
        return json(res, 200, { ok: true, id: item.id, queued: true });
      }

      if (url.pathname === '/api/link/result') {
        const r = linkState.results.get(code) || [];
        r.push({ id: body.id || null, command: body.command || '', ok: !!body.ok, data: body.data ?? null, ts: Date.now() });
        linkState.results.set(code, r.slice(-50));
        return json(res, 200, { ok: true });
      }

      // 13.1 hello — อุปกรณ์ลงทะเบียนตัวเอง + บอกว่ามีความสามารถอะไร
      if (url.pathname === '/api/link/hello') {
        const caps = body.capabilities && typeof body.capabilities === 'object' ? body.capabilities : {};
        const prev = linkState.devices.get(code) || {};
        const now = Date.now();
        const device = {
          code,
          name: String(body.name || prev.name || 'device').slice(0, 40),
          kind: String(body.kind || prev.kind || 'esp32').slice(0, 20),
          firmware: String(body.firmware || prev.firmware || '').slice(0, 40),
          capabilities: Object.fromEntries(['mic', 'speaker', 'eyes', 'screen', 'buttons', 'voice'].map((key) => [
            key,
            key in caps ? caps[key] === true : prev.capabilities?.[key] === true,
          ])),
          firstSeen: prev.firstSeen || now,
          lastSeen: now,
          ip: String(req.socket?.remoteAddress || '').replace('::ffff:', ''),
        };
        linkState.devices.set(code, device);
        const persisted = saveLinkDevices();
        return json(res, 200, {
          ok: true,
          protocol: 'no7-link/1',
          serverTime: now,
          device,
          features: ['hello', 'eyes', 'voice', 'command', 'results'],
          pollMs: 3000,
          eyesTtlMs: LINK_EYES_TTL_MS,
          persisted,
        });
      }

      // 13.2 eyes — เก็บอารมณ์/ตาล่าสุดไว้ให้จอ ESP32 ดึงไปวาด
      if (url.pathname === '/api/link/eyes') {
        const emotion = String(body.emotion || body.mood || '').trim().slice(0, 20);
        if (!emotion) return json(res, 400, { error: 'ต้องระบุ emotion' });
        const intensityRaw = Number(body.intensity);
        const eye = {
          emotion,
          mood: String(body.mood || emotion).slice(0, 20),
          intensity: Number.isFinite(intensityRaw) ? Math.max(0, Math.min(100, Math.round(intensityRaw))) : 80,
          text: String(body.text || '').slice(0, 120),
          ttlMs: Math.max(1000, Math.min(60000, Number(body.ttlMs) || LINK_EYES_TTL_MS)),
          ts: Date.now(),
        };
        linkState.eyes.set(code, eye);
        return json(res, 200, { ok: true, eyes: { ...eye, code } });
      }

      // 13.3 voice — รับ chunk เสียงจากอุปกรณ์ (base64) เข้าคิวให้ไคลเอนต์ PC ดึง
      if (url.pathname === '/api/link/voice') {
        const chunk = typeof body.chunk === 'string' ? body.chunk.trim() : '';
        if (!chunk) return json(res, 400, { error: 'ต้องส่ง chunk (base64)' });
        if (!/^[A-Za-z0-9+/=\r\n]+$/.test(chunk)) return json(res, 400, { error: 'chunk ต้องเป็น base64' });
        const bytes = Buffer.from(chunk, 'base64');
        if (bytes.length > LINK_VOICE_MAX_CHUNK) {
          return json(res, 413, { error: `chunk ใหญ่เกิน ${LINK_VOICE_MAX_CHUNK} ไบต์` });
        }
        const mime = String(body.mime || 'audio/ogg').toLowerCase();
        if (!LINK_VOICE_MIMES.includes(mime)) {
          return json(res, 415, { error: `ไม่รองรับ ${mime} — ใช้ ${LINK_VOICE_MIMES.join(', ')}` });
        }
        const queue = linkVoiceQueue(code);
        const seqRaw = Number(body.seq);
        const seq = Number.isFinite(seqRaw) && seqRaw > 0 ? Math.round(seqRaw) : queue.lastSeq + 1;
        queue.chunks.push({
          seq, mime, chunk, bytes: bytes.length, final: body.final === true, ts: Date.now(),
        });
        queue.bytes += bytes.length;
        queue.lastSeq = Math.max(queue.lastSeq, seq);
        while (queue.chunks.length > LINK_VOICE_MAX_CHUNKS || queue.bytes > LINK_VOICE_MAX_BYTES) {
          const dropped = queue.chunks.shift();
          queue.bytes -= dropped?.bytes || 0;
          queue.dropped = (queue.dropped || 0) + 1;
        }
        return json(res, 200, {
          ok: true, seq, chunks: queue.chunks.length, bytes: queue.bytes,
          final: body.final === true, dropped: queue.dropped || 0,
        });
      }

      // 13.3 ack — ไคลเอนต์ PC บอกว่าเล่นถึง seq ไหนแล้ว
      if (url.pathname === '/api/link/voice/ack') {
        const uptoRaw = Number(body.upto ?? body.seq);
        const upto = Number.isFinite(uptoRaw) ? uptoRaw : Infinity;
        const queue = linkVoiceQueue(code);
        const before = queue.chunks.length;
        queue.chunks = queue.chunks.filter((c) => c.seq > upto);
        queue.bytes = queue.chunks.reduce((sum, c) => sum + c.bytes, 0);
        return json(res, 200, { ok: true, removed: before - queue.chunks.length, chunks: queue.chunks.length, bytes: queue.bytes });
      }

      return json(res, 404, { error: 'not found' });
    }

    if (method === 'GET') {
      const code = verifyLink(req, method, '');
      if (!code) return json(res, 401, { error: 'bad signature' });

      if (url.pathname === '/api/link/poll') {
        const q = linkState.queues.get(code) || [];
        const pending = q.filter((c) => !c.delivered);
        for (const c of pending) c.delivered = true;
        return json(res, 200, { commands: pending, serverTime: Date.now() });
      }
      if (url.pathname === '/api/link/status') {
        const q = linkState.queues.get(code) || [];
        const lastSeen = linkState.seen.get(code) || Date.now();
        const device = linkState.devices.get(code) || null;
        const voice = linkState.voice.get(code) || { chunks: [], bytes: 0 };
        const eyes = currentEyes(code);
        return json(res, 200, {
          code,
          online: Date.now() - lastSeen < 30000,
          lastSeen,
          pending: q.filter((c) => !c.delivered).length,
          delivered: q.filter((c) => c.delivered).length,
          device,
          eyes: eyes ? { emotion: eyes.emotion, stale: eyes.stale, ageMs: eyes.ageMs } : null,
          voice: { chunks: voice.chunks.length, bytes: voice.bytes, dropped: voice.dropped || 0 },
        });
      }
      if (url.pathname === '/api/link/results') {
        const since = Number(url.searchParams.get('since') || 0);
        const all = linkState.results.get(code) || [];
        return json(res, 200, { results: all.filter((r) => r.ts > since) });
      }

      if (url.pathname === '/api/link/hello') {
        const device = linkState.devices.get(code);
        if (!device) return json(res, 404, { error: 'ยังไม่ลงทะเบียน — POST /api/link/hello ก่อน' });
        return json(res, 200, { ok: true, protocol: 'no7-link/1', device, eyesTtlMs: LINK_EYES_TTL_MS });
      }
      if (url.pathname === '/api/link/eyes') {
        return json(res, 200, { ok: true, eyes: currentEyes(code, url.searchParams.get('ttlMs')) });
      }
      if (url.pathname === '/api/link/voice') {
        const since = Number(url.searchParams.get('since') || 0);
        const queue = linkVoiceQueue(code);
        const chunks = queue.chunks.filter((c) => c.seq > since);
        return json(res, 200, {
          ok: true,
          chunks,
          bytes: chunks.reduce((sum, c) => sum + c.bytes, 0),
          final: chunks.some((c) => c.final),
          lastSeq: queue.lastSeq,
        });
      }
      if (url.pathname === '/api/link/voice/status') {
        const queue = linkVoiceQueue(code);
        return json(res, 200, {
          ok: true,
          chunks: queue.chunks.length,
          bytes: queue.bytes,
          lastSeq: queue.lastSeq,
          dropped: queue.dropped || 0,
          final: queue.chunks.some((c) => c.final),
        });
      }
      return json(res, 404, { error: 'not found' });
    }
    return json(res, 405, { error: 'method not allowed' });
  }

  // ---- cross-device sync (opt-in, self-hosted) ----
  if (url.pathname === '/api/sync') {
    if (!syncAuthorized(req)) return json(res, 401, { error: 'bad sync token' });
    if (req.method === 'GET') {
      const data = readSync();
      if (!data) return json(res, 404, { error: 'no sync data yet' });
      return json(res, 200, data);
    }
    if (req.method === 'PUT') {
      const body = await readBody(req, 5_000_000);
      const saved = writeSync({ ...body, serverAt: new Date().toISOString() });
      return json(res, 200, { ok: true, persisted: saved, updatedAt: body.updatedAt || null });
    }
    return json(res, 405, { error: 'use GET or PUT' });
  }

  // ---- fetch proxy: เลี่ยง CORS ให้ RSS/สรุปหน้าเว็บ ----
  if (url.pathname === '/api/fetch' && req.method === 'GET') {
    const target = url.searchParams.get('url') || '';
    if (!/^https?:\/\//i.test(target)) return json(res, 400, { error: 'url ต้องขึ้นต้นด้วย http(s)' });
    try {
      const r = await fetch(target, { headers: { 'User-Agent': 'No7Bot/0.3 (+self-hosted)' } });
      if (!r.ok) return json(res, 502, { error: `upstream ${r.status}` });
      const text = (await r.text()).slice(0, 800_000);
      res.writeHead(200, {
        'Content-Type': r.headers.get('content-type') || 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });
      res.end(text);
    } catch (e) {
      json(res, 502, { error: e.message });
    }
    return;
  }

  // ---- tool catalog + execution for ESP32 / Phone-Link clients ----
  if (url.pathname === '/api/tools' && req.method === 'GET') {
    return json(res, 200, {
      tools: [
        { id: 'weather', params: ['city'] },
        { id: 'air', params: ['city'] },
        { id: 'crypto', params: ['coins'] },
        { id: 'fx', params: ['base'] },
        { id: 'gold', params: [] },
        { id: 'wiki', params: ['query'] },
        { id: 'news', params: ['limit'] },
      ],
      note: 'local tools (timer/todo/note) live on the client',
    });
  }

  if (url.pathname === '/api/tools/run' && req.method === 'POST') {
    const raw = await readBody(req);
    const { tool, args = {} } = raw;
    try {
      const data = await runServerTool(tool, args);
      return json(res, 200, { tool, data });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  return json(res, 404, { error: 'not found' });
}

/* ------------------------------------------------------------ AI proxy */
async function proxyChat({ provider, model, messages, baseUrl }) {
  if (provider === 'ollama') {
    const base = (baseUrl || process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
    const r = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || 'llama3.1', messages, stream: false }),
    });
    if (!r.ok) throw new Error(`Ollama ${r.status}`);
    const d = await r.json();
    return d.message?.content || '';
  }

  if (provider === 'gemini') {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('server ยังไม่ได้ตั้ง GEMINI_API_KEY');
    const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const contents = messages.filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: sys ? { parts: [{ text: sys }] } : undefined, contents }),
    });
    if (!r.ok) throw new Error(`Gemini ${r.status}`);
    const d = await r.json();
    return d.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  }

  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('server ยังไม่ได้ตั้ง OPENAI_API_KEY');
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: model || 'gpt-4o-mini', messages }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}`);
    const d = await r.json();
    return d.choices?.[0]?.message?.content || '';
  }

  // pollinations (free, no key) — also the default
  const r = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model || 'openai', messages }),
  });
  if (!r.ok) throw new Error(`Pollinations ${r.status}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
}

/* --------------------------------------------------------- server tools */
async function runServerTool(tool, args) {
  const j = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${tool} ${r.status}`); return r.json(); });

  if (tool === 'weather' || tool === 'air') {
    const city = args.city || 'Bangkok';
    const geo = await j(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
    const p = geo.results?.[0];
    if (!p) throw new Error(`city not found: ${city}`);
    if (tool === 'weather') {
      const w = await j(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto`);
      return { title: `weather ${p.name}`, big: `${Math.round(w.current.temperature_2m)}C`, lines: [`humidity ${w.current.relative_humidity_2m}%`, `code ${w.current.weather_code}`] };
    }
    const a = await j(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${p.latitude}&longitude=${p.longitude}&current=pm2_5,us_aqi&timezone=auto`);
    return { title: `air ${p.name}`, big: `PM2.5 ${Math.round(a.current.pm2_5)}`, lines: [`US AQI ${Math.round(a.current.us_aqi)}`] };
  }

  if (tool === 'crypto') {
    const ids = (args.coins || ['bitcoin', 'ethereum']).join(',');
    const d = await j(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,thb`);
    return { title: 'crypto', big: `BTC $${d.bitcoin?.usd ?? '—'}`, lines: Object.entries(d).map(([k, v]) => `${k}: $${v.usd} / ${v.thb} THB`) };
  }

  if (tool === 'fx') {
    const d = await j(`https://open.er-api.com/v6/latest/${args.base || 'THB'}`);
    return { title: 'fx', big: `1 THB = ${d.rates?.USD} USD`, lines: Object.entries(d.rates || {}).slice(0, 5).map(([k, v]) => `${k}: ${v}`) };
  }

  if (tool === 'gold') {
    const d = await j('https://api.gold-api.com/price/XAU');
    return { title: 'gold', big: `$${d.price}/oz`, lines: [] };
  }

  if (tool === 'wiki') {
    const s = await j(`https://th.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(args.query || '')}&format=json`);
    const hit = s.query?.search?.[0];
    if (!hit) throw new Error('not found');
    const sum = await j(`https://th.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title)}`);
    return { title: sum.title, big: '', lines: [sum.extract || ''] };
  }

  if (tool === 'news') {
    const ids = await j('https://hacker-news.firebaseio.com/v0/topstories.json');
    const items = await Promise.all(ids.slice(0, args.limit || 5).map((id) => j(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)));
    return { title: 'news', big: '', lines: items.map((i) => i.title) };
  }

  throw new Error(`unknown tool: ${tool}`);
}

/* -------------------------------------------------------------- static */
function serveStatic(req, res, url) {
  if (!fs.existsSync(DIST)) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>No7 server</h1><p>ยังไม่มี build — รัน <code>npm run build</code> ก่อน</p><p><a href="/api/health">/api/health</a></p>`);
    return;
  }
  let filePath = path.join(DIST, decodeURIComponent(url.pathname));
  if (!filePath.startsWith(DIST)) { res.writeHead(403); res.end('forbidden'); return; }
  if (url.pathname === '/' || !path.extname(filePath)) {
    const candidate = path.join(DIST, 'index.html');
    if (fs.existsSync(candidate)) filePath = candidate;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`No7 companion server → http://localhost:${PORT}`);
  console.log(`  LAN: http://<your-ip>:${PORT}  (เปิดจากมือถือในวง Wi-Fi เดียวกัน)`);
  console.log(`  health: /api/health · tools: /api/tools · sync: /api/sync`);
  if (!SYNC_TOKEN) console.log('  ⚠️  ยังไม่ได้ตั้ง NO7_SYNC_TOKEN — /api/sync เปิดให้ทุกคนใน LAN อ่านได้');
  else console.log('  🔐 sync protected by NO7_SYNC_TOKEN');
  console.log(`  ⏰ reminders: ${reminderState.items.length} รายการ · ตรวจทุก ${Math.round(REMINDER_TICK_MS / 1000)}s`
    + `${REMINDER_CHAT_ID ? ' · ส่ง Telegram' : ''}`);
});

// ตรวจงานที่ถึงเวลาทุก TICK (unref เพื่อให้ process จบได้ในเทสต์)
const reminderTimer = setInterval(() => {
  pushReminders().catch((e) => console.warn('[reminders]', e.message));
}, REMINDER_TICK_MS);
reminderTimer.unref?.();

export { server, runServerTool, proxyChat, verifySignature, pairings };
