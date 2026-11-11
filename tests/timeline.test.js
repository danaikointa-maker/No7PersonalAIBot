// Timeline ของ agent: mapping event → ขั้นตอน, สรุปผล, และการยกเลิกกลางทาง
import test from 'node:test';
import assert from 'node:assert/strict';

import { AgentTimeline, statusIcon, timelineTitle, STEP_STATUSES } from '../web/src/core/timeline.js';
import { Agent } from '../web/src/core/agent.js';
import { getPersona } from '../web/src/core/personas.js';
import { DEFAULT_PERMISSIONS } from '../web/src/core/permissions.js';

function fakeClock(start = 1000, step = 100) {
  let now = start;
  const clock = () => now;
  clock.tick = () => { now += step; };
  clock.advance = (ms) => { now += ms; };
  return clock;
}

test('status icons cover every status', () => {
  for (const s of STEP_STATUSES) assert.ok(statusIcon(s), `ขาด icon ของ ${s}`);
  assert.equal(statusIcon('unknown'), '•');
  assert.equal(timelineTitle('th'), 'ขั้นตอนการทำงาน');
  assert.equal(timelineTitle('en'), 'Working steps');
});

test('an empty timeline has no steps and a neutral headline', () => {
  const tl = new AgentTimeline({ maxSteps: 4 });
  assert.equal(tl.steps.length, 0);
  assert.equal(tl.active, false);
  assert.equal(tl.running, false);
  assert.match(tl.headline(), /ยังไม่มีขั้นตอน/);
  assert.match(tl.toMarkdown(), /neutral|ขั้น|step|ยังไม่มี/i);
});

test('thinking → tool → result produces one ok step per tool', () => {
  const clock = fakeClock();
  const tl = new AgentTimeline({ maxSteps: 4, clock }).start();

  tl.push({ type: 'thinking', step: 1 });
  assert.equal(tl.steps.length, 1);
  assert.equal(tl.steps[0].kind, 'thinking');
  assert.equal(tl.steps[0].status, 'running');
  assert.match(tl.steps[0].label, /ขั้น 1\/4/);

  clock.tick();
  tl.push({ type: 'tool', step: 1, tool: 'weather', label: 'อากาศ', emoji: '🌤' });
  assert.equal(tl.steps.length, 2);
  assert.equal(tl.steps[0].status, 'ok', 'thinking ถูกปิดเมื่อเริ่มเครื่องมือ');
  assert.equal(tl.steps[0].ms, 100);
  assert.equal(tl.steps[1].status, 'running');
  assert.match(tl.steps[1].label, /🌤 อากาศ/);

  clock.tick();
  tl.push({ type: 'result', step: 1, tool: 'weather', data: { title: 'กรุงเทพฯ 32°C' } });
  assert.equal(tl.steps.length, 2, 'ผลลัพธ์ไม่สร้างขั้นใหม่');
  assert.equal(tl.steps[1].status, 'ok');
  assert.equal(tl.steps[1].title, 'กรุงเทพฯ 32°C');

  tl.finish();
  const sum = tl.summary();
  assert.equal(sum.total, 2);
  assert.equal(sum.ok, 2);
  assert.deepEqual(sum.tools, ['weather']);
  assert.equal(sum.ms, 200);
  assert.equal(tl.active, false);
  assert.match(tl.headline(), /เสร็จใน 2 ขั้น/);
});

test('result without a running tool still records a step', () => {
  const tl = new AgentTimeline().start();
  tl.push({ type: 'result', data: { big: 'ทอง 40,000' } });
  assert.equal(tl.steps.length, 1);
  assert.equal(tl.steps[0].status, 'ok');
  assert.match(tl.toMarkdown(), /ทอง 40,000/);
});

test('denied and error steps are visible and counted', () => {
  const tl = new AgentTimeline().start();
  tl.push({ type: 'tool', step: 1, tool: 'open_app', label: 'เปิดแอป', emoji: '🖥' });
  tl.push({ type: 'denied', step: 1, tool: 'open_app', reason: 'user-declined' });
  assert.equal(tl.steps.length, 1, 'denied ต่อยอดจากขั้นเครื่องมือเดิม');
  assert.equal(tl.steps[0].status, 'denied');
  assert.match(tl.steps[0].label, /ผู้ใช้ไม่อนุญาต/);

  tl.push({ type: 'error', step: 2, tool: 'weather', message: 'timeout' });
  assert.equal(tl.steps[1].status, 'error');
  assert.match(tl.steps[1].label, /timeout/);

  tl.finish();
  const sum = tl.summary();
  assert.equal(sum.denied, 1);
  assert.equal(sum.error, 1);
  assert.match(tl.headline(), /ข้อผิดพลาด 1 จุด/);
  assert.match(tl.toMarkdown(), /⚠️/);
});

test('cancel marks running steps cancelled and keeps the reason', () => {
  const tl = new AgentTimeline({ lang: 'en' }).start();
  tl.push({ type: 'tool', step: 1, tool: 'news', label: 'ข่าว' });
  tl.cancel('ผู้ใช้กดหยุด');
  assert.equal(tl.cancelled, true);
  assert.equal(tl.cancelReason, 'ผู้ใช้กดหยุด');
  assert.equal(tl.steps[0].status, 'cancelled');
  assert.equal(tl.active, false);
  assert.match(tl.headline(), /Stopped after 1 step/);
  assert.equal(tl.summary().cancelledSteps, 1);

  // event type 'cancelled' ทำแบบเดียวกัน
  const tl2 = new AgentTimeline().start();
  tl2.push({ type: 'tool', step: 1, tool: 'x', label: 'x' });
  tl2.push({ type: 'cancelled', reason: 'stop' });
  assert.equal(tl2.cancelled, true);
  assert.equal(tl2.steps[0].status, 'cancelled');
});

test('unknown events are ignored and toRows is render-ready', () => {
  const tl = new AgentTimeline().start();
  assert.equal(tl.push({ type: 'whatever' }), null);
  tl.push({ type: 'tool', step: 1, tool: 'calc', label: 'คำนวณ', emoji: '🧮' });
  tl.push({ type: 'result', data: { title: '42' } });
  const rows = tl.toRows();
  assert.equal(rows.length, 1, 'result รวมเข้าขั้นเครื่องมือ');
  assert.deepEqual(Object.keys(rows[0]).sort(), ['icon', 'id', 'label', 'ms', 'status', 'title']);
  assert.equal(rows[0].title, '42');
  assert.equal(rows[0].status, 'ok');
});

// ---------------------------------------------------------------- Agent cancel

function makeSettings(overrides = {}) {
  return {
    language: 'th', polite: true, mode: 'auto', maxSteps: 4,
    permissions: { ...DEFAULT_PERMISSIONS },
    ...overrides,
  };
}

function toolCallReply(name, args = {}) {
  return '```tool\n' + JSON.stringify({ tool: name, args }) + '\n```';
}

test('cancelling while waiting for the model stops before any tool runs', async () => {
  const events = [];
  let calls = 0;
  const agent = new Agent({
    chat: async () => {
      calls++;
      if (calls === 1) agent.cancel('ผู้ใช้กดหยุด');
      return calls === 1 ? toolCallReply('calc', { expression: '1+1' }) : 'คำตอบ';
    },
    memory: { search: () => [] },
    settings: makeSettings(),
    onEvent: (e) => events.push(e),
    maxSteps: 4,
  });

  const result = await agent.run('สวัสดี', { persona: getPersona('no7') });
  assert.equal(result.cancelled, true);
  assert.equal(result.trace.length, 0, 'ไม่รันเครื่องมือเมื่อถูกยกเลิก');
  assert.equal(calls, 1, 'ไม่เรียกโมเดลซ้ำ');
  assert.ok(events.some((e) => e.type === 'cancelled'));
  assert.match(result.text, /หยุด/);

  // รอบใหม่ต้องไม่ค้างธงยกเลิก
  const ok = await agent.run('สวัสดีอีกครั้ง', { persona: getPersona('no7') });
  assert.equal(ok.cancelled, false);
  assert.equal(ok.text, 'คำตอบ');
  assert.equal(calls, 2);
});

test('Agent stops mid-loop after a tool step when cancelled', async () => {
  const events = [];
  let calls = 0;
  const agent = new Agent({
    chat: async () => {
      calls++;
      return calls === 1 ? toolCallReply('calc', { expression: '1+1' }) : 'สรุปแล้ว';
    },
    memory: { search: () => [] },
    settings: makeSettings(),
    onEvent: (e) => {
      events.push(e);
      if (e.type === 'result') agent.cancel('ผู้ใช้กดหยุด');
    },
    maxSteps: 4,
  });

  const result = await agent.run('บวกเลขให้หน่อย', { persona: getPersona('no7') });
  assert.equal(result.cancelled, true);
  assert.equal(calls, 1, 'หยุดหลังเครื่องมือ ไม่เรียกโมเดลอีกรอบ');
  assert.equal(result.trace.length, 1);
  assert.equal(result.trace[0].tool, 'calc');
  assert.ok(events.some((e) => e.type === 'cancelled'));
  assert.match(result.text, /หยุดตามคำสั่ง/);
});

test('cancelling during the confirm dialog prevents the tool from running', async () => {
  let confirmAsked = false;
  let toolEvents = 0;
  const agent = new Agent({
    chat: async () => toolCallReply('open_app', { name: 'Calculator' }),
    memory: { search: () => [] },
    settings: makeSettings({ permissions: { ...DEFAULT_PERMISSIONS, control: true } }),
    confirm: async () => {
      confirmAsked = true;
      agent.cancel('ผู้ใช้กดหยุดระหว่างยืนยัน');
      return true;
    },
    onEvent: (e) => { if (e.type === 'tool') toolEvents++; },
    maxSteps: 3,
  });
  const result = await agent.run('เปิดเครื่องคิดเลข', { persona: getPersona('no7') });
  assert.equal(confirmAsked, true, 'ต้องถามยืนยันก่อน (risk 3)');
  assert.equal(toolEvents, 0, 'ไม่รันเครื่องมือ แม้ผู้ใช้ตอบอนุญาตแต่ถูกยกเลิก');
  assert.equal(result.cancelled, true);
  assert.equal(result.trace.length, 0);
});
