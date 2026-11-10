import test from 'node:test';
import assert from 'node:assert/strict';
import {
  usageBreakdown, formatBytes, estimateQuota, isPersisted,
  requestPersistentStorage, clearGroup, safeSet, isQuotaError, STORAGE_KEYS,
} from '../web/src/core/storage.js';

function fakeLS(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

test('formatBytes scales units', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(3 * 1024 * 1024), '3.00 MB');
});

test('usageBreakdown reports bytes per key', () => {
  const env = { localStorage: fakeLS({ 'no7.memory.v2': 'x'.repeat(100), 'no7.todos.v1': 'y'.repeat(10) }) };
  const { rows, total } = usageBreakdown(env);
  const mem = rows.find((r) => r.key === 'no7.memory.v2');
  assert.equal(mem.bytes, 200);           // UTF-16
  assert.equal(total, 220);
});

test('estimateQuota converts to readable numbers', async () => {
  const env = { navigator: { storage: { estimate: async () => ({ usage: 1024, quota: 4096 }) } } };
  const est = await estimateQuota(env);
  assert.equal(est.percent, 25);
  assert.equal(est.usageText, '1.0 KB');
});

test('estimateQuota returns null when unsupported', async () => {
  assert.equal(await estimateQuota({ navigator: {} }), null);
});

test('persistence helpers degrade gracefully', async () => {
  assert.equal(await isPersisted({ navigator: {} }), false);
  await assert.rejects(() => requestPersistentStorage({ navigator: {} }), /ไม่รองรับ/);
  const ok = await requestPersistentStorage({ navigator: { storage: { persist: async () => true } } });
  assert.equal(ok, true);
});

test('clearGroup removes only that group', () => {
  const known = STORAGE_KEYS.filter((k) => k.group === 'notes').map((k) => k.key);
  const ls = fakeLS(Object.fromEntries([...known.map((k) => [k, 'v']), ['no7.memory.v2', '{}']]));
  const removed = clearGroup('notes', { localStorage: ls });
  assert.equal(removed, known.length);
  assert.equal(ls.getItem('no7.memory.v2'), '{}');
  assert.ok(known.every((k) => ls.getItem(k) === null));
});

test('safeSet reports quota errors instead of throwing', () => {
  const ls = {
    setItem: () => { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; },
    getItem: () => null, removeItem: () => {},
  };
  const res = safeSet('k', 'v', { localStorage: ls });
  assert.equal(res.ok, false);
  assert.match(res.error, /เต็ม/);
});

test('safeSet succeeds on normal storage', () => {
  assert.deepEqual(safeSet('k', 'v', { localStorage: fakeLS() }), { ok: true });
});

test('isQuotaError detects the common names', () => {
  assert.equal(isQuotaError({ name: 'QuotaExceededError' }), true);
  assert.equal(isQuotaError(new Error('quota exceeded')), true);
  assert.equal(isQuotaError(new Error('other')), false);
});
