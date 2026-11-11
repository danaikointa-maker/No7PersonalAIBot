// Integration: sync bundle validation, atomic persistence and in-memory fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 23500 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = 'integration-sync-token';

async function waitFor(predicate, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  return false;
}

async function startServer(dataDir) {
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: { ...process.env, NO7_PORT: String(PORT), NO7_HOST: '127.0.0.1', NO7_DATA_DIR: dataDir, NO7_SYNC_TOKEN: TOKEN },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const ready = await waitFor(async () => {
    try { return (await fetch(`${BASE}/api/health`)).ok; } catch { return false; }
  });
  assert.ok(ready, `server did not start: ${stderr.slice(-300)}`);
  return child;
}

async function stopServer(child) {
  if (child.exitCode != null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  if (child.exitCode == null) child.kill('SIGKILL');
}

function syncRequest(method, body) {
  return fetch(`${BASE}/api/sync`, {
    method,
    headers: { 'X-No7-Sync': TOKEN, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test('sync PUT rejects invalid collection shapes without replacing valid data; atomic file survives restart', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no7-sync-atomic-'));
  let child = await startServer(dataDir);
  t.after(async () => { await stopServer(child); fs.rmSync(dataDir, { recursive: true, force: true }); });

  const bundle = { version: 1, updatedAt: '2026-11-10T00:00:00.000Z', memory: { facts: [] }, notes: [], todos: [], reminders: [] };
  const put = await syncRequest('PUT', bundle);
  assert.equal(put.status, 200);
  assert.equal((await put.json()).persisted, true);

  for (const invalid of [null, [], 'not a bundle', {}, { tasks: {} }, { memory: { facts: 'bad' } }, { settings: [] }]) {
    const rejected = await syncRequest('PUT', invalid);
    assert.equal(rejected.status, 400);
  }
  const current = await (await syncRequest('GET')).json();
  assert.equal(current.version, 1);
  assert.deepEqual(current.reminders, []);

  await stopServer(child);
  child = await startServer(dataDir);
  const afterRestart = await (await syncRequest('GET')).json();
  assert.equal(afterRestart.updatedAt, bundle.updatedAt);
  assert.ok(afterRestart.serverAt);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'sync.json'), 'utf8')), afterRestart);
});

test('sync remains readable in process memory if data directory is unwritable', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'no7-sync-fallback-'));
  const dataDir = path.join(root, 'not-a-directory');
  fs.writeFileSync(dataDir, 'blocks directory creation');
  const child = await startServer(dataDir);
  t.after(async () => { await stopServer(child); fs.rmSync(root, { recursive: true, force: true }); });

  const bundle = { version: 1, memory: { facts: [{ text: 'kept in RAM' }] }, notes: [], todos: [] };
  const put = await syncRequest('PUT', bundle);
  assert.equal(put.status, 200);
  assert.equal((await put.json()).persisted, false);
  const fetched = await syncRequest('GET');
  assert.equal(fetched.status, 200);
  assert.deepEqual((await fetched.json()).memory.facts, [{ text: 'kept in RAM' }]);
  assert.equal((await syncRequest('PUT', { tasks: 'invalid' })).status, 400);
  assert.deepEqual((await (await syncRequest('GET')).json()).memory.facts, [{ text: 'kept in RAM' }]);
});
