import test from 'node:test';
import assert from 'node:assert/strict';

import {
  McpClient, McpRegistry, McpError, MCP_PROTOCOL_VERSION, mcpToolId, parseMcpBody, flattenToolResult,
} from '../web/src/core/mcp.js';
import { registerDynamicTools, getTool, toolMeta, describeTools } from '../web/src/core/tools.js';
import { isAllowed, needsConfirm, CATEGORIES } from '../web/src/core/permissions.js';

/** fetch ปลอมที่ตอบ JSON-RPC ตามที่ขอ */
function rpcFetch(handler, { ok = true, contentType = 'application/json' } = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const payload = JSON.parse(init.body || '{}');
    const request = payload.payload || payload; // proxy ห่อมาอีกชั้น
    calls.push({ url, request, headers: init.headers });
    const result = handler(request);
    const body = JSON.stringify({ jsonrpc: '2.0', id: request.id, ...result });
    if (url.endsWith('/api/mcp') || url.includes('/api/mcp')) {
      return { ok: true, json: async () => ({ status: 200, contentType, headers: {}, body }) };
    }
    return {
      ok, status: ok ? 200 : 500,
      text: async () => body,
      headers: { get: () => null },
    };
  };
  fn.calls = calls;
  return fn;
}

const toolsList = { result: { tools: [{ name: 'send_email', description: 'ส่งอีเมล', inputSchema: { type: 'object', properties: { to: { type: 'string' } } } }] } };

test('mcpToolId makes safe ids', () => {
  assert.equal(mcpToolId('Gmail Server', 'send_email'), 'mcp__gmail-server__send_email');
  assert.equal(mcpToolId('Gmail', 'send email!'), 'mcp__gmail__send-email');
  assert.match(mcpToolId('', ''), /^mcp__x__x$/);
});

test('parseMcpBody reads plain json and sse frames', () => {
  assert.deepEqual(parseMcpBody('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}').result, { ok: true });
  const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"a":1}}\n\n';
  assert.deepEqual(parseMcpBody(sse, 2).result, { a: 1 });
  assert.equal(parseMcpBody(''), null);
});

test('flattenToolResult builds a card', () => {
  const card = flattenToolResult({ content: [{ type: 'text', text: 'ส่งแล้ว\nถึงคุณเอ' }] });
  assert.equal(card.big, 'ส่งแล้ว');
  assert.deepEqual(card.lines, ['ถึงคุณเอ']);
  assert.equal(flattenToolResult({ content: [], isError: true }).isError, true);
});

test('client handshakes, lists tools and calls one via the proxy', async () => {
  const fetchImpl = rpcFetch((req) => {
    if (req.method === 'initialize') return { result: { protocolVersion: MCP_PROTOCOL_VERSION, serverInfo: { name: 'fake' } } };
    if (req.method === 'tools/list') return toolsList;
    if (req.method === 'tools/call') return { result: { content: [{ type: 'text', text: 'ok' }] } };
    return { result: {} };
  });
  const client = new McpClient({ id: 'fake', url: 'http://mcp.local/mcp', serverUrl: () => 'http://srv', fetchImpl });
  const info = await client.initialize();
  assert.equal(info.name, 'fake');
  const tools = await client.listTools();
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'send_email');
  const result = await client.callTool('send_email', { to: 'a@b.c' });
  assert.equal(result.content[0].text, 'ok');
  assert.equal(fetchImpl.calls[0].url, 'http://srv/api/mcp');
  assert.equal(fetchImpl.calls[0].request.params.protocolVersion, MCP_PROTOCOL_VERSION);
  const call = fetchImpl.calls.at(-1).request;
  assert.equal(call.method, 'tools/call');
  assert.deepEqual(call.params, { name: 'send_email', arguments: { to: 'a@b.c' } });
});

test('json-rpc errors become McpError with code', async () => {
  const fetchImpl = rpcFetch((req) => (req.method === 'tools/list'
    ? { error: { code: -32601, message: 'method not found' } }
    : { result: {} }));
  const client = new McpClient({ url: 'http://mcp.local/mcp', serverUrl: () => 'http://srv', fetchImpl });
  await assert.rejects(() => client.listTools(), (err) => {
    assert.ok(err instanceof McpError);
    assert.equal(err.code, -32601);
    assert.match(err.message, /method not found/);
    return true;
  });
});

test('proxy failure falls back to a direct call', async () => {
  const direct = rpcFetch(() => ({ result: { tools: [] } }));
  let first = true;
  const fetchImpl = async (url, init) => {
    if (first) { first = false; throw new Error('ECONNREFUSED'); }
    return direct(url, init);
  };
  const client = new McpClient({ url: 'http://mcp.local/mcp', serverUrl: () => 'http://srv', fetchImpl });
  client.initialized = true;
  const tools = await client.listTools();
  assert.deepEqual(tools, []);
  assert.equal(direct.calls[0].url, 'http://mcp.local/mcp');
});

test('registry connects servers, builds tool defs and runs them', async () => {
  const fetchImpl = rpcFetch((req) => {
    if (req.method === 'tools/list') return toolsList;
    if (req.method === 'tools/call') return { result: { content: [{ type: 'text', text: 'ส่งอีเมลแล้ว' }] } };
    return { result: { serverInfo: { name: 'Gmail' } } };
  });
  const settings = { mcpServers: [{ id: 'gmail', name: 'Gmail', url: 'http://mcp.local/mcp', enabled: true }] };
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const reg = new McpRegistry({ settings: () => settings, serverUrl: () => 'http://srv', fetchImpl, storage });
  const results = await reg.refresh();
  assert.equal(results[0].ok, true);
  assert.equal(results[0].count, 1);
  assert.ok(store.get('no7.mcp.tools.v1').includes('send_email'));

  const defs = reg.toolDefs();
  const id = mcpToolId('gmail', 'send_email');
  assert.ok(defs[id]);
  assert.equal(defs[id].meta.category, 'mcp');
  assert.equal(defs[id].params.to, 'string');
  const out = await defs[id].run({ to: 'a@b.c' });
  assert.equal(out.big, 'ส่งอีเมลแล้ว');

  const status = reg.status();
  assert.equal(status.totalTools, 1);
  assert.equal(status.servers[0].serverName, 'Gmail');
});

test('registry falls back to cached tools when a server is down', async () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  store.set('no7.mcp.tools.v1', JSON.stringify({ gmail: { tools: [{ name: 'send_email', description: 'cached' }], at: 1 } }));
  const reg = new McpRegistry({
    settings: () => ({ mcpServers: [{ id: 'gmail', name: 'Gmail', url: 'http://down/mcp' }] }),
    serverUrl: () => 'http://srv',
    fetchImpl: async () => { throw new Error('boom'); },
    storage,
  });
  const results = await reg.refresh();
  assert.equal(results[0].ok, false);
  assert.equal(results[0].cached, true);
  assert.equal(Object.keys(reg.toolDefs()).length, 1);
  assert.equal(reg.hydrateFromCache(), 1);
});

test('dynamic MCP tools are visible to agent + permissions', () => {
  registerDynamicTools({
    'mcp__gmail__send-email': {
      emoji: '🔌', label: 'Gmail: send_email', desc: 'ส่งอีเมล', params: { to: 'string' },
      meta: { category: 'mcp', risk: 2 },
      run: async () => ({ title: 'x', big: 'y', lines: [] }),
    },
  });
  try {
    const def = getTool('mcp__gmail__send-email');
    assert.equal(def.label, 'Gmail: send_email');
    assert.deepEqual(toolMeta('mcp__gmail__send-email'), { category: 'mcp', risk: 2 });
    assert.match(describeTools(), /mcp__gmail__send-email/);
    assert.ok(CATEGORIES.mcp);
    assert.equal(isAllowed('mcp__gmail__send-email', undefined), true);
    assert.equal(needsConfirm('mcp__gmail__send-email', undefined), true);
    assert.equal(isAllowed('mcp__gmail__send-email', { allow: { mcp: false } }), false);
  } finally {
    registerDynamicTools({});
  }
});
