// ซิงก์ข้ามเครื่องแบบ "รู้ว่าชนกัน" (conflict-aware)
//
// ปัญหาของการ merge แบบ additive: ถ้าทั้งสองเครื่องแก้ระเบียนเดียวกัน จะได้สำเนาซ้อนหรือข้อมูลหาย
// โมดูลนี้จึงเทียบ "เวลาแก้ล่าสุด" ของแต่ละฝั่ง และเลือกกลยุทธ์ได้:
//   newest        — ฝั่งที่แก้ล่าสุดชนะ (ค่าเริ่มต้น)
//   prefer-local  — เก็บของเครื่องนี้เสมอ (เหมาะกับ "เครื่องหลัก")
//   prefer-remote — รับของอีกเครื่องเสมอ
//   keep-both     — เก็บทั้งสองเวอร์ชัน (เพิ่มสำเนาที่มีป้ายบอกว่ามาจากอีกเครื่อง)
//
// ทุกครั้งจะคืน report ว่าอะไรถูกเพิ่ม/อัปเดต/คงเดิม/ชนกัน เพื่อให้ผู้ใช้ตรวจย้อนหลังได้

export const SYNC_STRATEGIES = ['newest', 'prefer-local', 'prefer-remote', 'keep-both'];
export const DEVICE_KEY = 'no7.device.id';

/** id ของเครื่องนี้ (คงที่ข้ามการรีเฟรช) — ใช้ติดในบันทึกความขัดแย้ง */
export function deviceId(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  try {
    const existing = storage?.getItem(DEVICE_KEY);
    if (existing && /^[a-z0-9-]{6,40}$/i.test(existing)) return existing;
    const fresh = `dev-${Math.random().toString(36).slice(2, 10)}`;
    storage?.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return 'dev-unknown';
  }
}

const toMs = (value) => {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return Number(text);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** เวลาที่ใช้ตัดสิน: ts → updatedAt → at → createdAt */
export function recordTime(record = {}) {
  return Math.max(
    toMs(record.ts),
    toMs(record.updatedAt),
    toMs(record.at),
    toMs(record.createdAt),
  );
}

const clone = (value) => JSON.parse(JSON.stringify(value ?? null));

const summarizeRecord = (record = {}) => (
  record.text || record.title || record.name || record.label || record.id || record.uid || ''
);

/**
 * รวมสองชุดระเบียน
 * @param {object[]} local
 * @param {object[]} remote
 * @param {{key: (r:object)=>string|number|null, time?: (r:object)=>number, strategy?: string, copyLabel?: string, makeId?: ()=>string}} opts
 * @returns {{list: object[], stats: {added:number, updated:number, kept:number, conflicts:number}, conflicts: object[]}}
 */
export function mergeRecordSets(local = [], remote = [], {
  key = (r) => r?.id ?? r?.uid ?? r?.text ?? null,
  time = recordTime,
  strategy = 'newest',
  copyLabel = ' (จากอีกเครื่อง)',
  makeId = () => `copy-${Math.random().toString(36).slice(2, 10)}`,
} = {}) {
  const mode = SYNC_STRATEGIES.includes(strategy) ? strategy : 'newest';
  const byKey = new Map();
  for (const item of local || []) {
    const k = key(item);
    if (k != null) byKey.set(String(k), clone(item));
  }

  const stats = { added: 0, updated: 0, kept: 0, conflicts: 0 };
  const conflicts = [];

  for (const remoteItem of remote || []) {
    const k = key(remoteItem);
    if (k == null) continue;
    const id = String(k);
    const current = byKey.get(id);

    if (!current) {
      byKey.set(id, clone(remoteItem));
      stats.added++;
      continue;
    }

    const localAt = time(current);
    const remoteAt = time(remoteItem);
    const bothTouched = localAt > 0 && remoteAt > 0 && localAt !== remoteAt;

    let winner;
    if (mode === 'keep-both' && bothTouched) {
      // เก็บของเดิมไว้ + เพิ่มสำเนาของอีกฝั่ง (ติดป้ายว่ามาจากไหน)
      const copy = clone(remoteItem);
      const newId = makeId();
      if ('id' in copy) copy.id = newId;
      else if ('uid' in copy) copy.uid = newId;
      copy.mergedFrom = id;
      if (typeof copy.text === 'string') copy.text = `${copy.text}${copyLabel}`;
      else if (typeof copy.title === 'string') copy.title = `${copy.title}${copyLabel}`;
      byKey.set(`${id}#copy-${newId}`, copy);
      winner = 'both';
      stats.added++;
      stats.conflicts++;
    } else {
      if (mode === 'prefer-local') winner = 'local';
      else if (mode === 'prefer-remote') winner = 'remote';
      else winner = remoteAt > localAt ? 'remote' : 'local';

      if (bothTouched) stats.conflicts++;

      if (winner === 'remote') {
        byKey.set(id, clone(remoteItem));
        stats.updated++;
      } else {
        stats.kept++;
      }
    }

    if (bothTouched) {
      conflicts.push({
        key: id,
        winner,
        strategy: mode,
        localAt,
        remoteAt,
        local: summarizeRecord(current),
        remote: summarizeRecord(remoteItem),
      });
    }
  }

  return { list: [...byKey.values()], stats, conflicts };
}

/** คีย์/ป้ายของแต่ละชุดข้อมูลที่ซิงก์กัน */
export const COLLECTION_META = {
  // facts รวมกันด้วยข้อความ (MemoryStore กันซ้ำด้วย text) — id ต่างกันได้ตามเครื่อง
  facts: { label: 'ความจำ', key: (f) => f.text ?? f.id ?? null },
  notes: { label: 'โน้ต', key: (n) => `${n.ts ?? ''}|${n.text ?? ''}` },
  todos: { label: 'รายการ', key: (t) => `${t.ts ?? t.createdAt ?? ''}|${t.text ?? t.title ?? ''}` },
  tasks: { label: 'งาน', key: (t) => t.id ?? t.title ?? null },
  events: { label: 'นัดหมาย', key: (e) => e.uid ?? `${e.start ?? ''}|${e.title ?? ''}`, time: (e) => toMs(e.start) || recordTime(e) },
};

/**
 * รวมทั้งชุดข้อมูลที่ซิงก์กัน
 * @param {object} local  {facts, notes, todos, tasks, events}
 * @param {object} remote
 * @param {{strategy?: string}} opts
 * @returns {{strategy:string, data:object, collections:object, conflicts:object[], totals:object}}
 */
export function mergeSyncBundle(local = {}, remote = {}, { strategy = 'newest' } = {}) {
  const mode = SYNC_STRATEGIES.includes(strategy) ? strategy : 'newest';
  const data = {};
  const collections = {};
  const conflicts = [];
  const totals = { added: 0, updated: 0, kept: 0, conflicts: 0 };

  for (const [name, meta] of Object.entries(COLLECTION_META)) {
    const res = mergeRecordSets(local[name] || [], remote[name] || [], {
      key: meta.key,
      time: meta.time || recordTime,
      strategy: mode,
    });
    data[name] = res.list;
    collections[name] = { label: meta.label, ...res.stats };
    for (const bucket of ['added', 'updated', 'kept', 'conflicts']) totals[bucket] += res.stats[bucket];
    for (const c of res.conflicts) conflicts.push({ collection: name, label: meta.label, ...c });
  }

  return { strategy: mode, data, collections, conflicts, totals };
}

/** สรุปเป็นประโยคเดียว */
export function summarizeSync(report = {}, lang = 'th') {
  const en = lang === 'en';
  const t = report.totals || { added: 0, updated: 0, kept: 0, conflicts: 0 };
  const parts = [
    en ? `+${t.added} new` : `เพิ่ม ${t.added}`,
    en ? `${t.updated} updated` : `อัปเดต ${t.updated}`,
    en ? `${t.kept} unchanged` : `คงเดิม ${t.kept}`,
  ];
  if (t.conflicts) parts.push(en ? `${t.conflicts} conflict(s)` : `ชนกัน ${t.conflicts}`);
  const head = parts.join(' · ');
  const strategyLabel = {
    newest: en ? 'newest wins' : 'ฝั่งล่าสุดชนะ',
    'prefer-local': en ? 'keep this device' : 'เก็บของเครื่องนี้',
    'prefer-remote': en ? 'take the other device' : 'รับของอีกเครื่อง',
    'keep-both': en ? 'keep both' : 'เก็บทั้งสอง',
  }[report.strategy] || report.strategy;
  return `${head} (${strategyLabel})`;
}

/** แปลงความขัดแย้งเป็นแถวสำหรับแสดงผล */
export function describeConflicts(conflicts = []) {
  return conflicts.map((c) => ({
    key: c.key,
    label: c.label || c.collection || '',
    local: c.local || '',
    remote: c.remote || '',
    winner: c.winner,
    note: `${new Date(c.localAt || 0).toLocaleString('th-TH')} ↔ ${new Date(c.remoteAt || 0).toLocaleString('th-TH')}`,
  }));
}
