import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
})();
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.dispatchEvent = () => true;
globalThis.open = () => ({ closed: false });                       // browser stub for open_url
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText: async () => {} }, onLine: true },
  configurable: true,
});

const { Agent } = await import('../web/src/core/agent.js');
const { MemoryStore } = await import('../web/src/core/memory.js');
const { getPersona } = await import('../web/src/core/personas.js');
const { DEFAULT_PERMISSIONS, isAllowed, needsConfirm, permissionSummary } = await import('../web/src/core/permissions.js');
const { toolsForMode, detectMode, MODE_IDS } = await import('../web/src/core/modes.js');

const baseSettings = (patch = {}) => ({
  persona: 'no7',
  language: 'th',
  polite: true,
  mode: 'auto',
  permissions: DEFAULT_PERMISSIONS,
  ...patch,
});

/** Fake chat that replays a scripted list of replies. */
function scriptedChat(replies) {
  let i = 0;
  const seen = [];
  return {
    seen,
    chat: async (messages) => {
      seen.push(messages[messages.length - 1].content);
      return replies[Math.min(i++, replies.length - 1)];
    },
  };
}

test('plain answer: one step, no tools', async () => {
  const fake = scriptedChat(['สวัสดีครับ มีอะไรให้ช่วยไหม']);
  const agent = new Agent({ chat: fake.chat, memory: new MemoryStore(), settings: baseSettings() });
  const res = await agent.run('สวัสดี', { persona: getPersona('no7') });
  assert.equal(res.steps, 1);
  assert.equal(res.trace.length, 0);
  assert.match(res.text, /สวัสดี/);
});

test('multi-step: two tools in a row then final answer', async () => {
  const fake = scriptedChat([
    '```tool\n{"tool":"calc","args":{"expression":"18*7"}}\n```',
    '```tool\n{"tool":"calc","args":{"expression":"126+3"}}\n```',
    'ได้ 129 ครับ',
  ]);
  const events = [];
  const agent = new Agent({ chat: fake.chat, memory: new MemoryStore(), settings: baseSettings(), onEvent: (e) => events.push(e.type) });
  const res = await agent.run('18*7 แล้วบวก 3', { persona: getPersona('no7') });
  assert.equal(res.steps, 3);
  assert.equal(res.trace.length, 2);
  assert.equal(res.text, 'ได้ 129 ครับ');
  assert.deepEqual(events.filter((e) => e === 'tool').length, 2);
  assert.ok(fake.seen[2].includes('ผลลัพธ์จากเครื่องมือ calc'));
});

test('stops at maxSteps instead of looping forever', async () => {
  const fake = scriptedChat(['```tool\n{"tool":"calc","args":{"expression":"1+1"}}\n```']);
  const agent = new Agent({ chat: fake.chat, memory: new MemoryStore(), settings: baseSettings(), maxSteps: 3 });
  const res = await agent.run('วนไปเรื่อยๆ', { persona: getPersona('no7') });
  assert.equal(res.steps, 3);
  assert.equal(res.trace.length, 3);
  assert.ok(res.text.length > 0); // synthesized summary
});

test('confirm() is called for risky tools and a "no" stops the run', async () => {
  const fake = scriptedChat(['```tool\n{"tool":"open_app","args":{"target":"Calculator"}}\n```', 'ไม่เป็นไรครับ']);
  let asked = null;
  const agent = new Agent({
    chat: fake.chat,
    memory: new MemoryStore(),
    settings: baseSettings(),
    confirm: async (req) => { asked = req; return false; },
  });
  const res = await agent.run('เปิดเครื่องคิดเลข', { persona: getPersona('no7') });
  assert.ok(asked, 'confirm was not called');
  assert.equal(asked.tool, 'open_app');
  assert.equal(asked.meta.category, 'control');
  assert.equal(res.trace.length, 0);
  assert.match(res.text, /ไม่ได้ทำอะไรต่อ/);
});

test('confirm() yes lets the risky tool run', async () => {
  const fake = scriptedChat(['```tool\n{"tool":"open_url","args":{"url":"https://example.com"}}\n```', 'เปิดให้แล้วครับ']);
  const agent = new Agent({ chat: fake.chat, memory: new MemoryStore(), settings: baseSettings(), confirm: async () => true });
  const res = await agent.run('เปิด example.com', { persona: getPersona('no7') });
  assert.equal(res.trace.length, 1);
  assert.equal(res.trace[0].tool, 'open_url');
  assert.equal(res.text, 'เปิดให้แล้วครับ');
});

test('blocked category is never executed and is reported to the model', async () => {
  const fake = scriptedChat(['```tool\n{"tool":"compose_message","args":{"to":"a@b.c","body":"hi"}}\n```', 'ต้องเปิดสิทธิ์ก่อนครับ']);
  const settings = baseSettings({ permissions: { autonomy: 'ask-risky', allow: { ...DEFAULT_PERMISSIONS.allow, message: false } } });
  const agent = new Agent({ chat: fake.chat, memory: new MemoryStore(), settings, confirm: async () => true });
  const res = await agent.run('ส่งอีเมลหา a', { persona: getPersona('no7') });
  assert.equal(res.trace.length, 0);
  assert.deepEqual(res.blocked, ['message']);
  assert.ok(fake.seen[1].includes('ปิดสิทธิ์'));
});

test('unknown tool name is rejected but the loop continues', async () => {
  const fake = scriptedChat(['```tool\n{"tool":"do_everything","args":{}}\n```', 'ขอโทษครับ ไม่มีเครื่องมือนั้น']);
  const agent = new Agent({ chat: fake.chat, memory: new MemoryStore(), settings: baseSettings() });
  const res = await agent.run('ทำทุกอย่าง', { persona: getPersona('no7') });
  assert.equal(res.trace.length, 0);
  assert.match(res.text, /ไม่มีเครื่องมือนั้น/);
});

test('tool failure is surfaced and the run still ends with text', async () => {
  const fake = scriptedChat(['```tool\n{"tool":"wiki","args":{}}\n```', 'ต้องระบุคำค้นครับ']);
  const agent = new Agent({ chat: fake.chat, memory: new MemoryStore(), settings: baseSettings() });
  const res = await agent.run('ค้นวิกิ', { persona: getPersona('no7') });
  assert.equal(res.trace.length, 0);
  assert.match(res.text, /ต้องระบุคำค้น/);
});

test('memory retrieval feeds the system prompt', async () => {
  const mem = new MemoryStore();
  mem.addFact('ผู้ใช้มีแมวชื่อมีโจ');
  let firstPrompt = '';
  const agent = new Agent({
    chat: async (messages) => { firstPrompt = messages[0].content; return 'แมวคุณชื่อมีโจครับ'; },
    memory: mem,
    settings: baseSettings(),
  });
  await agent.run('แมวฉันชื่ออะไร', { persona: getPersona('no7') });
  assert.ok(firstPrompt.includes('ผู้ใช้มีแมวชื่อมีโจ'), 'fact missing from system prompt');
  assert.ok(firstPrompt.includes('บทบาทปัจจุบัน'));
});

test('permission helpers: defaults allow everything but ask on risky', () => {
  assert.equal(isAllowed('weather', DEFAULT_PERMISSIONS), true);
  assert.equal(needsConfirm('weather', DEFAULT_PERMISSIONS), false);
  assert.equal(needsConfirm('timer', DEFAULT_PERMISSIONS), true);
  assert.equal(needsConfirm('compose_message', DEFAULT_PERMISSIONS), true);
  assert.equal(needsConfirm('open_app', { ...DEFAULT_PERMISSIONS, autonomy: 'allow-all' }), false);
  assert.equal(isAllowed('open_app', { autonomy: 'ask-risky', allow: { control: false } }), false);
  assert.ok(permissionSummary(DEFAULT_PERMISSIONS).text.includes('ถามเมื่อเสี่ยง'));
});

test('modes partition the tool set', () => {
  assert.equal(MODE_IDS.length, 5);
  const hub = toolsForMode('hub');
  assert.ok(hub.includes('open_app'), 'hub ต้องมี control tools');
  assert.ok(!hub.includes('compose_message'), 'hub ไม่ควรมีเครื่องมือร่างข้อความ');
  const companion = toolsForMode('companion');
  assert.ok(!companion.includes('open_app'), 'companion ไม่ควรควบคุมเครื่อง');
  assert.ok(companion.includes('weather'), 'companion ยังอ่านข้อมูลได้');
  const all = toolsForMode('auto');
  assert.equal(all.length, 25, 'auto ต้องได้ทุกเครื่องมือ');
  assert.equal(detectMode('ช่วยเปิดโปรแกรม Lightroom ให้หน่อย'), 'hub');
  assert.equal(detectMode('วันนี้เครียดมากเลย'), 'companion');
});
