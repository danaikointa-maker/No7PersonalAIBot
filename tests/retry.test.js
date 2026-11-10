import test from 'node:test';
import assert from 'node:assert/strict';

import { withRetry, classifyError, OfflineQueue, sleep, QUEUE_KEY } from '../web/src/core/retry.js';

const httpError = (status, message = `HTTP ${status}`) => Object.assign(new Error(message), { status });

test('classifyError marks transient failures retryable', () => {
  assert.equal(classifyError(httpError(429)).retryable, true);
  assert.equal(classifyError(httpError(503)).retryable, true);
  assert.equal(classifyError(new Error('Failed to fetch')).retryable, true);
  assert.equal(classifyError(new Error('The operation timed out')).retryable, true);
  assert.equal(classifyError(httpError(401)).retryable, false);
  assert.equal(classifyError(httpError(400)).retryable, false);
  assert.equal(classifyError(new Error('schema mismatch')).retryable, false);
  assert.equal(classifyError(httpError(429)).kind, 'rate-limit');
  assert.equal(classifyError(httpError(401)).kind, 'auth');
});

test('withRetry retries then succeeds and reports attempts', async () => {
  let calls = 0;
  const retries = [];
  const result = await withRetry(async () => {
    calls += 1;
    if (calls < 3) throw httpError(503);
    return 'ok';
  }, { retries: 3, sleep: async () => {}, onRetry: (r) => retries.push(r.attempt) });
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
  assert.deepEqual(retries, [1, 2]);
});

test('withRetry does not retry non-retryable errors', async () => {
  let calls = 0;
  await assert.rejects(() => withRetry(async () => {
    calls += 1;
    throw httpError(400, 'bad request');
  }, { retries: 5, sleep: async () => {} }), /bad request/);
  assert.equal(calls, 1);
});

test('withRetry gives up after the configured retries', async () => {
  let calls = 0;
  await assert.rejects(() => withRetry(async () => {
    calls += 1;
    throw new Error('network down');
  }, { retries: 2, sleep: async () => {} }), /network down/);
  assert.equal(calls, 3);
});

test('backoff grows exponentially and stays under maxMs', async () => {
  const delays = [];
  await assert.rejects(() => withRetry(async () => { throw httpError(500); }, {
    retries: 3, baseMs: 100, maxMs: 250, jitter: 0, sleep: async (ms) => { delays.push(ms); },
  }));
  assert.deepEqual(delays, [100, 200, 250]);
});

test('sleep resolves (and honours abort)', async () => {
  const t0 = Date.now();
  await sleep(10);
  assert.ok(Date.now() - t0 >= 5);
  const ac = new AbortController();
  const p = sleep(1000, { signal: ac.signal });
  ac.abort();
  await assert.rejects(() => p, /aborted/);
});

function fakeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('offline queue stores, caps and persists messages', () => {
  const storage = fakeStorage();
  const q = new OfflineQueue({ storage, max: 3, now: () => 1000 });
  for (let i = 0; i < 5; i++) q.enqueue(`ข้อความ ${i}`);
  assert.equal(q.size(), 3);
  assert.deepEqual(q.list().map((i) => i.text), ['ข้อความ 2', 'ข้อความ 3', 'ข้อความ 4']);
  assert.ok(storage.getItem(QUEUE_KEY).includes('ข้อความ 4'));
  const again = new OfflineQueue({ storage, max: 3, now: () => 1000 });
  assert.equal(again.size(), 3);
  assert.equal(q.enqueue('   '), null);
});

test('offline queue drops expired items on load', () => {
  const storage = fakeStorage();
  storage.setItem(QUEUE_KEY, JSON.stringify([
    { id: 'old', text: 'เก่าเกินไป', at: 0 },
    { id: 'new', text: 'ยังใช้ได้', at: 900 },
  ]));
  const q = new OfflineQueue({ storage, now: () => 1000, ttlMs: 500 });
  assert.deepEqual(q.list().map((i) => i.text), ['ยังใช้ได้']);
});

test('drain sends until failure and keeps the rest', async () => {
  const storage = fakeStorage();
  const q = new OfflineQueue({ storage, now: () => 1000 });
  q.enqueue('หนึ่ง');
  q.enqueue('สอง');
  q.enqueue('สาม');
  const seen = [];
  const res = await q.drain(async (item) => {
    seen.push(item.text);
    if (item.text === 'สอง') throw new Error('offline again');
  });
  assert.deepEqual(seen, ['หนึ่ง', 'สอง']);
  assert.equal(res.sent, 1);
  assert.equal(res.left, 2);
  assert.deepEqual(q.list().map((i) => i.text), ['สอง', 'สาม']);
});

test('drain clears items that failed too many times', async () => {
  const storage = fakeStorage();
  const q = new OfflineQueue({ storage, now: () => 1000 });
  const item = q.enqueue('พังตลอด');
  q.markTried(item.id);
  q.markTried(item.id);
  q.markTried(item.id);
  const res = await q.drain(async () => { throw new Error('nope'); }, { maxTries: 3 });
  assert.equal(res.sent, 0);
  assert.equal(q.size(), 0);
});

test('clear empties both memory and storage', () => {
  const storage = fakeStorage();
  const q = new OfflineQueue({ storage, now: () => 1000 });
  q.enqueue('x');
  q.clear();
  assert.equal(q.size(), 0);
  assert.equal(storage.getItem(QUEUE_KEY), null);
});
