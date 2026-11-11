import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHealthHistory } from '../web/src/ui/health-history.js';
import { recordHealthSnapshot } from '../web/src/core/health-history.js';

test('history UI renders an accessible SVG and a readable summary list', () => {
  let history = recordHealthSnapshot(null, { score: 70, grade: 'C', issues: [{ severity: 'low', count: 2 }] }, Date.parse('2026-11-10T12:00:00Z'));
  history = recordHealthSnapshot(history, { score: 84, grade: 'B', issues: [] }, Date.parse('2026-11-11T12:00:00Z'));
  const html = renderHealthHistory(history, { lang: 'en', copy: { history: 'History', historyChart: 'Score chart', clearHistory: 'Clear', historyPrivacy: 'Summary only' } });
  assert.match(html, /<svg[^>]+role="img"[^>]+aria-label="Score chart"/);
  assert.match(html, /Change since previous scan: \+14 points/);
  assert.match(html, /2026-11-11/);
  assert.match(html, /id="health-history-clear"/);
  assert.doesNotMatch(html, /private item text/);
});

test('history UI gives an accessible empty state without a clear button', () => {
  const html = renderHealthHistory({ snapshots: [] }, { lang: 'th', copy: { noHistory: 'Empty' } });
  assert.match(html, /Empty/);
  assert.doesNotMatch(html, /<svg/);
  assert.doesNotMatch(html, /health-history-clear/);
});
