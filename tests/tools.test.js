import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
})();
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.dispatchEvent = globalThis.dispatchEvent || (() => true);

const { TOOLS, TOOL_IDS, describeTools, extractToolCall, stripToolCalls, runTool } = await import('../web/src/core/tools.js');

test('registry exposes the v0.2 tool set', () => {
  const expected = ['weather', 'air', 'crypto', 'fx', 'gold', 'wiki', 'news', 'calc',
    'timer', 'reminder', 'todo', 'note', 'memory_save', 'memory_search',
    'open_url', 'clipboard_copy', 'compose_message', 'open_app', 'system_info'];
  for (const id of expected) assert.ok(TOOL_IDS.includes(id), `missing ${id}`);
});

test('describeTools lists every tool with params', () => {
  const text = describeTools();
  for (const id of TOOL_IDS) assert.ok(text.includes(`- ${id} [`), `prompt missing ${id}`);
});

test('extractToolCall parses a fenced tool block', () => {
  const call = extractToolCall('คิดอยู่\n```tool\n{"tool":"weather","args":{"city":"Chiang Mai"}}\n```');
  assert.deepEqual(call, { name: 'weather', args: { city: 'Chiang Mai' } });
});

test('extractToolCall returns null for plain prose', () => {
  assert.equal(extractToolCall('สวัสดีครับ วันนี้อากาศดี'), null);
});

test('stripToolCalls removes the block but keeps prose', () => {
  const out = stripToolCalls('กำลังดูให้\n```tool\n{"tool":"air"}\n```\nรอสักครู่');
  assert.equal(out.includes('```'), false);
  assert.ok(out.includes('กำลังดูให้'));
});

test('local tools: todo add + list, note add, timer schedules', async () => {
  const add = await runTool('todo', { action: 'add', text: 'จ่ายค่าไฟ' });
  assert.equal(add.data.big, '1 รายการ');

  const list = await runTool('todo', { action: 'list' });
  assert.ok(list.data.lines.some((l) => l.includes('จ่ายค่าไฟ')));

  const note = await runTool('note', { text: 'ความคิดดีๆ' });
  assert.equal(note.data.big, '1 โน้ต');

  const timer = await runTool('timer', { seconds: 1, label: 'ทดสอบ' });
  assert.equal(timer.data.big, '1 วินาที');
});

test('unknown tool throws a Thai error', async () => {
  await assert.rejects(() => runTool('nope', {}), /ไม่มีเครื่องมือชื่อ/);
});
