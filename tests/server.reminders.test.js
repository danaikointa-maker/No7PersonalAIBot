// Integration: server-side reminders (queue + Telegram push + recurrence advance)
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 22000 + Math.floor(Math.random() * 1500);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'no7-rem-'));

const sent = [];

function startMockTelegram() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        sent.push(JSON.parse(body || '{}'));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result: { message_id: sent.length } }));
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

async function waitFor(fn, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 80));
  }
  return false;
}

test('server queues reminders, pushes them to Telegram and advances recurring tasks', async (t) => {
  const mock = await startMockTelegram();
  t.after(() => { try { mock.srv.close(); } catch { /* closed */ } });

  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NO7_PORT: String(PORT),
      NO7_HOST: '127.0.0.1',
      NO7_DATA_DIR: DATA_DIR,
      NO7_REMINDER_TICK_MS: '150',
      TELEGRAM_BOT_TOKEN: 'tg-token',
      TELEGRAM_REMINDER_CHAT_ID: '999',
      TELEGRAM_API_BASE: `http://127.0.0.1:${mock.port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  t.after(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } });

  const up = await waitFor(async () => {
    try { return (await fetch(`${BASE}/api/health`)).ok; } catch { return false; }
  });
  assert.ok(up, `server ไม่ขึ้น ${stderr.slice(-300)}`);

  const health = await (await fetch(`${BASE}/api/health`)).json();
  assert.ok(health.endpoints.includes('/api/reminders'));

  const past = new Date(Date.now() - 60_000).toISOString();
  const future = new Date(Date.now() + 2 * 86400_000).toISOString();
  const put = await fetch(`${BASE}/api/reminders`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tasks: [
        { id: 'r-once', title: 'งานเลยเวลา', due: past, priority: 2, updatedAt: Date.now() },
        { id: 'r-daily', title: 'งานซ้ำทุกวัน', due: past, recurrence: 'daily', updatedAt: Date.now() },
        { id: 'r-future', title: 'งานอนาคต', due: future, updatedAt: Date.now() },
        { id: 'r-none', title: 'งานไม่มีเวลา', updatedAt: Date.now() },
      ],
    }),
  });
  assert.equal(put.status, 200);
  const putBody = await put.json();
  assert.equal(putBody.count, 3, 'เก็บเฉพาะงานที่มีเวลา');

  const status = await (await fetch(`${BASE}/api/reminders/status`)).json();
  assert.equal(status.count, 3);
  assert.equal(status.telegram.configured, true);
  assert.match(status.telegram.chatId, /^\*\*\*9{1,4}$/);
  assert.equal(status.tickMs, 150);

  const due = await (await fetch(`${BASE}/api/reminders/due`)).json();
  const dueIds = due.items.map((i) => i.id).sort();
  assert.deepEqual(dueIds, ['r-daily', 'r-once']);

  const upcoming = await (await fetch(`${BASE}/api/reminders/upcoming?days=7&limit=5`)).json();
  assert.ok(upcoming.items.some((i) => i.id === 'r-future'));

  // tick ควรส่ง Telegram ให้ทั้งสองงานที่ถึงเวลา
  const pushed = await waitFor(() => sent.length >= 2);
  assert.ok(pushed, `ยังไม่ส่ง telegram (${sent.length}) ${stderr.slice(-200)}`);
  const texts = sent.map((s) => s.text).join('\n');
  assert.match(texts, /งานเลยเวลา/);
  assert.match(texts, /งานซ้ำทุกวัน/);
  assert.equal(String(sent[0].chat_id), '999');

  // งานซ้ำต้องถูกเลื่อนไปอนาคตและพร้อมเตือนรอบใหม่
  let lastStatus = null;
  const advancedOk = await waitFor(async () => {
    const st = await (await fetch(`${BASE}/api/reminders/status`)).json();
    lastStatus = st;
    return st.due === 0 && st.next && st.next.id === 'r-daily'
      && Date.parse(st.next.due) > Date.now();
  });
  assert.ok(advancedOk, `รอบถัดไปของงานซ้ำต้องถูกเลื่อน ${JSON.stringify(lastStatus)}`);
  const after = await (await fetch(`${BASE}/api/reminders/status`)).json();
  assert.equal(after.due, 0, 'หลัง tick ต้องไม่มีงานค้างแจ้ง');
  assert.equal(after.count, 3);

  // ack ต้องไม่ทำให้เกิดการแจ้งซ้ำ
  const beforeAck = sent.length;
  const ack = await (await fetch(`${BASE}/api/reminders/ack`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: ['r-once', 'r-daily'] }),
  })).json();
  assert.equal(ack.ok, true);

  // เก็บลงดิสก์ในโฟลเดอร์ข้อมูล
  const file = path.join(DATA_DIR, 'reminders.json');
  assert.ok(fs.existsSync(file), 'ต้องบันทึก reminders.json');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.items.filter((i) => i.id === 'r-once')[0].pushedAt != null, true);

  await new Promise((r) => setTimeout(r, 400));
  assert.ok(sent.length >= beforeAck, 'ไม่ควรลดจำนวน');
  assert.equal(sent.length, beforeAck, 'ack แล้วต้องไม่แจ้งซ้ำ');
});
