// Integration: /api/local-models proxies probe + warm และจำกัดปลายทาง (SSRF guard)
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 30000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'no7-local-'));

async function waitFor(fn, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 80));
  }
  return false;
}

function startFakeOllama() {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ url: req.url, body });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/api/tags') {
        return res.end(JSON.stringify({ models: [{ name: 'llama3.1:latest', size: 4_000_000_000, details: { family: 'llama' } }] }));
      }
      if (req.url === '/api/chat') {
        return res.end(JSON.stringify({ message: { role: 'assistant', content: 'ok' } }));
      }
      res.statusCode = 404;
      res.end('{"error":"nope"}');
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, seen })));
}

test('local model probe + warm through the server proxy', async (t) => {
  const fake = await startFakeOllama();
  t.after(() => { try { fake.srv.close(); } catch { /* closed */ } });

  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: { ...process.env, NO7_PORT: String(PORT), NO7_HOST: '127.0.0.1', NO7_DATA_DIR: DATA_DIR },
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
  assert.ok(health.endpoints.includes('/api/local-models'));
  assert.ok(health.endpoints.includes('/api/local-models/warm'));

  const baseUrl = `http://127.0.0.1:${fake.port}`;
  const probe = await (await fetch(`${BASE}/api/local-models`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ targets: [{ kind: 'ollama', baseUrl }] }),
  })).json();
  assert.equal(probe.ok, true);
  assert.equal(probe.models.length, 1);
  assert.equal(probe.models[0].id, 'llama3.1:latest');
  assert.equal(probe.best.ok, true);
  assert.equal(fake.seen.at(-1).url, '/api/tags');

  const warm = await (await fetch(`${BASE}/api/local-models/warm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'ollama', baseUrl, model: 'llama3.1' }),
  })).json();
  assert.equal(warm.ok, true);
  assert.equal(warm.model, 'llama3.1');
  assert.equal(JSON.parse(fake.seen.at(-1).body).model, 'llama3.1');

  // SSRF guard: ปลายทางนอกวง LAN ถูกปฏิเสธ
  const remote = await fetch(`${BASE}/api/local-models`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ targets: [{ kind: 'ollama', baseUrl: 'http://example.com:11434' }] }),
  });
  assert.equal(remote.status, 403);
  assert.match((await remote.json()).error, /NO7_LOCAL_ALLOW_REMOTE/);

  const remoteWarm = await fetch(`${BASE}/api/local-models/warm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'ollama', baseUrl: 'http://8.8.8.8:11434', model: 'x' }),
  });
  assert.equal(remoteWarm.status, 403);

  const badUrl = await fetch(`${BASE}/api/local-models`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ targets: [{ kind: 'ollama', baseUrl: 'file:///etc/passwd' }] }),
  });
  assert.equal(badUrl.status, 400);

  const noModel = await fetch(`${BASE}/api/local-models/warm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'ollama', baseUrl, model: '' }),
  });
  assert.equal(noModel.status, 502);
});
