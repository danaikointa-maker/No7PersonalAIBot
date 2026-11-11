import { HEALTH_HISTORY_LIMIT, HEALTH_HISTORY_SCHEMA, normalizeHealthHistory, writeHealthHistory } from './health-history.js';

const fail = (error) => ({ ok: false, error, history: { schema: HEALTH_HISTORY_SCHEMA, snapshots: [] }, dropped: 0 });

export function parseHealthHistoryBackup(input) {
  let raw = input;
  if (typeof raw === 'string') {
    if (raw.length > 65_536) return fail('too-large');
    try { raw = JSON.parse(raw); } catch { return fail('invalid-json'); }
  }
  if (!raw || typeof raw !== 'object' || raw.format !== 'no7-health-history') return fail('invalid-format');
  if (raw.schema !== HEALTH_HISTORY_SCHEMA) return fail('unsupported-schema');
  if (!Number.isFinite(Date.parse(raw.exportedAt || ''))) return fail('invalid-export-date');
  if (!Array.isArray(raw.snapshots)) return fail('invalid-snapshots');
  if (raw.snapshots.length > HEALTH_HISTORY_LIMIT) return fail('too-many-snapshots');
  const history = normalizeHealthHistory({ schema: HEALTH_HISTORY_SCHEMA, snapshots: raw.snapshots });
  return {
    ok: true, history, exportedAt: new Date(raw.exportedAt).toISOString(),
    dropped: Math.max(0, raw.snapshots.length - history.snapshots.length),
  };
}

export function planHealthHistoryImport(current, parsedBackup) {
  if (!parsedBackup?.ok) return { ok: false, error: parsedBackup?.error || 'invalid-backup' };
  const local = normalizeHealthHistory(current);
  const incoming = normalizeHealthHistory(parsedBackup.history);
  const byDate = new Map(local.snapshots.map((item) => [item.date, item]));
  let added = 0;
  let replaced = 0;
  let unchanged = 0;
  for (const item of incoming.snapshots) {
    const old = byDate.get(item.date);
    if (!old) added++;
    else if (JSON.stringify(old) === JSON.stringify(item)) unchanged++;
    else replaced++;
    byDate.set(item.date, item);
  }
  const all = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = Math.max(0, all.length - HEALTH_HISTORY_LIMIT);
  const next = normalizeHealthHistory({ schema: HEALTH_HISTORY_SCHEMA, snapshots: all });
  return {
    ok: true, next, added, replaced, unchanged, trimmed,
    dropped: parsedBackup.dropped || 0,
    total: next.snapshots.length,
  };
}

export function applyHealthHistoryImport(plan, storage = globalThis.localStorage) {
  if (!plan?.ok || !plan.next) return false;
  return writeHealthHistory(plan.next, storage);
}
