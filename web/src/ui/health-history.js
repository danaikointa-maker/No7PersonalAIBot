import { filterHealthHistory, healthTrend, healthWindowSummary } from '../core/health-history.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export function renderHealthHistory(history, { lang = 'th', copy = {}, range = 30, now = Date.now() } = {}) {
  const allSnapshots = history?.snapshots || [];
  const filtered = filterHealthHistory(history, { days: range, now });
  const snapshots = filtered.snapshots;
  const trend = healthTrend(filtered, lang);
  const summary = healthWindowSummary(filtered, { days: range, now, lang });
  const rows = snapshots.slice().reverse().map((item) => {
    const total = item.issues.high + item.issues.medium + item.issues.low;
    return `<li><time datetime="${item.date}">${item.date}</time><strong>${item.score}/100 · ${item.grade}</strong><span>${total} ${lang === 'en' ? 'issues' : 'ปัญหา'}</span></li>`;
  }).join('');
  let chart = '';
  if (snapshots.length) {
    const points = snapshots.map((item, index) => {
      const x = snapshots.length === 1 ? 180 : 12 + index * (336 / (snapshots.length - 1));
      const y = 88 - (item.score * 0.72);
      return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), item };
    });
    const polyline = points.map(({ x, y }) => `${x},${y}`).join(' ');
    const circles = points.map(({ x, y, item }) => `<circle cx="${x}" cy="${y}" r="3"><title>${item.date}: ${item.score}/100 (${item.grade})</title></circle>`).join('');
    chart = `<svg class="health-history-chart" role="img" aria-label="${esc(copy.historyChart || 'Health score history')}" viewBox="0 0 360 100" preserveAspectRatio="none"><title>${esc(copy.historyChart || 'Health score history')}</title><desc>${esc(trend.label)}</desc><line x1="8" y1="16" x2="352" y2="16"/><line x1="8" y1="52" x2="352" y2="52"/><line x1="8" y1="88" x2="352" y2="88"/><polyline points="${polyline}"/>${circles}</svg>`;
  }
  const period = snapshots.length
    ? `<div class="health-window-summary"><span>${esc(copy.daysWithData || 'Days with data')}: ${summary.count}/${summary.days}</span><span>${esc(copy.average || 'Average')}: ${summary.average} · ${esc(copy.lowest || 'Low')}: ${summary.min} · ${esc(copy.highest || 'High')}: ${summary.max}</span><span>${esc(copy.rangeDelta || 'Change')}: ${esc(summary.label)}</span></div>`
    : `<p class="hint">${esc(allSnapshots.length ? (copy.noRangeHistory || 'No scans in this range') : (copy.noHistory || 'No history yet'))}</p>`;
  const rangeButtons = allSnapshots.length
    ? `<div class="health-history-ranges" role="group" aria-label="${esc(copy.rangeLabel || 'Range')}"><button type="button" data-health-range="7" aria-pressed="${range === 7}">${esc(copy.range7 || '7 days')}</button><button type="button" data-health-range="30" aria-pressed="${range !== 7}">${esc(copy.range30 || '30 days')}</button></div>`
    : '';
  return `<section class="health-history" aria-label="${esc(copy.history || 'Health history')}">
    <div class="health-history-head"><strong>${esc(copy.history || 'Health history')}</strong>${allSnapshots.length ? `<div class="digest-actions"><button data-health-export="md" type="button">${esc(copy.exportMarkdown || '⬇️ Markdown')}</button><button data-health-export="csv" type="button">${esc(copy.exportCsv || '⬇️ CSV')}</button><button data-health-export="json" type="button">${esc(copy.exportJson || '⬇️ JSON')}</button><button id="health-history-clear" type="button">${esc(copy.clearHistory || 'Clear history')}</button></div>` : ''}</div>
    <p class="hint health-history-privacy">${esc(copy.historyPrivacy || '')}</p>
    ${rangeButtons}
    ${snapshots.length ? `<p class="health-trend ${trend.direction}">${esc(trend.label)}</p>${chart}${period}<ol class="health-history-list">${rows}</ol>` : period}
  </section>`;
}
