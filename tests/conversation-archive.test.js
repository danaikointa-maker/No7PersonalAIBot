import test from 'node:test';
import assert from 'node:assert/strict';
import { filterConversationLog } from '../web/src/ui/conversation-archive.js';

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

test('conversation archive paginates beyond 200 up to the complete 800-entry memory log', () => {
  const many = Array.from({ length: 800 }, (_, i) => ({ role: 'user', text: `message ${i}`, ts: i + 1 }));
  const first = filterConversationLog(many, { limit: 50 });
  assert.equal(first.items.length, 50);
  assert.equal(first.total, 800);
  assert.equal(first.hasMore, true);
  assert.equal(filterConversationLog(many, { limit: 200 }).items.length, 200);
  const full = filterConversationLog(many, { limit: 800 });
  assert.equal(full.items.length, 800);
  assert.equal(full.hasMore, false);
});

test('conversation archive reports when source log exceeds the 800-entry display cap', () => {
  const many = Array.from({ length: 850 }, (_, i) => ({ role: 'user', text: `message ${i}`, ts: i + 1 }));
  const result = filterConversationLog(many, { limit: 999 });
  assert.equal(result.items.length, 800);
  assert.equal(result.total, 850);
  assert.equal(result.hasMore, true);
});
