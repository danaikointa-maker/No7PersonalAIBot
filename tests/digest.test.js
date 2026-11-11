// Daily digest: จัดกลุ่มงาน/นัดหมาย/ความจำ + tool ที่ AI เรียกได้ + การแจ้งเตือนครั้งแรกของวัน
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDigest, digestMarkdown, digestTool, shouldAutoDigest, startOfDay, isSameDay, toMs,
} from '../web/src/core/digest.js';

const at = (iso) => new Date(iso).getTime();
const NOW = at('2026-11-10T09:00:00');

const tasks = [
  { id: 't1', title: 'ส่งรายงาน', due: at('2026-11-08T10:00:00'), priority: 3 },        // เกินกำหนด
  { id: 't2', title: 'ประชุมทีม', due: at('2026-11-10T14:00:00'), priority: 2 },        // วันนี้
  { id: 't3', title: 'จ่ายบิล', due: at('2026-11-10T20:00:00'), priority: 1, recurrence: 'monthly' },
  { id: 't4', title: 'ทำสไลด์', due: at('2026-11-11T09:00:00'), priority: 0 },          // พรุ่งนี้ (<48h)
  { id: 't5', title: 'อ่านหนังสือ', due: null, priority: 0 },                            // ไม่มีกำหนด
  { id: 't6', title: 'งานที่เสร็จแล้ว', due: at('2026-11-09T09:00:00'), done: true },
];

test('toMs accepts ISO strings (task store format) and stays null-safe', () => {
  assert.equal(toMs('2026-11-10T14:00:00'), at('2026-11-10T14:00:00'));
  assert.equal(toMs(at('2026-11-10T14:00:00')), at('2026-11-10T14:00:00'));
  assert.equal(toMs('1762772400000'), 1762772400000);
  assert.equal(toMs(null), null);
  assert.equal(toMs(''), null);
  assert.equal(toMs('ไม่ใช่วันที่'), null);
});

test('ISO-string due dates from TaskStore are grouped correctly', () => {
  const d = buildDigest({
    tasks: [
      { id: 'a', title: 'เลยกำหนดแล้ว', due: '2026-11-09T10:00:00', priority: 1 },
      { id: 'b', title: 'วันนี้บ่าย', due: '2026-11-10T15:00:00', priority: 2 },
      { id: 'c', title: 'อีกนาน', due: '2026-12-02T08:00:00' },
      { id: 'd', title: 'ไม่มีกำหนด', due: null },
    ],
    now: NOW,
  });
  assert.equal(d.counts.overdue, 1);
  assert.equal(d.counts.today, 1);
  assert.ok(d.sections.some((s) => s.id === 'upcoming' && s.items.some((i) => i.label.includes('อีกนาน'))));
  assert.ok(d.sections.some((s) => s.id === 'later' && s.items.some((i) => i.label.includes('ไม่มีกำหนด'))));
});

test('startOfDay / isSameDay handle local midnight boundaries', () => {
  assert.equal(startOfDay(NOW), at('2026-11-10T00:00:00'));
  assert.equal(isSameDay(NOW, at('2026-11-10T23:59:59')), true);
  assert.equal(isSameDay(NOW, at('2026-11-11T00:00:01')), false);
  assert.equal(isSameDay(null, NOW), false);
});

test('buildDigest groups tasks, events and memories', () => {
  const d = buildDigest({
    tasks,
    events: [
      { title: 'คุยกับลูกค้า', start: at('2026-11-10T15:30:00') },
      { title: 'นัดพรุ่งนี้', start: at('2026-11-11T10:00:00') },
    ],
    memories: [
      { text: 'ชอบกาแฟดำ', createdAt: NOW - 3 * 3600_000 },
      { text: 'เก่าเกิน 24 ชม.', createdAt: NOW - 30 * 3600_000 },
    ],
    now: NOW,
  });

  const ids = d.sections.map((s) => s.id);
  assert.deepEqual(ids, ['overdue', 'today', 'events', 'soon', 'memories', 'later']);
  assert.equal(d.counts.overdue, 1);
  assert.equal(d.counts.today, 2);
  assert.equal(d.counts.events, 1, 'นัดพรุ่งนี้ไม่ถูกนับเป็นวันนี้');
  assert.equal(d.counts.memories, 1);
  assert.equal(d.counts.done, 1);
  assert.equal(d.counts.tasks, 5, 'นับเฉพาะงานที่ยังไม่เสร็จ');

  const overdue = d.sections.find((s) => s.id === 'overdue');
  assert.match(overdue.items[0].label, /ส่งรายงาน/);
  assert.match(overdue.items[0].meta, /เลย 2 วัน/);

  const today = d.sections.find((s) => s.id === 'today');
  assert.equal(today.items.length, 2);
  assert.match(today.items[0].meta, /วันนี้ 14:00/);
  assert.match(today.items[1].meta, /งานซ้ำ/);

  assert.match(d.headline, /วันนี้มี 2 งาน/);
  assert.equal(d.empty, false);
  assert.match(d.markdown, /## สรุปประจำวัน/);
  assert.match(d.markdown, /### ⏰ เกินกำหนด/);
});

test('english digest uses english labels', () => {
  const d = buildDigest({ tasks, now: NOW, lang: 'en' });
  assert.match(d.headline, /2 due today/);
  assert.match(d.sections.find((s) => s.id === 'overdue').title, /Overdue/);
  assert.match(d.sections.find((s) => s.id === 'overdue').items[0].meta, /2d late/);
  assert.match(d.markdown, /Daily digest/);
});

test('an empty day produces a friendly digest without sections', () => {
  const d = buildDigest({ now: NOW });
  assert.equal(d.empty, true);
  assert.equal(d.sections.length, 0);
  assert.match(d.headline, /ไม่มีอะไรด่วน/);
  assert.match(d.markdown, /ไม่มีงานหรือนัดหมายค้างอยู่/);
  assert.equal(d.big, 'ว่าง');
});

test('far-future tasks land in "coming up" (capped at five)', () => {
  const far = Array.from({ length: 7 }, (_, i) => ({ id: `f${i}`, title: `งานถัดไป ${i}`, due: NOW + (5 + i) * 86_400_000 }));
  const d = buildDigest({ tasks: far, now: NOW });
  const upcoming = d.sections.find((s) => s.id === 'upcoming');
  assert.ok(upcoming, 'ต้องมีส่วนงานถัดไป');
  assert.equal(upcoming.items.length, 5);
  assert.equal(upcoming.more, 2);
  assert.deepEqual(d.sections.map((s) => s.id), ['upcoming']);
});

test('backlog is capped at five items but reports the overflow', () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, title: `งาน ${i}`, due: null }));
  const d = buildDigest({ tasks: many, now: NOW });
  const later = d.sections.find((s) => s.id === 'later');
  assert.equal(later.items.length, 5);
  assert.equal(later.more, 3);
  assert.match(d.markdown, /อีก 3/);
});

test('digestMarkdown renders every section with counts', () => {
  const d = buildDigest({ tasks, events: [{ title: 'นัด', start: NOW }], now: NOW });
  const md = digestMarkdown(d);
  assert.match(md, /### 🎯 ต้องทำวันนี้ \(2\)/);
  assert.match(md, /### 📅 นัดหมายวันนี้ \(1\)/);
  assert.match(md, /- 🟠 ประชุมทีม · วันนี้ 14:00/);
});

test('digestTool pulls live data and returns a card-friendly shape', async () => {
  const tool = digestTool({
    tasks: { list: ({ done }) => (done === null ? tasks : tasks.filter((t) => !!t.done === done)) },
    calendar: { list: () => [{ title: 'นัดกับหมอ', start: Date.now() }] },
    memory: { recent: () => [{ text: 'เพิ่งจำได้', createdAt: Date.now() }] },
    lang: () => 'th',
  });
  assert.equal(tool.meta.risk, 0);
  assert.deepEqual(tool.params, {});
  const out = await tool.run();
  assert.ok(out.lines.length > 0);
  assert.ok(out.sections.some((s) => s.id === 'events'));
  assert.match(out.markdown, /สรุปประจำวัน/);
  assert.equal(out.counts.events, 1);
});

test('digestTool survives missing stores', async () => {
  const out = await digestTool({}).run();
  assert.match(out.markdown, /สรุปประจำวัน/);
  assert.equal(out.counts.tasks, 0);
});

test('shouldAutoDigest fires once per day after the configured hour', () => {
  const morning = at('2026-11-10T09:00:00');
  const early = at('2026-11-10T05:00:00');
  assert.equal(shouldAutoDigest({ lastDate: null, now: morning, hour: 7 }), true);
  assert.equal(shouldAutoDigest({ lastDate: null, now: early, hour: 7 }), false);
  assert.equal(shouldAutoDigest({ lastDate: startOfDay(morning), now: morning, hour: 7 }), false, 'ทำไปแล้ววันนี้');
  assert.equal(shouldAutoDigest({ lastDate: startOfDay(early) - 86_400_000, now: morning, hour: 7 }), true, 'เมื่อวานทำแล้ว → วันนี้ทำได้');
  assert.equal(shouldAutoDigest({ lastDate: null, now: morning, hour: 30 }), false, 'ชั่วโมง 30 → clamp 23 (ยังไม่ถึง)');
  assert.equal(shouldAutoDigest({ lastDate: null, now: early, hour: -5 }), true);
});
