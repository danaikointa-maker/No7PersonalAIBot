import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHealthHistory } from '../web/src/ui/health-history.js';
import { recordHealthSnapshot } from '../web/src/core/health-history.js';

test('history UI renders an accessible SVG and a readable summary list', () => {
  let history = recordHealthSnapshot(null, { score: 70, grade: 'C', issues: [{ severity: 'low', count: 2 }] }, Date.parse('2026-11-10T12:00:00Z'));
  history = recordHealthSnapshot(history, { score: 84, grade: 'B', issues: [] }, Date.parse('2026-11-11T12:00:00Z'));
  const html = renderHealthHistory(history, { lang: 'en', range: 7, now: Date.parse('2026-11-11T12:00:00Z'), copy: { history: 'History', historyChart: 'Score chart', clearHistory: 'Clear', historyPrivacy: 'Summary only', range7: '7 days', range30: '30 days', rangeLabel: 'Range', daysWithData: 'Days with data', average: 'Average', low: 'Low', high: 'High', rangeDelta: 'Change' } });
  assert.match(html, /<svg[^>]+role="img"[^>]+aria-label="Score chart"/);
  assert.match(html, /Change since previous scan: \+14 points/);
  assert.match(html, /2026-11-11/);
  assert.match(html, /id="health-history-clear"/);
  assert.match(html, /data-health-range="7" aria-pressed="true"/);
  assert.match(html, /Days with data: 2\/7/);
  assert.match(html, /Change: Change from first to latest: \+14 points/);
  assert.doesNotMatch(html, /private item text/);
});

test('history UI gives an accessible empty state without a clear button', () => {
  const html = renderHealthHistory({ snapshots: [] }, { lang: 'th', copy: { noHistory: 'Empty' } });
  assert.match(html, /Empty/);
  assert.doesNotMatch(html, /<svg/);
  assert.doesNotMatch(html, /health-history-clear/);
});
