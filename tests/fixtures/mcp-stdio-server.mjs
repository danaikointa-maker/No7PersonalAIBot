// Minimal MCP server over stdio (newline-delimited JSON-RPC) — used by tests only.
process.stdin.setEncoding('utf8');
let buffer = '';

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id == null) continue; // notifications
    let result = {};
    if (msg.method === 'initialize') result = { protocolVersion: '2024-11-05', serverInfo: { name: 'fixture', version: '0.0.1' } };
    else if (msg.method === 'tools/list') {
      result = { tools: [{ name: 'echo', description: 'echo back text', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } }] };
    } else if (msg.method === 'tools/call') {
      result = { content: [{ type: 'text', text: `echo: ${msg.params?.arguments?.text || ''}` }] };
    } else {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `no method ${msg.method}` } });
      continue;
    }
    send({ jsonrpc: '2.0', id: msg.id, result });
  }
});

process.stdin.resume();
