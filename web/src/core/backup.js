// สำรอง/กู้คืนข้อมูลทั้งแอป — ไฟล์เดียว, schema ชัดเจน, dry-run ก่อนเขียนทับ
//
// หลักการ:
//   • ค่าเริ่มต้น **ไม่พาความลับออกไป** (API keys, tokens) — ต้องเลือกเอง
//   • validate ก่อนใช้เสมอ + checksum กันไฟล์เสีย/ถูกแก้
//   • กู้คืนได้ 2 แบบ: merge (รวม, last-write-wins) หรือ replace (แทนที่ทั้งหมด)
//   • ไฟล์ export รุ่นเก่า (ก่อนมี schema) ยังนำเข้าได้ (migrate ให้)
import { fnvHash } from './memory.js';
import { HEALTH_HISTORY_SCHEMA, normalizeHealthHistory } from './health-history.js';

export const BACKUP_APP = 'no7-personal-ai';
export const BACKUP_SCHEMA = 2;
export const SETTINGS_SECRET_KEYS = ['apiKey', 'ttsApiKey', 'syncToken'];

/** คอลเลกชันที่สำรอง + คีย์หลัก/เวลาสำหรับ merge */
export const COLLECTIONS = {
  facts: { label: 'ความจำ', key: (f) => f.id || f.text, ts: (f) => Number(f.ts) || 0 },
  log: { label: 'บันทึกบทสนทนา', key: (l) => `${l.role}:${l.ts}:${String(l.text).slice(0, 24)}`, ts: (l) => Number(l.ts) || 0 },
  notes: { label: 'โน้ต', key: (n) => `${n.ts}:${n.text}`, ts: (n) => Number(n.ts) || 0 },
  todos: { label: 'รายการ', key: (t) => `${t.ts || t.createdAt}:${t.text || t.title}`, ts: (t) => Number(t.ts || t.createdAt) || 0 },
  tasks: { label: 'งาน', key: (t) => t.id || t.title, ts: (t) => Date.parse(t.updatedAt || t.createdAt || '') || 0 },
  events: { label: 'นัดหมาย', key: (e) => e.uid || `${e.start}:${e.title}`, ts: (e) => Number(e.start) || 0 },
  personas: { label: 'persona', key: (p) => p.id, ts: (p) => Number(p.updatedAt || p.createdAt) || 0 },
  healthHistory: { label: 'ประวัติสุขภาพ', key: (item) => item.date, ts: (item) => Date.parse(`${item.date}T00:00:00Z`) || 0 },
};

export const SECRET_PLACEHOLDER = '';

/** ตัดความลับออกจาก settings (และ apiKey ใน MCP servers) */
export function redactSettings(settings = {}) {
  const out = { ...settings };
  for (const key of SETTINGS_SECRET_KEYS) if (key in out) out[key] = SECRET_PLACEHOLDER;
  if (Array.isArray(out.mcpServers)) {
    out.mcpServers = out.mcpServers.map((s) => ({ ...s, apiKey: SECRET_PLACEHOLDER }));
  }
  return out;
}

/** มีความลับติดอยู่ในชุดข้อมูลไหม (ใช้เตือนตอนนำเข้า/ส่งออก) */
export function hasSecrets(settings = {}) {
  if (SETTINGS_SECRET_KEYS.some((k) => String(settings[k] || '').length > 0)) return true;
  return (settings.mcpServers || []).some((s) => String(s?.apiKey || '').length > 0);
}

function checksumOf(payload) {
  const body = JSON.stringify({ ...payload, checksum: undefined });
  return fnvHash(body);
}

/**
 * สร้างไฟล์สำรอง
 * @param {{settings?:object, facts?:object[], log?:object[], notes?:object[], todos?:object[], tasks?:object[], events?:object[], personas?:object[], healthHistory?:object[]}} state
 * @param {{now?:number, includeSecrets?:boolean, version?:string}} [opts]
 */
export function createBackup(state = {}, { now = Date.now(), includeSecrets = false, version = '' } = {}) {
  const settings = includeSecrets ? { ...(state.settings || {}) } : redactSettings(state.settings || {});
  const data = {
    settings,
    facts: state.facts || [],
    log: (state.log || []).slice(-500),
    notes: state.notes || [],
    todos: state.todos || [],
    tasks: state.tasks || [],
    events: state.events || [],
    personas: state.personas || [],
    healthHistory: normalizeHealthHistory({ schema: HEALTH_HISTORY_SCHEMA, snapshots: state.healthHistory || [] }).snapshots,
  };
  const counts = Object.fromEntries(Object.keys(COLLECTIONS).map((k) => [k, Array.isArray(data[k]) ? data[k].length : 0]));
  const payload = {
    app: BACKUP_APP,
    schema: BACKUP_SCHEMA,
    version,
    createdAt: new Date(now).toISOString(),
    includeSecrets: !!includeSecrets,
    counts,
    data,
  };
  return { ...payload, checksum: checksumOf(payload) };
}

/** แปลงไฟล์รุ่นเก่า (export เดิม: {settings, facts, log, todos, notes}) → schema ปัจจุบัน */
export function migrateBackup(input = {}) {
  if (input.app === BACKUP_APP) return input;
  const looksLegacy = input && typeof input === 'object'
    && ('facts' in input || 'log' in input)
    && !('data' in input);
  if (!looksLegacy) return input;
  return {
    app: BACKUP_APP,
    schema: 1,
    migratedFrom: 'legacy-export',
    createdAt: input.exportedAt || new Date(0).toISOString(),
    includeSecrets: false,
    data: {
      settings: input.settings || {},
      facts: input.facts || [],
      log: input.log || [],
      notes: input.notes || [],
      todos: input.todos || [],
      tasks: input.tasks || [],
      events: input.events || [],
      personas: input.personas || [],
    },
  };
}

/**
 * ตรวจไฟล์สำรอง
 * @param {string|object} input
 * @returns {{ok:boolean, errors:string[], warnings:string[], backup:object|null, migrated:boolean}}
 */
export function validateBackup(input) {
  const errors = [];
  const warnings = [];
  let parsed = input;

  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) return { ok: false, errors: ['ไฟล์ว่าง'], warnings, backup: null, migrated: false };
    try { parsed = JSON.parse(text); } catch (err) {
      return { ok: false, errors: [`JSON ไม่ถูกต้อง: ${err.message}`], warnings, backup: null, migrated: false };
    }
  }

  const migrated = !!(parsed && parsed.app !== BACKUP_APP && migrateBackup(parsed)?.app === BACKUP_APP);
  const backup = migrateBackup(parsed);

  if (!backup || typeof backup !== 'object') {
    return { ok: false, errors: ['ต้องเป็น JSON object'], warnings, backup: null, migrated };
  }
  if (backup.app !== BACKUP_APP) errors.push(`ไม่ใช่ไฟล์ของ No7 (app="${backup.app ?? 'ไม่ระบุ'}")`);
  if (!Number.isFinite(Number(backup.schema))) errors.push('ไม่มี schema');
  else if (Number(backup.schema) > BACKUP_SCHEMA) errors.push(`schema ${backup.schema} ใหม่เกินไป (รองรับถึง ${BACKUP_SCHEMA}) — อัปเดตแอปก่อน`);
  if (!backup.data || typeof backup.data !== 'object') errors.push('ไม่มีข้อมูล (data)');

  if (!errors.length && backup.checksum != null) {
    const actual = checksumOf(backup);
    if (String(actual) !== String(backup.checksum)) {
      warnings.push('checksum ไม่ตรง — ไฟล์อาจถูกแก้ระหว่างทาง (ตรวจก่อนนำเข้า)');
    }
  }
  if (migrated) warnings.push('ไฟล์รุ่นเก่า — แปลงเป็น schema 2 แล้ว (บางฟิลด์อาจไม่มี)');
  if (backup.includeSecrets) warnings.push('ไฟล์นี้มีความลับ (API key/token) ติดอยู่');
  if (backup.data && hasSecrets(backup.data.settings || {})) warnings.push('settings มีคีย์ที่ไม่ว่าง');
  if (backup.data && hasSecrets({ mcpServers: backup.data.settings?.mcpServers || [] })) warnings.push('MCP server มี apiKey ติดมา');

  return { ok: errors.length === 0, errors, warnings, backup: errors.length ? null : backup, migrated };
}

/** สรุปจำนวนรายการ (แสดงก่อนกู้คืน) */
export function summarizeBackup(backup = {}) {
  const data = backup.data || {};
  const counts = Object.fromEntries(Object.entries(COLLECTIONS).map(([k, meta]) => {
    const list = Array.isArray(data[k]) ? data[k] : [];
    return [k, { label: meta.label, count: list.length }];
  }));
  return {
    createdAt: backup.createdAt || null,
    schema: Number(backup.schema) || null,
    version: backup.version || '',
    includeSecrets: !!backup.includeSecrets,
    total: Object.values(counts).reduce((sum, c) => sum + c.count, 0),
    counts,
  };
}

/**
 * รวมสองลิสต์ด้วย last-write-wins
 * @returns {{list:object[], added:number, updated:number, kept:number}}
 */
export function mergeRecords(local = [], incoming = [], meta = COLLECTIONS.facts) {
  const byKey = new Map();
  for (const item of local) {
    const k = meta.key(item);
    if (k != null) byKey.set(k, item);
  }
  let added = 0;
  let updated = 0;
  let kept = 0;
  for (const item of incoming) {
    const k = meta.key(item);
    if (k == null) continue;
    const current = byKey.get(k);
    if (!current) {
      byKey.set(k, item);
      added++;
      continue;
    }
    if (meta.ts(item) >= meta.ts(current)) {
      byKey.set(k, { ...current, ...item });
      updated++;
    } else {
      kept++;
    }
  }
  return { list: [...byKey.values()], added, updated, kept };
}

/**
 * วางแผนกู้คืน (dry-run) — ไม่เขียนอะไรลง storage
 * @param {object} backup ผลจาก validateBackup().backup
 * @param {{facts?:object[], log?:object[], notes?:object[], todos?:object[], tasks?:object[], events?:object[], personas?:object[], settings?:object}} local
 * @param {{mode?: 'merge'|'replace'}} [opts]
 */
export function planRestore(backup = {}, local = {}, { mode = 'merge' } = {}) {
  const data = backup.data || {};
  const actions = [];
  const values = {};
  const warnings = [];

  if (!['merge', 'replace'].includes(mode)) mode = 'merge';

  for (const [key, meta] of Object.entries(COLLECTIONS)) {
    const rawIncoming = Array.isArray(data[key]) ? data[key] : [];
    const rawExisting = Array.isArray(local[key]) ? local[key] : [];
    const incoming = key === 'healthHistory'
      ? normalizeHealthHistory({ schema: HEALTH_HISTORY_SCHEMA, snapshots: rawIncoming }).snapshots
      : rawIncoming;
    const existing = key === 'healthHistory'
      ? normalizeHealthHistory({ schema: HEALTH_HISTORY_SCHEMA, snapshots: rawExisting }).snapshots
      : rawExisting;
    if (mode === 'replace') {
      values[key] = incoming;
      actions.push({ key, label: meta.label, mode, incoming: incoming.length, existing: existing.length, added: incoming.length, updated: 0, removed: existing.length, total: incoming.length });
      continue;
    }
    const merged = mergeRecords(existing, incoming, meta);
    values[key] = key === 'healthHistory'
      ? normalizeHealthHistory({ schema: HEALTH_HISTORY_SCHEMA, snapshots: merged.list }).snapshots
      : merged.list;
    actions.push({
      key, label: meta.label, mode,
      incoming: incoming.length,
      existing: existing.length,
      added: merged.added,
      updated: merged.updated,
      kept: merged.kept,
      removed: 0,
      trimmed: key === 'healthHistory' ? Math.max(0, merged.list.length - values[key].length) : 0,
      total: values[key].length,
    });
  }

  const nextSettings = data.settings && typeof data.settings === 'object' ? { ...data.settings } : null;
  if (nextSettings) {
    const blanked = SETTINGS_SECRET_KEYS.filter((k) => !String(nextSettings[k] || '').length);
    if (blanked.length) warnings.push(`คีย์ว่างในไฟล์: ${blanked.join(', ')} (ของเดิมในเครื่องจะถูกแทนที่ด้วยค่าว่าง)`);
    if (hasSecrets(nextSettings)) warnings.push('ไฟล์มีความลับ — จะถูกเขียนลงเครื่องนี้');
  } else {
    warnings.push('ไฟล์ไม่มี settings — ตั้งค่าเดิมจะถูกเก็บไว้');
  }

  return {
    mode,
    actions,
    values,
    settings: nextSettings,
    warnings,
    totals: {
      incoming: actions.reduce((s, a) => s + a.incoming, 0),
      added: actions.reduce((s, a) => s + (a.added || 0), 0),
      updated: actions.reduce((s, a) => s + (a.updated || 0), 0),
      removed: actions.reduce((s, a) => s + (a.removed || 0), 0),
    },
  };
}

/** ข้อความสรุปแผน (ใช้ในกล่องยืนยัน) */
export function describePlan(plan) {
  const lines = [`โหมด: ${plan.mode === 'replace' ? 'แทนที่ทั้งหมด' : 'รวมข้อมูล (ใหม่ทับเก่าตามเวลา)'}`];
  for (const a of plan.actions) {
    if (!a.incoming && !a.existing) continue;
    lines.push(plan.mode === 'replace'
      ? `• ${a.label}: ${a.existing} → ${a.total}`
      : `• ${a.label}: เพิ่ม ${a.added} · อัปเดต ${a.updated} · คงเดิม ${a.kept ?? 0}${a.trimmed ? ` · ตัดเก่าสุด ${a.trimmed}` : ''} (รวม ${a.total})`);
  }
  lines.push(`รวม: +${plan.totals.added} ใหม่ · ${plan.totals.updated} อัปเดต${plan.totals.removed ? ` · ลบ ${plan.totals.removed}` : ''}`);
  return lines.join('\n');
}
