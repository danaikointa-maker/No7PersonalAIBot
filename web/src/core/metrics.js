// Metrics — วัดความเร็วและความสำเร็จของงาน (แชท, เครื่องมือ, เสียง)
// เก็บในเครื่องเท่านั้น (localStorage) และจำกัดจำนวนตัวอย่างเพื่อไม่ให้กินที่

export const METRICS_KEY = 'no7.metrics.v1';
export const MAX_SAMPLES = 300;

export function percentile(values = [], p = 0.5) {
  const list = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!list.length) return 0;
  const idx = Math.min(list.length - 1, Math.max(0, Math.ceil(p * list.length) - 1));
  return list[idx];
}

export function formatMs(ms) {
  const v = Number(ms) || 0;
  if (v < 1000) return `${Math.round(v)} ms`;
  if (v < 60000) return `${(v / 1000).toFixed(v < 10000 ? 2 : 1)} s`;
  return `${Math.floor(v / 60000)}m ${Math.round((v % 60000) / 1000)}s`;
}

export const METRIC_KINDS = {
  chat: { emoji: '💬', label: 'แชท' },
  tool: { emoji: '🧰', label: 'เครื่องมือ' },
  tts: { emoji: '🔊', label: 'เสียง' },
};

export class Metrics {
  constructor({ storage = null, key = METRICS_KEY, max = MAX_SAMPLES, now = () => Date.now() } = {}) {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.key = key;
    this.max = max;
    this.now = now;
    this.samples = this._load();
  }

  _load() {
    try {
      const raw = this.storage?.getItem(this.key);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((s) => s && s.kind) : [];
    } catch { return []; }
  }

  _save() {
    try { this.storage?.setItem(this.key, JSON.stringify(this.samples)); } catch { /* quota */ }
  }

  /** @param {{kind: 'chat'|'tool'|'tts', label?: string, firstTokenMs?: number, totalMs: number, ok?: boolean, error?: string}} sample */
  record(sample = {}) {
    const kind = METRIC_KINDS[sample.kind] ? sample.kind : 'chat';
    const entry = {
      kind,
      label: String(sample.label || '').slice(0, 60),
      firstTokenMs: Number.isFinite(sample.firstTokenMs) ? Math.max(0, Math.round(sample.firstTokenMs)) : null,
      totalMs: Math.max(0, Math.round(Number(sample.totalMs) || 0)),
      ok: sample.ok !== false,
      error: sample.error ? String(sample.error).slice(0, 120) : null,
      at: this.now(),
    };
    this.samples.push(entry);
    if (this.samples.length > this.max) this.samples = this.samples.slice(-this.max);
    this._save();
    return entry;
  }

  entries(kind = null) {
    return kind ? this.samples.filter((s) => s.kind === kind) : [...this.samples];
  }

  /** สรุปภาพรวม + แยกตาม label (ใช้ในหน้าตั้งค่า) */
  summary() {
    const out = { total: this.samples.length, kinds: {}, labels: [] };
    for (const kind of Object.keys(METRIC_KINDS)) {
      const list = this.entries(kind);
      if (!list.length) {
        out.kinds[kind] = { count: 0, avg: 0, p50: 0, p95: 0, okRate: null, firstTokenAvg: null };
        continue;
      }
      const totals = list.map((s) => s.totalMs);
      const firsts = list.map((s) => s.firstTokenMs).filter((v) => Number.isFinite(v));
      out.kinds[kind] = {
        count: list.length,
        avg: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
        p50: percentile(totals, 0.5),
        p95: percentile(totals, 0.95),
        okRate: list.filter((s) => s.ok).length / list.length,
        firstTokenAvg: firsts.length ? Math.round(firsts.reduce((a, b) => a + b, 0) / firsts.length) : null,
      };
    }

    const byLabel = new Map();
    for (const s of this.samples) {
      if (!s.label) continue;
      const key = `${s.kind}:${s.label}`;
      const cur = byLabel.get(key) || { kind: s.kind, label: s.label, count: 0, total: 0, ok: 0 };
      cur.count += 1;
      cur.total += s.totalMs;
      if (s.ok) cur.ok += 1;
      byLabel.set(key, cur);
    }
    out.labels = [...byLabel.values()]
      .map((v) => ({ kind: v.kind, label: v.label, count: v.count, avg: Math.round(v.total / v.count), okRate: v.ok / v.count }))
      .sort((a, b) => b.count - a.count || b.avg - a.avg)
      .slice(0, 8);
    return out;
  }

  reset() {
    this.samples = [];
    this._save();
  }

  export() {
    return { exportedAt: this.now(), samples: this.entries() };
  }
}
