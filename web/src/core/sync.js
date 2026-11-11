// ซิงก์ข้ามเครื่อง (มือถือ ↔ PC) ผ่าน companion server ที่คุณรันเอง
// หลักการ: ไม่มีบัญชี ไม่มีคลาวด์ — ใช้ URL + token ที่คุณตั้ง และ merge แบบไม่ทับข้อมูลกัน

export const SYNC_VERSION = 1;

/** เก็บเฉพาะข้อมูลที่ย้ายข้ามเครื่องได้ (ตัด API key ออกเสมอ) */
import { TaskStore } from './tasks.js';
import { mergeSyncBundle } from './sync-merge.js';
import { withBackupListsRestore } from './backup-restore.js';
import { restoreReminders } from './tools.js';
import { redactSettings } from './backup.js';

export function collectBundle({ memory, personas = [], calendar = [], tasks = null, settings = {} }) {
  const safeSettings = redactSettings(settings);
  return {
    version: SYNC_VERSION,
    updatedAt: new Date().toISOString(),
    memory: memory?.exportData?.() || { facts: [], log: [] },
    personas,
    calendar,
    settings: safeSettings,
    todos: safeJson('no7.todos.v1', []),
    notes: safeJson('no7.notes.v1', []),
    reminders: safeJson('no7.reminders.v1', []),
    tasks: Array.isArray(tasks) ? tasks : new TaskStore().exportData().tasks,
  };
}

function safeJson(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function headers(token) {
  return { 'Content-Type': 'application/json', ...(token ? { 'X-No7-Sync': token } : {}) };
}

export async function pushBundle(serverUrl, token, bundle) {
  const url = `${String(serverUrl).replace(/\/$/, '')}/api/sync`;
  const res = await fetch(url, { method: 'PUT', headers: headers(token), body: JSON.stringify(bundle) });
  if (res.status === 401) throw new Error('token ไม่ถูกต้อง — ตรวจ NO7_SYNC_TOKEN ที่ server');
  if (!res.ok) throw new Error(`อัปโหลดไม่สำเร็จ (${res.status})`);
  return res.json();
}

export async function pullBundle(serverUrl, token) {
  const url = `${String(serverUrl).replace(/\/$/, '')}/api/sync`;
  const res = await fetch(url, { method: 'GET', headers: headers(token) });
  if (res.status === 404) return null;
  if (res.status === 401) throw new Error('token ไม่ถูกต้อง');
  if (!res.ok) throw new Error(`ดาวน์โหลดไม่สำเร็จ (${res.status})`);
  return res.json();
}

export function formatSyncResult(result = {}) {
  return `✅ ผสานแล้ว: ความจำ +${result.facts || 0} · persona +${result.personas || 0} · นัด +${result.events || 0} · งาน ${result.tasks || 0} · เตือน +${result.reminders || 0}`;
}

export class SyncApplyError extends Error {
  constructor(message, { cause, applied = [], report = null } = {}) {
    super(message, { cause });
    this.name = 'SyncApplyError';
    this.applied = [...applied];
    this.report = report;
  }
}

/**
 * Apply a merged bundle. Notes/todos are persisted first; later store failures
 * carry an applied-collection list so the UI can explain partial success.
 */
export function mergeBundle(bundle, {
  memory, createPersona, getPersona, listPersonas, calendar, tasks = null, strategy = 'newest',
} = {}) {
  const out = { facts: 0, personas: 0, events: 0, tasks: 0, reminders: 0, conflicts: [], report: null };
  if (!bundle) return out;

  const taskStore = tasks && typeof tasks.merge === 'function' ? tasks : new TaskStore();
  const local = {
    facts: memory?.listFacts?.() || [],
    notes: safeJson('no7.notes.v1', []),
    todos: safeJson('no7.todos.v1', []),
    reminders: safeJson('no7.reminders.v1', []),
    // Include deleted records: their tombstones prevent deleted tasks reappearing.
    tasks: taskStore.exportData?.().tasks || taskStore.list?.({ done: null }) || [],
    events: calendar?.all?.() || [],
  };
  const remote = {
    facts: bundle.memory?.facts || [],
    notes: bundle.notes || [],
    todos: bundle.todos || [],
    reminders: bundle.reminders || [],
    tasks: bundle.tasks || [],
    events: bundle.calendar || [],
  };
  const merged = mergeSyncBundle(local, remote, { strategy });
  out.report = merged;
  out.conflicts = merged.conflicts;
  const applied = [];
  const markApplied = (name) => { if (!applied.includes(name)) applied.push(name); };

  const applyOtherStores = () => {
    if ((merged.collections.facts.added || merged.collections.facts.updated) && memory?.importData) {
      const result = memory.importData({ facts: merged.data.facts }, { merge: true });
      out.facts = result?.added ?? (merged.collections.facts.added + merged.collections.facts.updated);
      markApplied('ความจำ');
    }
    if ((merged.collections.tasks.added || merged.collections.tasks.updated) && taskStore.merge) {
      out.tasks = taskStore.merge(merged.data.tasks).changed;
      if (out.tasks) markApplied('งาน');
    }
    if ((merged.collections.events.added || merged.collections.events.updated) && calendar?.replaceAll) {
      calendar.replaceAll(merged.data.events);
      out.events = merged.collections.events.added + merged.collections.events.updated;
      if (out.events) markApplied('นัดหมาย');
    }
    const known = (listPersonas?.() || (getPersona ? [getPersona('no7')] : [])) || [];
    for (const persona of bundle.personas || []) {
      if (!persona?.system || !persona?.name) continue;
      if (known.some((item) => item && (item.id === persona.id || (item.name === persona.name && item.system === persona.system)))) continue;
      const created = createPersona?.({ ...persona, name: `${persona.name}`.slice(0, 24) });
      if (created) {
        out.personas++;
        known.push(created);
        markApplied('persona');
      }
    }
    restoreReminders();
    return out;
  };

  try {
    const result = withBackupListsRestore(
      { notes: merged.data.notes, todos: merged.data.todos, reminders: merged.data.reminders },
      applyOtherStores,
      globalThis.localStorage,
      ['no7.notes.v1', 'no7.todos.v1', 'no7.reminders.v1'],
    );
    out.reminders = merged.collections.reminders.added + merged.collections.reminders.updated;
    return result;
  } catch (cause) {
    const message = applied.length
      ? `ซิงก์หยุดกลางทาง — ผสานแล้วบางส่วน (${applied.join(', ')}) โน้ต/รายการ/เตือนถูกย้อนกลับแล้ว; กดดาวน์โหลดซ้ำเพื่อลองต่อได้`
      : `บันทึกข้อมูลซิงก์ไม่สำเร็จ — โน้ต/รายการ/เตือนเดิมยังคงอยู่: ${cause?.message || cause}`;
    throw new SyncApplyError(message, { cause, applied, report: merged });
  }
}
