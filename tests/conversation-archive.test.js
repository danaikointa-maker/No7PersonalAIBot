import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationDatePresetRange, filterConversationLog } from '../web/src/ui/conversation-archive.js';

const log = [
  { role: 'user', text: 'Hello No7', ts: 1000, privateMeta: 'strip' },
  { role: 'assistant', text: 'Hi there', ts: 2000 },
  { role: 'user', text: 'Find this note', ts: 3000 },
  { role: 'tool', text: 'must not display', ts: 4000 },
  null,
  { role: 'assistant', text: 'bad timestamp', ts: Infinity },
];

test('conversation archive filters malformed records and orders newest first', () => {
  const result = filterConversationLog(log);
  assert.equal(result.total, 3);
  assert.deepEqual(result.items.map((item) => item.text), ['Find this note', 'Hi there', 'Hello No7']);
  assert.equal('privateMeta' in result.items[0], false);
});

test('conversation archive searches case-insensitively and filters speaker', () => {
  const result = filterConversationLog(log, { query: 'hELLo', role: 'user' });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].text, 'Hello No7');
  assert.equal(filterConversationLog(log, { role: 'tool' }).total, 0);
});

test('conversation archive pages older and newer messages without a fixed history cap', () => {
  const many = Array.from({ length: 2500 }, (_, i) => ({ role: 'user', text: `message ${i}`, ts: i + 1 }));
  const first = filterConversationLog(many, { limit: 50 });
  assert.equal(first.items.length, 50);
  assert.equal(first.items[0].text, 'message 2499');
  assert.equal(first.offset, 0);
  assert.equal(first.hasPrevious, false);
  assert.equal(first.hasMore, true);
  const middle = filterConversationLog(many, { offset: 800, limit: 50 });
  assert.equal(middle.items.length, 50);
  assert.equal(middle.hasPrevious, true);
  assert.equal(middle.hasMore, true);
  const last = filterConversationLog(many, { offset: 2450, limit: 50 });
  assert.equal(last.items.length, 50);
  assert.equal(last.items.at(-1).text, 'message 0');
  assert.equal(last.hasPrevious, true);
  assert.equal(last.hasMore, false);
  assert.equal(filterConversationLog(many, { offset: -50 }).offset, 0);
});

test('conversation archive date bounds include both local calendar days', () => {
  const start = new Date(2026, 10, 10).getTime();
  const nextStart = new Date(2026, 10, 11).getTime();
  const dated = [
    { role: 'user', text: 'previous day', ts: start - 1 },
    { role: 'assistant', text: 'start boundary', ts: start },
    { role: 'user', text: 'same day', ts: start + 12 * 60 * 60 * 1000 },
    { role: 'assistant', text: 'end boundary', ts: nextStart - 1 },
    { role: 'user', text: 'next day', ts: nextStart },
  ];
  const result = filterConversationLog(dated, { dateFrom: '2026-11-10', dateTo: '2026-11-10' });
  assert.equal(result.total, 3);
  assert.deepEqual(result.items.map((item) => item.text), ['end boundary', 'same day', 'start boundary']);
  assert.equal(filterConversationLog(dated, { dateFrom: '2026-11-10' }).total, 4);
  assert.equal(filterConversationLog(dated, { dateTo: '2026-11-10' }).total, 4);
});

test('conversation archive returns no records for invalid or reversed date ranges', () => {
  const dated = [{ role: 'user', text: 'private message', ts: new Date(2026, 10, 10, 12).getTime() }];
  assert.equal(filterConversationLog(dated, { dateFrom: '2026-02-30' }).total, 0);
  assert.equal(filterConversationLog(dated, { dateTo: 'not-a-date' }).total, 0);
  assert.equal(filterConversationLog(dated, { dateFrom: '2026-11-11', dateTo: '2026-11-10' }).total, 0);
});

test('conversation archive quick date presets use inclusive local calendar dates', () => {
  const now = new Date(2024, 2, 1, 15, 30);
  assert.deepEqual(conversationDatePresetRange('today', now), { dateFrom: '2024-03-01', dateTo: '2024-03-01' });
  assert.deepEqual(conversationDatePresetRange('7days', now), { dateFrom: '2024-02-24', dateTo: '2024-03-01' });
  assert.deepEqual(conversationDatePresetRange('30days', now), { dateFrom: '2024-02-01', dateTo: '2024-03-01' });
  assert.deepEqual(conversationDatePresetRange('7days', new Date(2026, 0, 2, 12)), { dateFrom: '2025-12-27', dateTo: '2026-01-02' });
  assert.deepEqual(conversationDatePresetRange('all', now), { dateFrom: '', dateTo: '' });
  assert.deepEqual(conversationDatePresetRange('custom', now), { dateFrom: '', dateTo: '' });
});
