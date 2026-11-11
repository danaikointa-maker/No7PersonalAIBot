import test from 'node:test';
import assert from 'node:assert/strict';

import {
  withRetry, classifyError, OfflineQueue, OfflineQueueStorageError, OfflineQueueFullError, sleep, QUEUE_KEY,
} from '../web/src/core/retry.js';

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

test('offline queue enforces its capacity without evicting older messages', () => {
  const storage = fakeStorage();
  const q = new OfflineQueue({ storage, max: 3, now: () => 1000 });
  for (let i = 0; i < 3; i++) q.enqueue(`ข้อความ ${i}`);
  const persisted = storage.getItem(QUEUE_KEY);
  assert.throws(() => q.enqueue('ข้อความใหม่'), OfflineQueueFullError);
  assert.equal(q.size(), 3);
  assert.deepEqual(q.list().map((i) => i.text), ['ข้อความ 0', 'ข้อความ 1', 'ข้อความ 2']);
  assert.equal(storage.getItem(QUEUE_KEY), persisted);
  const again = new OfflineQueue({ storage, max: 3, now: () => 1000 });
  assert.equal(again.size(), 3);
  assert.equal(q.enqueue('   '), null);
});

test('offline queue retains old messages on load instead of expiring user data', () => {
  const storage = fakeStorage();
  storage.setItem(QUEUE_KEY, JSON.stringify([
    { id: 'old', text: 'ข้อความเก่า', at: 0 },
    { id: 'new', text: 'ข้อความใหม่', at: 900 },
  ]));
  const q = new OfflineQueue({ storage, now: () => 1000 });
  assert.deepEqual(q.list().map((i) => i.text), ['ข้อความเก่า', 'ข้อความใหม่']);
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

test('drain keeps messages after automatic retries are exhausted until manual retry', async () => {
  const storage = fakeStorage();
  const q = new OfflineQueue({ storage, now: () => 1000 });
  const item = q.enqueue('พังตลอด');
  q.markTried(item.id);
  q.markTried(item.id);
  q.markTried(item.id);
  const res = await q.drain(async () => { throw new Error('must not send yet'); }, { maxTries: 3 });
  assert.equal(res.sent, 0);
  assert.equal(res.exhausted, true);
  assert.equal(res.failureStage, 'exhausted');
  assert.equal(q.size(), 1);
  assert.equal(JSON.parse(storage.getItem(QUEUE_KEY))[0].text, 'พังตลอด');
  assert.equal(q.resetTries(), true);
  assert.equal(q.list()[0].tries, 0);
});

test('offline queue mutations preserve the prior queue when storage writes fail', () => {
  const storage = fakeStorage();
  const q = new OfflineQueue({ storage, now: () => 1000 });
  const item = q.enqueue('ข้อความเดิม');
  q.enqueue('ข้อความที่สอง');
  const persisted = storage.getItem(QUEUE_KEY);
  const originalSetItem = storage.setItem;
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => q.enqueue('ข้อความใหม่'), OfflineQueueStorageError);
  assert.throws(() => q.markTried(item.id), OfflineQueueStorageError);
  assert.throws(() => q.remove(item.id), OfflineQueueStorageError);
  assert.equal(q.size(), 2);
  assert.equal(q.list()[0].tries, 0);
  assert.equal(storage.getItem(QUEUE_KEY), persisted);
  storage.setItem = originalSetItem;

  const originalRemoveItem = storage.removeItem;
  storage.removeItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => q.clear(), OfflineQueueStorageError);
  assert.equal(q.size(), 2);
  assert.equal(storage.getItem(QUEUE_KEY), persisted);
  storage.removeItem = originalRemoveItem;
});

test('drain refuses to send when recording an attempt fails', async () => {
  const storage = fakeStorage();
  const q = new OfflineQueue({ storage, now: () => 1000 });
  q.enqueue('อย่าส่งก่อนบันทึก');
  const persisted = storage.getItem(QUEUE_KEY);
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  let calls = 0;
  const res = await q.drain(async () => { calls += 1; });
  assert.equal(calls, 0);
  assert.equal(res.failureStage, 'before-send');
  assert.ok(res.error instanceof OfflineQueueStorageError);
  assert.equal(q.list()[0].tries, 0);
  assert.equal(storage.getItem(QUEUE_KEY), persisted);
});

test('drain reports when delivery succeeded but removing the item could not persist', async () => {
  const storage = fakeStorage();
  const q = new OfflineQueue({ storage, now: () => 1000 });
  q.enqueue('ส่งแล้ว แต่อาจซ้ำ');
  storage.removeItem = () => { throw new Error('QuotaExceededError'); };
  const res = await q.drain(async () => true);
  assert.equal(res.sent, 1, 'handler succeeded even though durable queue removal failed');
  assert.equal(res.failureStage, 'after-send');
  assert.ok(res.error instanceof OfflineQueueStorageError);
  assert.equal(q.size(), 1);
  assert.equal(q.list()[0].tries, 1);
});

test('clear empties both memory and storage', () => {
  const storage = fakeStorage();
  const q = new OfflineQueue({ storage, now: () => 1000 });
  q.enqueue('x');
  q.clear();
  assert.equal(q.size(), 0);
  assert.equal(storage.getItem(QUEUE_KEY), null);
});
