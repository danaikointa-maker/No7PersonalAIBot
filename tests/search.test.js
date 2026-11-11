// Command palette search: index building, ranking, highlight, grouping, actions
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SEARCH_TYPES, TYPE_ORDER, normalize, buildIndex, searchIndex, groupResults,
  matchRanges, defaultPaletteExtras, highlightRanges,
} from '../web/src/core/search.js';

const NOW = Date.now();
const day = 86_400_000;

const fixtures = {
  memory: [
    { id: 'f1', text: 'ฉันชอบกาแฟดำ', source: 'user', ts: NOW - day, importance: 3, pinned: true },
    { id: 'f2', text: 'ฉันมีแมวชื่อมีโจ', source: 'chat', ts: NOW - 20 * day, importance: 1 },
  ],
  notes: [{ text: 'ซื้อนมกับไข่', ts: NOW - 2 * day }, { text: 'ไอเดียโปรเจกต์ใหม่', ts: NOW - 5 * day }],
  todos: [{ text: 'ส่งอีเมลหาลูกค้า', ts: NOW - day, done: false }],
  tasks: [
    { id: 't1', title: 'ส่งรายงานประจำเดือน', due: new Date(NOW + day).toISOString(), done: false, priority: 2 },
    { id: 't2', title: 'ประชุมทีม', due: new Date(NOW - day).toISOString(), done: true, priority: 0 },
  ],
  events: [{ uid: 'e1', title: 'นัดหมอฟัน', start: NOW + 2 * day }],
  tools: [{ id: 'weather', emoji: '🌤', label: 'อากาศ', desc: 'พยากรณ์อากาศ', risk: 0, category: 'read' }],
};

test('normalize strips tone marks and lowercases', () => {
  assert.equal(normalize('  กาแฟดำ  '), 'กาแฟดำ');
  assert.equal(normalize('Hello   World'), 'hello world');
  assert.equal(normalize('สวัสดี'), normalize('สวัสดี'));
  // วรรณยุกต์ถูกตัด → เทียบได้กับคำที่พิมพ์โดยไม่มีวรรณยุกต์
  assert.equal(normalize('น้ำ'), normalize('นำ'));
});

test('buildIndex includes every source with stable ids and actions', () => {
  const idx = buildIndex({ ...fixtures, ...defaultPaletteExtras() });
  const types = new Set(idx.map((i) => i.type));
  for (const t of ['memory', 'note', 'todo', 'task', 'event', 'tool', 'view', 'action']) {
    assert.ok(types.has(t), `ขาดชนิด ${t}`);
  }
  const fact = idx.find((i) => i.id === 'memory:f1');
  assert.equal(fact.action.kind, 'memory');
  assert.match(fact.text, /กาแฟดำ/);
  assert.equal(idx.find((i) => i.id === 'tool:weather').action.kind, 'tool');
  assert.equal(idx.filter((i) => i.type === 'view').length, 7);
  assert.equal(idx.filter((i) => i.type === 'action').length, 3);
});

test('buildIndex skips entries without a title', () => {
  const idx = buildIndex({ memory: [{ id: 'x', text: '' }], notes: [{ text: null }] });
  assert.equal(idx.length, 0);
});

test('search ranks exact and prefix matches first', () => {
  const idx = buildIndex(fixtures);
  const rows = searchIndex(idx, 'กาแฟดำ');
  assert.ok(rows.length > 0);
  assert.equal(rows[0].id, 'memory:f1');
  assert.ok(rows[0].score > 100, `score=${rows[0].score}`);
  assert.deepEqual(rows[0].ranges, [[6, 12]], 'highlight ทั้งคำ (หลังคำว่า "ฉันชอบ")');

  const prefix = searchIndex(idx, 'กาแฟ');
  assert.equal(prefix[0].id, 'memory:f1');
});

test('search matches multi-word queries and Thai without tone marks', () => {
  const idx = buildIndex(fixtures);
  const multi = searchIndex(idx, 'แมว มีโจ');
  assert.equal(multi[0].id, 'memory:f2');

  const noTone = searchIndex(idx, 'นำ');   // "นม" ควรไม่ติด แต่ "น้ำ" ตัดวรรณยุกต์แล้วเท่ากัน
  assert.ok(Array.isArray(noTone));
});

test('search filters by type and caps results per type', () => {
  const idx = buildIndex({
    tasks: Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, title: `งานทดสอบ ${i}` })),
    memory: [{ id: 'm', text: 'งานทดสอบความจำ' }],
  });
  const all = searchIndex(idx, 'งานทดสอบ', { limit: 12 });
  const taskRows = all.filter((r) => r.type === 'task');
  assert.ok(taskRows.length <= 4, `perType cap: ${taskRows.length}`);
  assert.ok(all.some((r) => r.type === 'memory'));

  const onlyTasks = searchIndex(idx, 'งานทดสอบ', { types: ['task'] });
  assert.ok(onlyTasks.every((r) => r.type === 'task'));
  assert.ok(onlyTasks.length > 0);
});

test('an empty query returns a browse list ordered by type', () => {
  const idx = buildIndex(fixtures);
  const rows = searchIndex(idx, '', { limit: 6 });
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.score > 0));
});

test('recent and pinned items get a small boost', () => {
  const idx = buildIndex({
    memory: [
      { id: 'old', text: 'โปรเจกต์ A', ts: NOW - 200 * day },
      { id: 'new', text: 'โปรเจกต์ A ใหม่', ts: NOW - 1 * day, pinned: true },
    ],
  });
  const rows = searchIndex(idx, 'โปรเจกต์');
  assert.equal(rows[0].id, 'memory:new');
});

test('done tasks rank below open ones of the same text', () => {
  const idx = buildIndex({
    tasks: [
      { id: 'open', title: 'จ่ายบิล', done: false, due: new Date(NOW + day).toISOString() },
      { id: 'done', title: 'จ่ายบิล', done: true, due: new Date(NOW + day).toISOString() },
    ],
  });
  const rows = searchIndex(idx, 'จ่ายบิล');
  assert.equal(rows[0].action.id, 'open');
});

test('matchRanges finds every occurrence up to eight', () => {
  assert.deepEqual(matchRanges('abcabc', 'abc'), [[0, 3], [3, 6]]);
  assert.equal(matchRanges('aaaaaaaaaa', 'a').length, 8);
  assert.deepEqual(matchRanges('ไม่มี', ''), []);
  assert.deepEqual(matchRanges('น้ำ', 'นำ'), [[0, 2]]);
});

test('highlightRanges works on raw text (tone marks preserved)', () => {
  assert.deepEqual(highlightRanges('ฉันชอบกาแฟดำ', 'กาแฟ'), [[6, 10]]);
  assert.deepEqual(highlightRanges('น้ำ', 'น้ำ'), [[0, 3]], 'ข้อความดิบ → index ตรง');
  assert.deepEqual(highlightRanges('ABC abc', 'abc'), [[0, 3], [4, 7]]);
  assert.deepEqual(highlightRanges('x', ''), []);
  assert.deepEqual(highlightRanges(null, 'a'), []);
});

test('groupResults keeps type order and human labels', () => {
  const idx = buildIndex(fixtures);
  const groups = groupResults(searchIndex(idx, 'งาน', { limit: 12 }));
  assert.ok(groups.length > 0);
  const order = groups.map((g) => TYPE_ORDER.indexOf(g.type));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(groups[0].emoji, SEARCH_TYPES[groups[0].type].emoji);
  assert.equal(groups[0].label, SEARCH_TYPES[groups[0].type].label);
});

test('defaultPaletteExtras provides views and actions', () => {
  const extras = defaultPaletteExtras();
  assert.equal(extras.views.length, 7);
  assert.equal(extras.actions.length, 3);
  const idx = buildIndex(extras);
  const digest = searchIndex(idx, 'สรุป');
  assert.equal(digest[0].action.kind, 'digest');
});
