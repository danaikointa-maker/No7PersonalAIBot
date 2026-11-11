import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HEALTH_HISTORY_KEY, normalizeHealthHistory, recordHealthSnapshot,
  readHealthHistory, writeHealthHistory, clearHealthHistory, healthTrend,
  filterHealthHistory, healthWindowSummary,
} from '../web/src/core/health-history.js';

const nowFor = (day) => Date.parse(`2026-11-${String(day).padStart(2, '0')}T12:00:00Z`);
const report = (score, issues = []) => ({ score, grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D', issues });

function storage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    map,
  };
}

test('history keeps only a minimal, validated snapshot schema', () => {
  const history = recordHealthSnapshot({ snapshots: [] }, report(82, [
    { severity: 'high', count: 2 }, { severity: 'low', count: 1 },
  ]), nowFor(10));
  assert.deepEqual(history, {
    schema: 1,
    snapshots: [{ date: '2026-11-10', score: 82, grade: 'B', issues: { high: 2, medium: 0, low: 1 } }],
  });
  assert.equal(JSON.stringify(history).includes('private item text'), false);
});

test('a scan on the same day replaces that day without pruning earlier history', () => {
  let history = { schema: 1, snapshots: [] };
  for (let day = 1; day <= 31; day++) {
    history = recordHealthSnapshot(history, report(day), Date.parse(`2026-10-${String(day).padStart(2, '0')}T12:00:00Z`));
  }
  assert.equal(history.snapshots.length, 31);
  const repeat = recordHealthSnapshot(history, report(55), Date.parse('2026-10-31T18:00:00Z'));
  assert.equal(repeat.snapshots.length, 31);
  assert.equal(repeat.snapshots.at(-1).score, 55);
});

test('normalize drops malformed rows, clamps values and strips non-summary fields', () => {
  const clean = normalizeHealthHistory({ schema: 1, snapshots: [
    { date: 'bad', score: 12, title: 'private item text' },
    { date: '2026-99-10', score: 30 },
    { date: '2026-11-10', score: 140, grade: 'X', notes: 'private item text', issues: { high: -3, medium: 2.9, low: 1 } },
  ] });
  assert.deepEqual(clean.snapshots, [{ date: '2026-11-10', score: 100, grade: 'A', issues: { high: 0, medium: 2, low: 1 } }]);
});

test('storage read/write/clear is guarded and versioned', () => {
  const store = storage();
  const history = recordHealthSnapshot(null, report(97), nowFor(10));
  assert.equal(writeHealthHistory(history, store), true);
  assert.equal(JSON.parse(store.getItem(HEALTH_HISTORY_KEY)).schema, 1);
  assert.deepEqual(readHealthHistory(store), history);
  assert.equal(clearHealthHistory(store), true);
  assert.deepEqual(readHealthHistory(store).snapshots, []);
  assert.equal(writeHealthHistory(history, null), false);
});

test('trend reports first scan and score delta in both languages', () => {
  let history = recordHealthSnapshot(null, report(70), nowFor(10));
  assert.equal(healthTrend(history, 'en').direction, 'new');
  history = recordHealthSnapshot(history, report(86), nowFor(11));
  assert.deepEqual(healthTrend(history, 'en'), {
    latest: history.snapshots[1], previous: history.snapshots[0], delta: 16,
    direction: 'up', label: 'Change since previous scan: +16 points',
  });
  assert.equal(healthTrend(history, 'th').label, 'เปลี่ยนจากการตรวจก่อนหน้า: +16 คะแนน');
});

test('filterHealthHistory uses inclusive local calendar ranges and ignores future dates', () => {
  const history = { schema: 1, snapshots: [
    { date: '2026-11-03', score: 40, grade: 'D', issues: {} },
    { date: '2026-11-04', score: 60, grade: 'C', issues: {} },
    { date: '2026-11-10', score: 100, grade: 'A', issues: {} },
    { date: '2026-11-11', score: 95, grade: 'A', issues: {} },
  ] };
  const short = filterHealthHistory(history, { days: 7, now: nowFor(10) });
  assert.deepEqual(short.snapshots.map((item) => item.date), ['2026-11-04', '2026-11-10']);
  assert.equal(filterHealthHistory(history, { days: 30, now: nowFor(10) }).snapshots.length, 3);
  assert.equal(filterHealthHistory(history, { days: 1, now: nowFor(10) }).range, 30, 'only supported presets are accepted');
});

test('healthWindowSummary describes sparse ranges with average, extrema and delta', () => {
  const history = { schema: 1, snapshots: [
    { date: '2026-11-05', score: 60, grade: 'C', issues: {} },
    { date: '2026-11-09', score: 81, grade: 'B', issues: {} },
  ] };
  assert.deepEqual(healthWindowSummary(history, { days: 7, now: nowFor(10), lang: 'en' }), {
    days: 7, count: 2, average: 70.5, min: 60, max: 81, delta: 21, direction: 'up',
    start: '2026-11-05', end: '2026-11-09', label: 'Change from first to latest: +21 points',
  });
  assert.equal(healthWindowSummary({ schema: 1, snapshots: [] }, { days: 7, now: nowFor(10) }).count, 0);
});
