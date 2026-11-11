// Integration: /api/tts proxy — OpenAI-compatible และ ElevenLabs (คืน mp3 + ซ่อน key)
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 28000 + Math.floor(Math.random() * 1200);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'no7-tts-'));

async function waitFor(fn, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 80));
  }
  return false;
}

function startMockUpstream() {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ url: req.url, headers: req.headers, body });
      if (req.url.startsWith('/v1/audio/speech')) {
        if (req.headers.authorization !== 'Bearer sk-openai') {
          res.writeHead(401, { 'content-type': 'application/json' });
          return res.end('{"error":"bad key"}');
        }
        res.writeHead(200, { 'content-type': 'audio/mpeg' });
        return res.end(Buffer.from('openai-mp3'));
      }
      if (req.url.startsWith('/v1/text-to-speech/')) {
        if (req.headers['xi-api-key'] !== 'el-key') {
          res.writeHead(401, { 'content-type': 'application/json' });
          return res.end('{"detail":"bad key"}');
        }
        res.writeHead(200, { 'content-type': 'audio/mpeg' });
        return res.end(Buffer.from('eleven-mp3'));
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"error":"not found"}');
    });
  });
  return new Promise((resolve) => {
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, seen }));
  });
}

test('/api/tts proxies openai-compatible and elevenlabs audio', async (t) => {
  const upstream = await startMockUpstream();
  t.after(() => { try { upstream.srv.close(); } catch { /* closed */ } });
  const up = `http://127.0.0.1:${upstream.port}`;

  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: { ...process.env, NO7_PORT: String(PORT), NO7_HOST: '127.0.0.1', NO7_DATA_DIR: DATA_DIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  t.after(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } });

  const ready = await waitFor(async () => {
    try { return (await fetch(`${BASE}/api/health`)).ok; } catch { return false; }
  });
  assert.ok(ready, `server ไม่ขึ้น ${stderr.slice(-300)}`);

  // --- openai-compatible branch ---
  const openaiRes = await fetch(`${BASE}/api/tts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'สวัสดี', voice: 'nova', model: 'tts-1', apiKey: 'sk-openai', baseUrl: `${up}/v1` }),
  });
  assert.equal(openaiRes.status, 200);
  assert.equal(openaiRes.headers.get('content-type'), 'audio/mpeg');
  assert.equal(Buffer.from(await openaiRes.arrayBuffer()).toString(), 'openai-mp3');
  const oa = upstream.seen.at(-1);
  assert.equal(oa.url, '/v1/audio/speech');
  assert.equal(oa.headers.authorization, 'Bearer sk-openai');
  const oaBody = JSON.parse(oa.body);
  assert.equal(oaBody.input, 'สวัสดี');
  assert.equal(oaBody.voice, 'nova');
  assert.equal(oaBody.response_format, 'mp3');

  // --- elevenlabs branch ---
  const elRes = await fetch(`${BASE}/api/tts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: 'elevenlabs', text: 'เสียงพรีเมียม', voice: 'TxGEqnHWrfWFTfGW9XjX',
      apiKey: 'el-key', baseUrl: `${up}/v1`,
    }),
  });
  assert.equal(elRes.status, 200);
  assert.equal(Buffer.from(await elRes.arrayBuffer()).toString(), 'eleven-mp3');
  const el = upstream.seen.at(-1);
  assert.equal(el.url, '/v1/text-to-speech/TxGEqnHWrfWFTfGW9XjX?output_format=mp3_44100_128');
  assert.equal(el.headers['xi-api-key'], 'el-key');
  const elBody = JSON.parse(el.body);
  assert.equal(elBody.text, 'เสียงพรีเมียม');
  assert.equal(elBody.model_id, 'eleven_multilingual_v2');
  assert.equal(elBody.voice_settings.similarity_boost, 0.75);

  // รหัสเสียงถูก encode ให้ปลอดภัย
  const encoded = await fetch(`${BASE}/api/tts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'elevenlabs', text: 'x', voice: 'a/b c', apiKey: 'el-key', baseUrl: `${up}/v1` }),
  });
  assert.equal(encoded.status, 200);
  assert.equal(upstream.seen.at(-1).url, '/v1/text-to-speech/a%2Fb%20c?output_format=mp3_44100_128');

  // --- errors ---
  const noKey = await fetch(`${BASE}/api/tts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'elevenlabs', text: 'x', baseUrl: `${up}/v1` }),
  });
  assert.equal(noKey.status, 400);
  assert.match((await noKey.json()).error, /ELEVENLABS_API_KEY/);

  const badKey = await fetch(`${BASE}/api/tts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'elevenlabs', text: 'x', apiKey: 'nope', baseUrl: `${up}/v1` }),
  });
  assert.equal(badKey.status, 502);
  assert.match((await badKey.json()).error, /provider 401/);

  const emptyText = await fetch(`${BASE}/api/tts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '' }),
  });
  assert.equal(emptyText.status, 400);

  const health = await (await fetch(`${BASE}/api/health`)).json();
  assert.equal(typeof health.aiKeys.elevenlabs, 'boolean');
});
