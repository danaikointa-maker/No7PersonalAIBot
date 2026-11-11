// Integration: Phone-Link ครบวงจร — hello (capabilities), eyes (emotion for the ESP32 screen),
// voice (base64 chunks → queue → ack). ทุกคำขอต้องเซ็น HMAC เหมือนของจริง
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 24000 + Math.floor(Math.random() * 1500);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'no7-link-'));

async function waitFor(fn, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 80));
  }
  return false;
}

function signer(secret) {
  return (method, pathname, body = '') =>
    crypto.createHmac('sha256', Buffer.from(secret)).update(`${method}\n${pathname}\n${body}`).digest('hex');
}

test('Phone-Link: hello, eyes and voice work end-to-end with HMAC', async (t) => {
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NO7_PORT: String(PORT),
      NO7_HOST: '127.0.0.1',
      NO7_DATA_DIR: DATA_DIR,
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
  for (const route of ['/api/link/hello', '/api/link/eyes', '/api/link/voice', '/api/link/voice/ack', '/api/link/voice/status']) {
    assert.ok(health.endpoints.includes(route), `health ต้องมี ${route}`);
  }

  const pair = await (await fetch(`${BASE}/api/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'esp32-s3' }),
  })).json();
  assert.match(pair.code, /^\d{6}$/);
  const sign = signer(pair.secret);

  const call = async (method, pathname, body = null) => {
    const raw = body === null ? '' : JSON.stringify(body);
    const res = await fetch(`${BASE}${pathname}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'X-No7-Code': pair.code,
        'X-No7-Signature': sign(method, pathname.split('?')[0], raw),
      },
      body: method === 'GET' ? undefined : raw,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  // --- auth guard -------------------------------------------------------
  const unsigned = await fetch(`${BASE}/api/link/hello`, { method: 'POST', body: '{}' });
  assert.equal(unsigned.status, 401);
  const forged = await fetch(`${BASE}/api/link/hello`, {
    method: 'POST',
    headers: { 'X-No7-Code': pair.code, 'X-No7-Signature': 'f'.repeat(64) },
    body: '{"name":"evil"}',
  });
  assert.equal(forged.status, 401);

  // --- 13.1 hello -------------------------------------------------------
  const hello = await call('POST', '/api/link/hello', {
    name: 'จอโต๊ะทำงาน',
    kind: 'esp32',
    firmware: 'no7-1.5',
    capabilities: { mic: true, speaker: true, eyes: true, screen: true, buttons: true, voice: false, bogus: 'yes' },
  });
  assert.equal(hello.status, 200);
  assert.equal(hello.body.protocol, 'no7-link/1');
  assert.deepEqual(hello.body.device.capabilities, {
    mic: true, speaker: true, eyes: true, screen: true, buttons: true, voice: false,
  });
  assert.equal(hello.body.device.name, 'จอโต๊ะทำงาน');
  assert.ok(hello.body.features.includes('eyes'));
  assert.equal(hello.body.eyesTtlMs, 15000);
  assert.equal(hello.body.persisted, true);

  const info = await call('GET', '/api/link/hello');
  assert.equal(info.status, 200);
  assert.equal(info.body.device.code, pair.code);
  assert.equal(info.body.device.firmware, 'no7-1.5');

  const saved = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'devices.json'), 'utf8'));
  assert.equal(saved[pair.code].name, 'จอโต๊ะทำงาน');

  // hello ซ้ำด้วยข้อมูลบางส่วน → ต้องคงค่าเดิมไว้
  const hello2 = await call('POST', '/api/link/hello', { name: 'จอใหม่' });
  assert.equal(hello2.body.device.name, 'จอใหม่');
  assert.equal(hello2.body.device.capabilities.mic, true, 'capabilities เดิมต้องไม่หาย');
  assert.equal(hello2.body.device.firstSeen, hello.body.device.firstSeen);

  // --- 13.2 eyes --------------------------------------------------------
  const empty = await call('GET', '/api/link/eyes');
  assert.equal(empty.body.eyes, null);

  const bad = await call('POST', '/api/link/eyes', { intensity: 50 });
  assert.equal(bad.status, 400);

  const eyes = await call('POST', '/api/link/eyes', { emotion: 'happy', intensity: 250, ttlMs: 20_000, text: 'ยิ้มหน่อย' });
  assert.equal(eyes.status, 200);
  assert.equal(eyes.body.eyes.intensity, 100, 'clamp 0–100');
  assert.equal(eyes.body.eyes.mood, 'happy');
  assert.equal(eyes.body.eyes.ttlMs, 20_000);

  const latest = await call('GET', '/api/link/eyes');
  assert.equal(latest.body.eyes.emotion, 'happy');
  assert.equal(latest.body.eyes.text, 'ยิ้มหน่อย');
  assert.equal(latest.body.eyes.stale, false);

  const forced = await call('GET', '/api/link/eyes?ttlMs=1');
  assert.equal(forced.body.eyes.stale, true, 'ttl สั้น ๆ ต้องกลายเป็น stale');

  // --- 13.3 voice -------------------------------------------------------
  const bytes = Buffer.from('OggS-fake-opus-data');
  const chunk1 = await call('POST', '/api/link/voice', {
    chunk: bytes.toString('base64'), mime: 'audio/ogg', seq: 1, final: false,
  });
  assert.equal(chunk1.status, 200);
  assert.equal(chunk1.body.seq, 1);
  assert.equal(chunk1.body.bytes, bytes.length);

  const chunk2 = await call('POST', '/api/link/voice', {
    chunk: Buffer.from('second-chunk').toString('base64'), mime: 'audio/ogg', final: true,
  });
  assert.equal(chunk2.body.seq, 2, 'ไม่ใส่ seq = ต่อจากของเดิม');

  const statusVoice = await call('GET', '/api/link/voice/status');
  assert.equal(statusVoice.body.chunks, 2);
  assert.equal(statusVoice.body.lastSeq, 2);
  assert.equal(statusVoice.body.final, true);
  assert.equal(statusVoice.body.bytes, bytes.length + 'second-chunk'.length);

  const pull = await call('GET', '/api/link/voice?since=0');
  assert.equal(pull.body.chunks.length, 2);
  assert.deepEqual(Buffer.from(pull.body.chunks[0].chunk, 'base64').toString(), 'OggS-fake-opus-data');
  assert.equal(pull.body.final, true);

  const partial = await call('GET', '/api/link/voice?since=1');
  assert.deepEqual(partial.body.chunks.map((c) => c.seq), [2]);

  const ack = await call('POST', '/api/link/voice/ack', { upto: 2 });
  assert.equal(ack.body.removed, 2);
  assert.equal(ack.body.chunks, 0);
  const afterAck = await call('GET', '/api/link/voice');
  assert.equal(afterAck.body.chunks.length, 0);

  const badMime = await call('POST', '/api/link/voice', { chunk: 'AAAA', mime: 'text/plain' });
  assert.equal(badMime.status, 415);
  const badChunk = await call('POST', '/api/link/voice', { chunk: '####' });
  assert.equal(badChunk.status, 400);

  // --- status รวมทุกอย่าง ------------------------------------------------
  await call('POST', '/api/link/eyes', { emotion: 'sleepy', ttlMs: 5000 });
  const st = await call('GET', '/api/link/status');
  assert.equal(st.body.online, true);
  assert.equal(st.body.device.name, 'จอใหม่');
  assert.equal(st.body.eyes.emotion, 'sleepy');
  assert.deepEqual(st.body.voice, { chunks: 0, bytes: 0, dropped: 0 });
});
