export const HEALTH_HISTORY_KEY = 'no7.health.history.v1';
export const HEALTH_HISTORY_SCHEMA = 1;
export const HEALTH_HISTORY_LIMIT = 1_000_000;

const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const dateKey = (value) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const count = (value) => Math.max(0, Math.min(10000, Math.trunc(Number(value) || 0)));

export function normalizeHealthHistory(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return { schema: HEALTH_HISTORY_SCHEMA, snapshots: [] }; }
  }
  if (raw && !Array.isArray(raw) && raw.schema !== HEALTH_HISTORY_SCHEMA) return { schema: HEALTH_HISTORY_SCHEMA, snapshots: [] };
  const entries = Array.isArray(raw?.snapshots) ? raw.snapshots : Array.isArray(raw) ? raw : [];
  const byDate = new Map();
  for (const entry of entries) {
    if (!validDate(String(entry?.date || ''))) continue;
    const score = Math.max(0, Math.min(100, Math.round(Number(entry?.score))));
    if (!Number.isFinite(score)) continue;
    const grade = ['A', 'B', 'C', 'D'].includes(entry?.grade) ? entry.grade : (score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D');
    const issues = entry?.issues || {};
    byDate.set(entry.date, {
      date: entry.date, score, grade,
      issues: { high: count(issues.high), medium: count(issues.medium), low: count(issues.low) },
    });
  }
  const snapshots = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { schema: HEALTH_HISTORY_SCHEMA, snapshots };
}

export function recordHealthSnapshot(history, report, now = Date.now()) {
  const normalized = normalizeHealthHistory(history);
  const day = new Date(now).toISOString().slice(0, 10);
  const counts = { high: 0, medium: 0, low: 0 };
  for (const item of report?.issues || []) {
    if (Object.hasOwn(counts, item.severity)) counts[item.severity] += Math.max(1, count(item.count));
  }
  const snapshot = {
    date: day,
    score: Math.max(0, Math.min(100, Math.round(Number(report?.score) || 0))),
    grade: ['A', 'B', 'C', 'D'].includes(report?.grade) ? report.grade : 'D',
    issues: counts,
  };
  const snapshots = normalized.snapshots.filter((item) => item.date !== day);
  snapshots.push(snapshot);
  return normalizeHealthHistory({ schema: HEALTH_HISTORY_SCHEMA, snapshots });
}

export function readHealthHistory(storage = globalThis.localStorage) {
  try { return normalizeHealthHistory(storage?.getItem(HEALTH_HISTORY_KEY)); }
  catch { return { schema: HEALTH_HISTORY_SCHEMA, snapshots: [] }; }
}

export function writeHealthHistory(history, storage = globalThis.localStorage) {
  try {
    storage?.setItem(HEALTH_HISTORY_KEY, JSON.stringify(normalizeHealthHistory(history)));
    return !!storage;
  } catch { return false; }
}

export function clearHealthHistory(storage = globalThis.localStorage) {
  try { storage?.removeItem(HEALTH_HISTORY_KEY); return !!storage; }
  catch { return false; }
}

export function withHealthHistoryRestore(history, applyMemory, storage = globalThis.localStorage) {
  if (!Array.isArray(history)) return applyMemory();
  const previous = storage.getItem(HEALTH_HISTORY_KEY);
  if (!writeHealthHistory({ schema: HEALTH_HISTORY_SCHEMA, snapshots: history }, storage)) {
    throw new Error('Health summary restore could not be saved; existing memory and health history are unchanged');
  }
  try {
    const result = applyMemory();
    if (!result) throw new Error('Memory restore plan could not be applied');
    return result;
  } catch (error) {
    try {
      if (previous == null) clearHealthHistory(storage);
      else storage.setItem(HEALTH_HISTORY_KEY, previous);
    } catch { /* best-effort restore of the prior summary */ }
    throw error;
  }
}

export function filterHealthHistory(history, { days = 30, now = Date.now() } = {}) {
  const range = days === 7 ? 7 : 30;
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const endKey = dateKey(end);
  end.setDate(end.getDate() - (range - 1));
  const startKey = dateKey(end);
  const snapshots = normalizeHealthHistory(history).snapshots.filter((item) => item.date >= startKey && item.date <= endKey);
  return { schema: HEALTH_HISTORY_SCHEMA, snapshots, range, start: startKey, end: endKey };
}

export function healthWindowSummary(history, { days = 30, now = Date.now(), lang = 'th' } = {}) {
  const filtered = filterHealthHistory(history, { days, now });
  const snapshots = filtered.snapshots;
  const scores = snapshots.map((item) => item.score);
  const count = scores.length;
  const delta = count > 1 ? scores.at(-1) - scores[0] : null;
  const direction = delta == null ? 'new' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
  const summary = {
    days: filtered.range, count, average: count ? Math.round(scores.reduce((sum, score) => sum + score, 0) / count * 10) / 10 : null,
    min: count ? Math.min(...scores) : null, max: count ? Math.max(...scores) : null,
    delta, direction, start: snapshots[0]?.date || null, end: snapshots.at(-1)?.date || null,
  };
  summary.label = delta == null
    ? (lang === 'en' ? 'Need at least two scans to compare this range' : 'ต้องมีการตรวจอย่างน้อย 2 ครั้งเพื่อเทียบช่วงนี้')
    : (lang === 'en' ? `Change from first to latest: ${delta > 0 ? '+' : ''}${delta} points` : `เปลี่ยนจากครั้งแรกถึงล่าสุด: ${delta > 0 ? '+' : ''}${delta} คะแนน`);
  return summary;
}

export function healthTrend(history, lang = 'th') {
  const snapshots = normalizeHealthHistory(history).snapshots;
  if (!snapshots.length) return { latest: null, previous: null, delta: null, direction: 'empty', label: lang === 'en' ? 'No history yet' : 'ยังไม่มีประวัติ' };
  const latest = snapshots.at(-1);
  const previous = snapshots.at(-2) || null;
  if (!previous) return { latest, previous: null, delta: null, direction: 'new', label: lang === 'en' ? 'First recorded scan' : 'บันทึกการตรวจครั้งแรก' };
  const delta = latest.score - previous.score;
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
  const label = lang === 'en'
    ? `Change since previous scan: ${delta > 0 ? '+' : ''}${delta} points`
    : `เปลี่ยนจากการตรวจก่อนหน้า: ${delta > 0 ? '+' : ''}${delta} คะแนน`;
  return { latest, previous, delta, direction, label };
}
