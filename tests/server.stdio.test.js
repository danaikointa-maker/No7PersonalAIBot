// Integration: companion server ↔ stdio MCP process (fixture)
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'mcp-stdio-server.mjs');
const PORT = 18000 + Math.floor(Math.random() * 2000);
const BASE = `http://127.0.0.1:${PORT}`;

let child = null;

async function waitForHealth(timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return await res.json();
    } catch { /* ยังไม่ขึ้น */ }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error('server did not start');
}

async function rpc(payload, extra = {}) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transport: 'stdio', server: 'fixture', payload, ...extra }),
  });
  return { status: res.status, body: await res.json() };
}

test('companion server bridges a stdio MCP process', async (t) => {
  child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NO7_PORT: String(PORT),
      NO7_HOST: '127.0.0.1',
      MCP_STDIO_SERVERS: JSON.stringify({ fixture: { command: process.execPath, args: [FIXTURE] } }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  t.after(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } });

  let health;
  try {
    health = await waitForHealth();
  } catch (e) {
    assert.fail(`server ไม่ขึ้น: ${e.message} ${stderr.slice(-300)}`);
  }
  assert.equal(health.ok, true);
  assert.ok(health.endpoints.includes('/api/mcp/stdio'));

  const list = await (await fetch(`${BASE}/api/mcp/stdio`)).json();
  assert.deepEqual(list.servers.map((s) => s.id), ['fixture']);
  assert.equal(list.servers[0].command, process.execPath);
  assert.equal(list.servers[0].env, undefined, 'ต้องไม่เปิดเผย env');

  const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
  assert.equal(init.status, 200);
  const initMsg = JSON.parse(init.body.body);
  assert.equal(initMsg.result.serverInfo.name, 'fixture');

  const tools = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const toolsMsg = JSON.parse(tools.body.body);
  assert.equal(toolsMsg.result.tools[0].name, 'echo');

  const call = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'echo', arguments: { text: 'สวัสดี' } } });
  const callMsg = JSON.parse(call.body.body);
  assert.equal(callMsg.result.content[0].text, 'echo: สวัสดี');

  const unknown = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/list' }, { server: 'nope' });
  assert.equal(unknown.status, 400);
  assert.match(unknown.body.error, /ไม่รู้จัก stdio MCP server/);

  const running = await (await fetch(`${BASE}/api/mcp/stdio`)).json();
  assert.equal(running.servers[0].running, true, 'process ต้องถูก cache ไว้');
});
