import test from 'node:test';
import assert from 'node:assert/strict';
import { healthHistoryJson } from '../web/src/core/health-history-export.js';
import { normalizeHealthHistory } from '../web/src/core/health-history.js';
import { parseHealthHistoryBackup, planHealthHistoryImport, applyHealthHistoryImport } from '../web/src/core/health-history-import.js';

const backup = (snapshots) => ({ format: 'no7-health-history', schema: 1, exportedAt: '2026-11-11T12:00:00.000Z', snapshots });
const snapshot = (date, score, extra = {}) => ({ date, score, grade: score >= 90 ? 'A' : score >= 75 ? 'B' : 'C', issues: { high: 0, medium: 1, low: 0 }, ...extra });
function store() {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test('parse accepts the export format and whitelists normalized summary fields', () => {
  const json = healthHistoryJson({ schema: 1, snapshots: [snapshot('2026-11-10', 90, { privateText: 'secret' })] }, { now: Date.parse('2026-11-11T12:00:00Z') });
  const parsed = parseHealthHistoryBackup(json);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.history.snapshots.length, 1);
  assert.deepEqual(parsed.history.snapshots[0], snapshot('2026-11-10', 90));
  assert.equal(parsed.dropped, 0);
});

test('rejects malformed JSON, wrong formats, schemas, timestamps and oversized files', () => {
  assert.equal(parseHealthHistoryBackup('{').error, 'invalid-json');
  assert.equal(parseHealthHistoryBackup(' '.repeat(65_537)).error, 'too-large');
  assert.equal(parseHealthHistoryBackup({}).error, 'invalid-format');
  assert.equal(parseHealthHistoryBackup(backup([]) && { ...backup([]), schema: 2 }).error, 'unsupported-schema');
  assert.equal(parseHealthHistoryBackup({ ...backup([]), exportedAt: 'not-a-date' }).error, 'invalid-export-date');
  assert.equal(parseHealthHistoryBackup(backup(Array.from({ length: 31 }, (_, i) => snapshot(`2026-10-${String(i + 1).padStart(2, '0')}`, 70)))).error, 'too-many-snapshots');
});

test('import plan merges by local date, incoming wins conflicts, and does not mutate current', () => {
  const current = normalizeHealthHistory({ schema: 1, snapshots: [snapshot('2026-11-09', 70), snapshot('2026-11-10', 80)] });
  const parsed = parseHealthHistoryBackup(backup([snapshot('2026-11-10', 95), snapshot('2026-11-11', 88)]));
  const plan = planHealthHistoryImport(current, parsed);
  assert.equal(plan.ok, true);
  assert.deepEqual({ added: plan.added, replaced: plan.replaced, unchanged: plan.unchanged, trimmed: plan.trimmed, total: plan.total }, { added: 1, replaced: 1, unchanged: 0, trimmed: 0, total: 3 });
  assert.equal(plan.next.snapshots[1].score, 95);
  assert.equal(current.snapshots[1].score, 80);
});

test('import plan trims oldest rows to 30 and tracks unchanged entries', () => {
  const dates = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    return snapshot(date, 75);
  });
  const current = normalizeHealthHistory({ schema: 1, snapshots: dates });
  const parsed = parseHealthHistoryBackup(backup([snapshot('2026-01-05', 75), snapshot('2026-02-01', 90)]));
  const plan = planHealthHistoryImport(current, parsed);
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.added, 1);
  assert.equal(plan.trimmed, 1);
  assert.equal(plan.next.snapshots.length, 30);
  assert.equal(plan.next.snapshots[0].date, '2026-01-02');
});

test('storage changes only when the approved plan is applied', () => {
  const storage = store();
  const current = normalizeHealthHistory({ schema: 1, snapshots: [snapshot('2026-11-09', 70)] });
  const parsed = parseHealthHistoryBackup(backup([snapshot('2026-11-10', 92)]));
  const plan = planHealthHistoryImport(current, parsed);
  assert.equal(storage.values.size, 0, 'planning is read-only');
  assert.equal(applyHealthHistoryImport({ ok: false }, storage), false);
  assert.equal(storage.values.size, 0);
  assert.equal(applyHealthHistoryImport(plan, storage), true);
  assert.equal(JSON.parse(storage.getItem('no7.health.history.v1')).snapshots.length, 2);
});
