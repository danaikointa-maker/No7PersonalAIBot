// Storage utilities — รู้ว่าใช้พื้นที่ไปเท่าไร ขอพื้นที่ถาวร และจัดการเมื่อเต็ม

export const STORAGE_KEYS = [
  { key: 'no7.memory.v2', label: 'ความจำ', group: 'memory' },
  { key: 'no7.memory.log.v1', label: 'บทสนทนา (legacy)', group: 'memory' },
  { key: 'no7.memory.facts.v1', label: 'ข้อเท็จจริง (legacy)', group: 'memory' },
  { key: 'no7.personas.v1', label: 'Persona', group: 'persona' },
  { key: 'no7.calendar.v1', label: 'ปฏิทิน', group: 'calendar' },
  { key: 'no7.devices.v1', label: 'อุปกรณ์', group: 'devices' },
  { key: 'no7.todos.v1', label: 'รายการงาน', group: 'notes' },
  { key: 'no7.notes.v1', label: 'โน้ต', group: 'notes' },
  { key: 'no7.reminders.v1', label: 'เตือนความจำ', group: 'notes' },
  { key: 'no7.settings.v1', label: 'ตั้งค่า', group: 'settings' },
  { key: 'no7.pairing.v1', label: 'รหัสจับคู่', group: 'devices' },
  { key: 'no7.metrics.v1', label: 'สถิติการใช้งาน', group: 'metrics' },
];

function store(env) {
  return env?.localStorage || globalThis.localStorage;
}

/** ขนาดของแต่ละคีย์ (ไบต์โดยประมาณ, UTF-16) */
export function usageBreakdown(env = globalThis) {
  const ls = store(env);
  const rows = [];
  for (const meta of STORAGE_KEYS) {
    let bytes = 0;
    try {
      const raw = ls?.getItem(meta.key);
      bytes = raw ? raw.length * 2 : 0;
    } catch { bytes = 0; }
    rows.push({ ...meta, bytes });
  }
  const total = rows.reduce((s, r) => s + r.bytes, 0);
  return { rows, total };
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** ประมาณการโควตาที่เบราว์เซอร์รายงาน (ถ้ามี) */
export async function estimateQuota(env = globalThis) {
  const sm = env?.navigator?.storage;
  if (!sm?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await sm.estimate();
    return {
      usage, quota,
      percent: quota ? Math.min(100, Math.round((usage / quota) * 100)) : null,
      usageText: formatBytes(usage),
      quotaText: formatBytes(quota),
    };
  } catch { return null; }
}

export async function isPersisted(env = globalThis) {
  try { return (await env?.navigator?.storage?.persisted?.()) === true; } catch { return false; }
}

/** ขอพื้นที่ถาวร — กันเบราว์เซอร์ล้างข้อมูลเมื่อพื้นที่เครื่องต่ำ */
export async function requestPersistentStorage(env = globalThis) {
  const sm = env?.navigator?.storage;
  if (!sm?.persist) throw new Error('เบราว์เซอร์นี้ไม่รองรับการขอพื้นที่ถาวร');
  const ok = await sm.persist();
  return ok;
}

export function clearGroup(group, env = globalThis) {
  const ls = store(env);
  let removed = 0;
  for (const meta of STORAGE_KEYS) {
    if (meta.group !== group) continue;
    try { ls?.removeItem(meta.key); removed++; } catch {}
  }
  return removed;
}

/**
 * เขียน localStorage แบบไม่ทำให้แอปพังเมื่อเต็ม
 * @returns {{ok: boolean, error?: string}}
 */
export function safeSet(key, value, env = globalThis) {
  const ls = store(env);
  try {
    ls?.setItem(key, value);
    return { ok: true };
  } catch (err) {
    const quota = isQuotaError(err);
    return {
      ok: false,
      error: quota
        ? 'พื้นที่เก็บข้อมูลเต็ม — ลองลบความจำเก่าหรือส่งออกแล้วล้าง'
        : `บันทึกไม่สำเร็จ: ${err?.message || err}`,
    };
  }
}

export function isQuotaError(err) {
  return /quota|exceeded/i.test(`${err?.name || ''} ${err?.message || ''}`);
}
