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
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
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
      ok: true, app: 'no7-personal-ai-bot', version: '0.1.0',
      platform: process.platform, node: process.version,
      hasDist: fs.existsSync(path.join(DIST, 'index.html')),
      aiKeys: {
        gemini: !!process.env.GEMINI_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
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
  console.log(`  health: /api/health · tools: /api/tools`);
});

export { server, runServerTool, proxyChat, verifySignature, pairings };
