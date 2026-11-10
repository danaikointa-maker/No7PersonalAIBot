// Integration: companion server bot webhooks (Telegram + LINE) with mock provider APIs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 20000 + Math.floor(Math.random() * 2000);
const BASE = `http://127.0.0.1:${PORT}`;
const TG_SECRET = 'tg-secret-123';
const LINE_SECRET = 'line-secret-456';

let server = null;
let mockApi = null;
const calls = { telegram: [], line: [] };

function startMockApi() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        if (req.url.includes('/sendMessage')) calls.telegram.push({ url: req.url, body: JSON.parse(body || '{}') });
        if (req.url.includes('/message/reply')) calls.line.push({ url: req.url, body: JSON.parse(body || '{}'), auth: req.headers.authorization });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result: { message_id: 1 } }));
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

async function waitForHealth(timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return await res.json();
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

async function waitFor(fn, timeoutMs = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

test('bot webhooks: secret checks, canned commands and replies', async (t) => {
  const mock = await startMockApi();
  mockApi = mock.srv;
  t.after(() => { try { mockApi.close(); } catch { /* closed */ } });

  server = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NO7_PORT: String(PORT),
      NO7_HOST: '127.0.0.1',
      TELEGRAM_BOT_TOKEN: 'tg-token',
      TELEGRAM_WEBHOOK_SECRET: TG_SECRET,
      TELEGRAM_API_BASE: `http://127.0.0.1:${mock.port}`,
      LINE_CHANNEL_ACCESS_TOKEN: 'line-token',
      LINE_CHANNEL_SECRET: LINE_SECRET,
      LINE_API_BASE: `http://127.0.0.1:${mock.port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  server.stderr.on('data', (c) => { stderr += c; });
  t.after(() => { try { server.kill('SIGKILL'); } catch { /* gone */ } });

  const health = await waitForHealth().catch((e) => assert.fail(`${e.message} ${stderr.slice(-300)}`));
  assert.ok(health.endpoints.includes('/api/telegram/webhook'));
  assert.ok(health.endpoints.includes('/api/line/webhook'));

  const status = await (await fetch(`${BASE}/api/bots/status`)).json();
  assert.equal(status.telegram.configured, true);
  assert.equal(status.telegram.requiresSecret, true);
  assert.equal(status.line.configured, true);
  assert.equal(status.provider, 'pollinations');

  // Telegram: wrong secret → 401
  const bad = await fetch(`${BASE}/api/telegram/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'wrong' },
    body: JSON.stringify({ message: { message_id: 1, chat: { id: 42 }, from: { id: 7, first_name: 'นก' }, text: '/start' } }),
  });
  assert.equal(bad.status, 401);

  // Telegram: /start → sendMessage through the mock API
  const good = await fetch(`${BASE}/api/telegram/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': TG_SECRET },
    body: JSON.stringify({ message: { message_id: 1, chat: { id: 42 }, from: { id: 7, first_name: 'นก' }, text: '/start' } }),
  });
  assert.equal(good.status, 200);
  assert.equal((await good.json()).ok, true);
  assert.ok(await waitFor(() => calls.telegram.length === 1), 'ต้องส่งข้อความกลับ');
  assert.equal(String(calls.telegram[0].body.chat_id), '42');
  assert.match(calls.telegram[0].body.text, /สวัสดี/);
  assert.equal(calls.telegram[0].body.disable_web_page_preview, true);

  // LINE: bad signature → 401
  const lineBody = JSON.stringify({
    events: [{ type: 'message', replyToken: 'rt-1', source: { type: 'user', userId: 'U1' }, message: { type: 'text', id: 'm1', text: '/help' } }],
  });
  const badLine = await fetch(`${BASE}/api/line/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-line-signature': 'nope' },
    body: lineBody,
  });
  assert.equal(badLine.status, 401);

  // LINE: valid signature → reply with replyToken
  const sig = crypto.createHmac('sha256', LINE_SECRET).update(lineBody).digest('base64');
  const okLine = await fetch(`${BASE}/api/line/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-line-signature': sig },
    body: lineBody,
  });
  assert.equal(okLine.status, 200);
  assert.ok(await waitFor(() => calls.line.length === 1), 'ต้องตอบกลับ LINE');
  assert.equal(calls.line[0].body.replyToken, 'rt-1');
  assert.equal(calls.line[0].auth, 'Bearer line-token');
  assert.match(calls.line[0].body.messages[0].text, /\/clear/);

  // status records the exchanges
  const after = await (await fetch(`${BASE}/api/bots/status`)).json();
  assert.ok(after.recent.length >= 2);
  assert.ok(after.recent.every((r) => r.ok));
});

test('bot endpoints report not-configured without env', async (t) => {
  const port = PORT + 1;
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: { ...process.env, NO7_PORT: String(port), NO7_HOST: '127.0.0.1', TELEGRAM_BOT_TOKEN: '', LINE_CHANNEL_ACCESS_TOKEN: '', LINE_CHANNEL_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } });
  const base = `http://127.0.0.1:${port}`;
  const started = Date.now();
  while (Date.now() - started < 8000) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const status = await (await fetch(`${base}/api/bots/status`)).json();
  assert.equal(status.telegram.configured, false);
  assert.equal(status.line.configured, false);
  const tg = await fetch(`${base}/api/telegram/webhook`, { method: 'POST', body: '{}' });
  assert.equal(tg.status, 503);
  const line = await fetch(`${base}/api/line/webhook`, { method: 'POST', body: '{}' });
  assert.equal(line.status, 503);
});
