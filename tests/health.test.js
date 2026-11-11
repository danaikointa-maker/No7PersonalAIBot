import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, analyzeHealth, healthMarkdown, applyCleanup } from '../web/src/core/health.js';

const NOW = Date.UTC(2026, 10, 10, 12);
const DAY = 86400000;

test('normalizeText folds case, spaces and punctuation', () => {
  assert.equal(normalizeText(' Hello, WORLD! '), 'helloworld');
  assert.notEqual(normalizeText('นา'), normalizeText('น่า'), 'Thai tone marks remain meaningful');
  assert.equal(normalizeText(''), '');
  assert.equal(normalizeText(null), '');
});

test('clean data receives score 100 and grade A', () => {
  const result = analyzeHealth({
    facts: [{ id: 'f', text: 'ชอบกาแฟ', ts: NOW - DAY, used: 2 }],
    notes: [{ text: 'โน้ต', ts: NOW }], todos: [{ text: 'ซื้อของ' }],
    tasks: [{ title: 'งาน', due: NOW + DAY }], events: [{ title: 'นัด', start: NOW + DAY }], now: NOW,
  });
  assert.equal(result.score, 100);
  assert.equal(result.grade, 'A');
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.cleanup, { facts: [], notes: [], todos: [] });
});

test('duplicate facts retain newest record and mark the older fact', () => {
  const result = analyzeHealth({ facts: [
    { id: 'old', text: 'Like tea!', ts: NOW - DAY },
    { id: 'new', text: 'like tea', ts: NOW },
  ], now: NOW });
  assert.deepEqual(result.cleanup.facts, ['old']);
  assert.equal(result.issues.find((entry) => entry.id === 'dup-facts').count, 1);
});

test('duplicate to-dos retain newest entry', () => {
  const result = analyzeHealth({ todos: [
    { text: 'Pay bills', ts: NOW - DAY }, { text: 'pay bills', ts: NOW },
  ], now: NOW });
  assert.deepEqual(result.cleanup.todos, [0]);
  assert.equal(result.issues.find((entry) => entry.id === 'dup-todos').severity, 'medium');
});

test('empty notes and to-dos are identified by original indices', () => {
  const result = analyzeHealth({ notes: [{ text: 'keep' }, { text: '   ' }, {}], todos: [{ text: '' }], now: NOW });
  assert.deepEqual(result.cleanup.notes, [1, 2]);
  assert.deepEqual(result.cleanup.todos, [0]);
  assert.equal(result.issues.find((entry) => entry.id === 'empty-notes').severity, 'high');
});

test('stale facts exclude pinned or recently used memories and are not auto-cleaned', () => {
  const result = analyzeHealth({ facts: [
    { id: 'old', text: 'old', ts: NOW - 200 * DAY, used: 0 },
    { id: 'pinned', text: 'pinned', ts: NOW - 200 * DAY, used: 0, pinned: true },
    { id: 'used', text: 'used', ts: NOW - 200 * DAY, used: 3, usedAt: NOW - DAY },
  ], now: NOW });
  assert.equal(result.issues.find((entry) => entry.id === 'stale-facts').count, 1);
  assert.deepEqual(result.cleanup.facts, []);
});

test('overdue tasks get stronger severity when over 14 days late', () => {
  const recent = analyzeHealth({ tasks: [{ title: 'recent', due: NOW - DAY }], now: NOW });
  const old = analyzeHealth({ tasks: [{ title: 'old', due: NOW - 20 * DAY }], now: NOW });
  assert.equal(recent.issues.find((entry) => entry.id === 'overdue-tasks').severity, 'medium');
  assert.equal(old.issues.find((entry) => entry.id === 'overdue-tasks').severity, 'high');
  assert.ok(old.score < recent.score);
});

test('completed tasks are ignored; undated active tasks and past events are reported', () => {
  const result = analyzeHealth({
    tasks: [{ title: 'done', done: true }, { title: 'undated' }],
    events: [{ title: 'past', start: NOW - DAY }, { title: 'future', start: NOW + DAY }], now: NOW,
  });
  assert.equal(result.issues.find((entry) => entry.id === 'undated-tasks').count, 1);
  assert.equal(result.issues.find((entry) => entry.id === 'past-events').count, 1);
});

test('scores stay between zero and one hundred and map to grades', () => {
  const result = analyzeHealth({
    facts: Array.from({ length: 40 }, (_, i) => ({ id: `f${i}`, text: 'duplicate', ts: NOW - i })),
    notes: Array.from({ length: 40 }, () => ({ text: '' })),
    todos: Array.from({ length: 40 }, () => ({ text: '' })),
    tasks: Array.from({ length: 40 }, () => ({ title: 'overdue', due: NOW - 20 * DAY })), now: NOW,
  });
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.equal(result.grade, 'D');
  assert.equal(analyzeHealth({ notes: [{ text: '' }, { text: '' }], now: NOW }).grade, 'B');
  assert.equal(analyzeHealth({
    notes: [{ text: '' }, { text: '' }, { text: '' }],
    tasks: [{ title: 'late', due: NOW - DAY }], now: NOW,
  }).grade, 'C');
});

test('health markdown renders Thai and English summaries', () => {
  const result = analyzeHealth({ notes: [{ text: '' }], now: NOW });
  const th = healthMarkdown(result, 'th');
  assert.match(th, /^# สุขภาพข้อมูล — \d+\/100 \([ABCD]:/);
  assert.match(th, /## ปัญหาที่พบ/);
  assert.match(th, /## คำแนะนำ/);
  const en = healthMarkdown(result, 'en');
  assert.match(en, /^# Data health/);
  assert.match(en, /\| Collection \| Count \|/);
  assert.match(en, /Empty notes/);
});

test('applyCleanup removes only explicitly marked facts, notes and to-dos', () => {
  const data = { facts: [{ id: 'a' }, { id: 'b' }], notes: [{ text: 'a' }, { text: '' }, { text: 'c' }], todos: [{ text: 'a' }, { text: 'b' }] };
  const result = applyCleanup({ facts: ['a'], notes: [1], todos: [0] }, data);
  assert.deepEqual(result.facts, [{ id: 'b' }]);
  assert.deepEqual(result.notes, [{ text: 'a' }, { text: 'c' }]);
  assert.deepEqual(result.todos, [{ text: 'b' }]);
  assert.deepEqual(result.removed, { facts: 1, notes: 1, todos: 1 });
  assert.equal(data.notes.length, 3, 'source data remains unchanged');
});

test('empty cleanup is a safe no-op', () => {
  const result = applyCleanup({}, { facts: [{ id: 'a' }], notes: [{ text: 'n' }], todos: [] });
  assert.deepEqual(result.removed, { facts: 0, notes: 0, todos: 0 });
});
