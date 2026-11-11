// Weekly review: ช่วงสัปดาห์, การนับ, delta, เครื่องมือ, ข้อเสนอโฟกัส, tool
import test from 'node:test';
import assert from 'node:assert/strict';

import { startOfWeek, weekRange, buildWeekly, weeklyMarkdown, weeklyTool } from '../web/src/core/weekly.js';

const at = (iso) => new Date(iso).getTime();
// 2026-11-10 เป็นวันอังคาร → สัปดาห์เริ่มจันทร์ที่ 2026-11-09
const NOW = at('2026-11-10T09:00:00');

test('startOfWeek respects Monday/Sunday week starts', () => {
  assert.equal(startOfWeek(NOW, 1), at('2026-11-09T00:00:00'));
  assert.equal(startOfWeek(NOW, 0), at('2026-11-08T00:00:00'));
  // วันจันทร์พอดี → ต้นสัปดาห์คือวันนั้น
  assert.equal(startOfWeek(at('2026-11-09T00:00:01'), 1), at('2026-11-09T00:00:00'));
  // วันอาทิตย์ + weekStart 1 → ย้อนไปจันทร์ที่ผ่านมา
  assert.equal(startOfWeek(at('2026-11-15T23:00:00'), 1), at('2026-11-09T00:00:00'));
});

test('weekRange provides current and previous windows with a label', () => {
  const r = weekRange(NOW, { weekStart: 1 });
  assert.equal(r.start, at('2026-11-09T00:00:00'));
  assert.equal(r.end, at('2026-11-16T00:00:00'));
  assert.equal(r.prevStart, at('2026-11-02T00:00:00'));
  assert.equal(r.prevEnd, r.start);
  assert.match(r.label, /9.*–.*15/);
});

const tasks = [
  { id: 'a', title: 'งานที่ปิดสัปดาห์นี้', done: true, updatedAt: new Date(at('2026-11-09T10:00:00')).toISOString() },
  { id: 'b', title: 'งานที่ปิดสัปดาห์ก่อน', done: true, updatedAt: new Date(at('2026-11-03T10:00:00')).toISOString() },
  { id: 'c', title: 'งานใหม่สัปดาห์นี้', done: false, createdAt: new Date(at('2026-11-09T12:00:00')).toISOString(), due: new Date(at('2026-11-11T09:00:00')).toISOString() },
  { id: 'd', title: 'งานเกินกำหนด', done: false, due: new Date(at('2026-11-01T09:00:00')).toISOString() },
];

test('buildWeekly counts finished/added per window and compares to last week', () => {
  const w = buildWeekly({ tasks, now: NOW });
  assert.equal(w.counts.completed, 1);
  assert.equal(w.counts.completedPrev, 1);
  assert.equal(w.counts.deltaCompleted, 0);
  assert.equal(w.counts.created, 1);
  assert.equal(w.counts.overdue, 1);
  assert.match(w.headline, /ปิด 1 · เพิ่ม 1/);
  assert.equal(w.big, '1');
  assert.equal(w.empty, false);
});

test('english output and delta wording', () => {
  const w = buildWeekly({
    tasks: [tasks[0], { id: 'x', title: 'อีกงาน', done: true, updatedAt: new Date(at('2026-11-10T08:00:00')).toISOString() }],
    now: NOW,
    lang: 'en',
  });
  assert.equal(w.counts.completed, 2);
  assert.equal(w.counts.completedPrev, 0);
  assert.match(w.headline, /\+2 vs last week/);
  assert.match(w.markdown, /Weekly review/);
  assert.match(w.sections.find((s) => s.id === 'focus').title, /Focus/);
});

test('tool usage is aggregated, ranked and limited', () => {
  const samples = [
    { kind: 'tool', label: 'weather', at: at('2026-11-09T10:00:00'), totalMs: 100, ok: true },
    { kind: 'tool', label: 'weather', at: at('2026-11-10T10:00:00'), totalMs: 200, ok: false },
    { kind: 'tool', label: 'gold', at: at('2026-11-10T11:00:00'), totalMs: 50, ok: true },
    { kind: 'tool', label: 'gold', at: at('2026-11-03T11:00:00'), totalMs: 50, ok: true },   // สัปดาห์ก่อน
    { kind: 'chat', label: 'pollinations', at: at('2026-11-10T12:00:00'), totalMs: 900, firstTokenMs: 300, ok: true },
  ];
  const w = buildWeekly({ samples, now: NOW });
  assert.equal(w.counts.toolRuns, 3);
  assert.equal(w.counts.toolRunsPrev, 1);
  assert.equal(w.counts.chats, 1);
  assert.equal(w.counts.failures, 1);
  assert.equal(w.counts.avgFirstTokenMs, 300);
  assert.equal(w.tools[0].tool, 'weather');
  assert.equal(w.tools[0].count, 2);
  assert.equal(w.tools[0].failures, 1);
  assert.equal(w.tools[0].okRate, 0.5);
  assert.equal(w.tools[1].tool, 'gold');
  assert.ok(w.tools.length <= 5);
});

test('focus suggestions follow the numbers', () => {
  const overdueOnly = buildWeekly({ tasks: [tasks[3]], now: NOW });
  assert.equal(overdueOnly.focus[0].id, 'overdue');
  assert.ok(overdueOnly.focus.some((f) => f.id === 'memory'), 'ไม่มีงานเสร็จ/ไม่มีงานใหม่ → แนะนำสอนความจำ');

  const noActivity = buildWeekly({ now: NOW });
  assert.deepEqual(noActivity.focus.map((f) => f.id), ['memory']);
  assert.equal(noActivity.empty, true);
  assert.match(noActivity.markdown, /ยังไม่มีความเคลื่อนไหว/);

  const withErrors = buildWeekly({ samples: [{ kind: 'tool', label: 'x', at: NOW, ok: false }], now: NOW });
  assert.ok(withErrors.focus.some((f) => f.id === 'errors'));

  const perfect = buildWeekly({
    tasks: [tasks[0]],
    facts: [{ text: 'ความจำใหม่', ts: at('2026-11-09T09:00:00') }],
    now: NOW,
  });
  assert.ok(perfect.focus.some((f) => f.id === 'keep'));
});

test('intake-vs-completion and next-week hints appear when relevant', () => {
  const many = Array.from({ length: 4 }, (_, i) => ({
    id: `n${i}`, title: `งานใหม่ ${i}`, done: false, createdAt: new Date(at('2026-11-09T09:00:00')).toISOString(),
    due: new Date(at('2026-11-17T09:00:00')).toISOString(),
  }));
  const w = buildWeekly({ tasks: many, now: NOW });
  assert.ok(w.focus.some((f) => f.id === 'intake'));
  assert.ok(w.focus.some((f) => f.id === 'next'));
  assert.equal(w.counts.dueNextWeek, 4);
});

test('sections skip empty groups and markdown lists the rest', () => {
  const w = buildWeekly({
    tasks,
    events: [{ title: 'นัดกับทีม', start: at('2026-11-10T14:00:00') }],
    facts: [{ text: 'ชอบชาเขียว', ts: at('2026-11-09T08:00:00') }],
    samples: [{ kind: 'tool', label: 'weather', at: NOW, totalMs: 10, ok: true }],
    now: NOW,
  });
  const ids = w.sections.map((s) => s.id);
  assert.ok(ids.includes('done'));
  assert.ok(ids.includes('events'));
  assert.ok(ids.includes('tools'));
  assert.ok(ids.includes('memory'));
  assert.ok(ids.includes('focus'));
  assert.match(weeklyMarkdown(w), /- นัดกับทีม/);
  assert.match(weeklyMarkdown(w), /- weather · 1×/);
});

test('weeklyTool returns a card-friendly payload from live stores', async () => {
  const tool = weeklyTool({
    tasks: { list: () => tasks },
    calendar: { list: () => [{ title: 'นัด', start: NOW }] },
    memory: { list: () => [{ text: 'ความจำ', ts: NOW }] },
    samples: () => [{ kind: 'tool', label: 'calc', at: NOW, totalMs: 5, ok: true }],
    lang: () => 'th',
  });
  assert.equal(tool.meta.risk, 0);
  const out = await tool.run();
  assert.match(out.title, /รายงานรายสัปดาห์/);
  assert.ok(out.lines.length >= 1);
  assert.ok(out.sections.length >= 2);
  assert.match(out.markdown, /รายงานรายสัปดาห์/);

  const empty = await weeklyTool({}).run();
  assert.equal(empty.counts.completed, 0);
});
