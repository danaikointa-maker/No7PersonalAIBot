import test from 'node:test';
import assert from 'node:assert/strict';
import { healthHistoryCsv, healthHistoryMarkdown, healthHistoryJson } from '../web/src/core/health-history-export.js';
import { recordHealthSnapshot } from '../web/src/core/health-history.js';

const at = (day) => Date.parse(`2026-11-${String(day).padStart(2, '0')}T12:00:00Z`);

test('CSV exports BOM, localized columns and summary counts only', () => {
  const history = recordHealthSnapshot(null, { score: 72, grade: 'C', issues: [
    { severity: 'high', count: 2 }, { severity: 'low', count: 1 },
  ] }, at(10));
  const csv = healthHistoryCsv(history);
  assert.ok(csv.startsWith('\ufeffวันที่,คะแนน,เกรด,ปัญหาระดับสูง,ปัญหาระดับกลาง,ปัญหาระดับต่ำ,ปัญหารวม\r\n'));
  assert.match(csv, /2026-11-10,72,C,2,0,1,3/);
  assert.doesNotMatch(csv, /private|title|text/i);
  assert.match(healthHistoryCsv(history, { lang: 'en' }), /Date,Score,Grade,High issues/);
});

test('Markdown includes trend, table, and privacy note in both languages', () => {
  let history = recordHealthSnapshot(null, { score: 70, grade: 'C', issues: [] }, at(10));
  history = recordHealthSnapshot(history, { score: 85, grade: 'B', issues: [{ severity: 'medium', count: 2 }] }, at(11));
  const md = healthHistoryMarkdown(history, { lang: 'en', now: at(11) });
  assert.match(md, /^# Data health history/);
  assert.match(md, /Change since previous scan: \+15 points/);
  assert.match(md, /2026-11-11 \| 85 \| B \| 0 \| 2 \| 0 \| 2/);
  assert.match(md, /no personal item text/i);
  assert.match(healthHistoryMarkdown(history), /ประวัติสุขภาพข้อมูล/);
});

test('CSV drops formula-like dates and private payload fields before export', () => {
  const csv = healthHistoryCsv({ schema: 1, snapshots: [
    { date: '=1+1', score: 100, grade: 'A', text: 'secret note', issues: { high: 0, medium: 0, low: 0 } },
    { date: '2026-11-10', score: 90, grade: 'A', title: 'private event', issues: { high: 0, medium: 0, low: 0 }, privateText: 'secret' },
  ] });
  assert.doesNotMatch(csv, /=1\+1|secret|private event/);
  assert.match(csv, /2026-11-10,90,A,0,0,0,0/);
});

test('JSON export adds a versioned envelope and strips unrecognized private fields', () => {
  const json = healthHistoryJson({ schema: 1, snapshots: [{
    date: '2026-11-10', score: 91, grade: 'A', issues: { high: 0, medium: 1, low: 2 },
    text: 'private note', title: 'personal event', custom: { secret: true },
  }] }, { now: Date.parse('2026-11-11T12:00:00Z') });
  const data = JSON.parse(json);
  assert.equal(data.format, 'no7-health-history');
  assert.equal(data.schema, 1);
  assert.equal(data.exportedAt, '2026-11-11T12:00:00.000Z');
  assert.deepEqual(data.snapshots, [{ date: '2026-11-10', score: 91, grade: 'A', issues: { high: 0, medium: 1, low: 2 } }]);
  assert.doesNotMatch(json, /private note|personal event|secret/);
});

test('JSON export includes all retained daily summary metrics beyond the former 30-day cap', () => {
  const snapshots = Array.from({ length: 45 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    return { date, score: i, grade: 'D', issues: { high: 0, medium: 0, low: 0 } };
  });
  const exported = JSON.parse(healthHistoryJson({ schema: 1, snapshots }));
  assert.equal(exported.snapshots.length, 45);
  assert.equal(exported.snapshots[0].date, '2026-01-01');
  assert.equal(exported.snapshots.at(-1).date, '2026-02-14');
});

test('empty reports still return localized safe output', () => {
  assert.match(healthHistoryCsv(null), /^\ufeffวันที่,/);
  assert.match(healthHistoryMarkdown(null), /ยังไม่มีประวัติสุขภาพ/);
  assert.match(healthHistoryMarkdown(null, { lang: 'en' }), /No saved health history/);
  assert.deepEqual(JSON.parse(healthHistoryJson(null, { now: at(10) })).snapshots, []);
});
