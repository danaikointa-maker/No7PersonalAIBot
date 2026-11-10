import test from 'node:test';
import assert from 'node:assert/strict';

import { Metrics, percentile, formatMs, METRICS_KEY, METRIC_KINDS } from '../web/src/core/metrics.js';

function fakeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('percentile interpolates by rank', () => {
  assert.equal(percentile([], 0.5), 0);
  assert.equal(percentile([10, 20, 30, 40], 0.5), 20);
  assert.equal(percentile([10, 20, 30, 40], 0.95), 40);
  assert.equal(percentile([5], 0.9), 5);
  assert.equal(percentile([null, 10, undefined, 30], 0.5), 10);
});

test('formatMs scales units', () => {
  assert.equal(formatMs(0), '0 ms');
  assert.equal(formatMs(320), '320 ms');
  assert.equal(formatMs(1500), '1.50 s');
  assert.equal(formatMs(12500), '12.5 s');
  assert.equal(formatMs(65000), '1m 5s');
});

test('records samples with defaults and persists', () => {
  const storage = fakeStorage();
  const m = new Metrics({ storage, now: () => 42 });
  m.record({ kind: 'chat', totalMs: 1200, firstTokenMs: 300, label: 'openai' });
  m.record({ kind: 'tool', totalMs: 80.6, label: 'weather' });
  m.record({ kind: 'weird', totalMs: 10 });
  const all = m.entries();
  assert.equal(all.length, 3);
  assert.equal(all[2].kind, 'chat', 'unknown kind falls back to chat');
  assert.equal(all[1].totalMs, 81);
  assert.equal(all[0].ok, true);
  assert.equal(all[0].at, 42);
  assert.ok(storage.getItem(METRICS_KEY).includes('weather'));
});

test('summary computes avg/p50/p95/okRate/first token', () => {
  const m = new Metrics({ now: () => 1 });
  [100, 200, 300, 400].forEach((ms, i) => m.record({ kind: 'chat', totalMs: ms, firstTokenMs: 50 + i * 10, ok: i !== 3 }));
  m.record({ kind: 'tool', totalMs: 30, label: 'weather', ok: true });
  const sum = m.summary();
  assert.equal(sum.total, 5);
  assert.equal(sum.kinds.chat.count, 4);
  assert.equal(sum.kinds.chat.avg, 250);
  assert.equal(sum.kinds.chat.p50, 200);
  assert.equal(sum.kinds.chat.p95, 400);
  assert.equal(sum.kinds.chat.firstTokenAvg, 65);
  assert.equal(Math.round(sum.kinds.chat.okRate * 100), 75);
  assert.equal(sum.kinds.tool.count, 1);
  assert.equal(sum.kinds.tts.count, 0);
  assert.equal(sum.labels[0].label, 'weather');
  assert.equal(METRIC_KINDS.tool.label, 'เครื่องมือ');
});

test('caps stored samples and can reset/export', () => {
  const m = new Metrics({ max: 3, now: () => 7 });
  for (let i = 0; i < 5; i++) m.record({ kind: 'tts', totalMs: i, label: `p${i}` });
  assert.equal(m.entries().length, 3);
  assert.deepEqual(m.entries().map((e) => e.label), ['p2', 'p3', 'p4']);
  const dump = m.export();
  assert.equal(dump.samples.length, 3);
  assert.equal(dump.exportedAt, 7);
  m.reset();
  assert.equal(m.entries().length, 0);
  assert.equal(m.summary().total, 0);
});
