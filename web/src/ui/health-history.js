import { healthTrend } from '../core/health-history.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export function renderHealthHistory(history, { lang = 'th', copy = {} } = {}) {
  const snapshots = history?.snapshots || [];
  const trend = healthTrend(history, lang);
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
  return `<section class="health-history" aria-label="${esc(copy.history || 'Health history')}">
    <div class="health-history-head"><strong>${esc(copy.history || 'Health history')}</strong>${snapshots.length ? `<button id="health-history-clear" type="button">${esc(copy.clearHistory || 'Clear history')}</button>` : ''}</div>
    <p class="hint health-history-privacy">${esc(copy.historyPrivacy || '')}</p>
    ${snapshots.length ? `<p class="health-trend ${trend.direction}">${esc(trend.label)}</p>${chart}<ol class="health-history-list">${rows}</ol>` : `<p class="hint">${esc(copy.noHistory || 'No history yet')}</p>`}
  </section>`;
}
