// ค้นหาทุกอย่างในเครื่อง — ความจำ, โน้ต, งาน, นัดหมาย, เครื่องมือ และเมนู
//
// ออกแบบให้เป็นฟังก์ชันบริสุทธิ์ (ไม่แตะ DOM/storage) → UI (⌘K palette) และ AI ใช้ร่วมกันได้
// การให้คะแนน: ตรงทั้งคำ > ขึ้นต้นด้วย > มีทุกคำ > มีบางคำ + โบนัสชนิดข้อมูล/ความใหม่
import { tokenize } from './memory.js';

export const SEARCH_TYPES = {
  memory: { emoji: '🧠', label: 'ความจำ', weight: 1.1 },
  note: { emoji: '📝', label: 'โน้ต', weight: 1.0 },
  todo: { emoji: '☑️', label: 'รายการ', weight: 0.95 },
  task: { emoji: '✅', label: 'งาน', weight: 1.05 },
  event: { emoji: '📅', label: 'นัดหมาย', weight: 1.0 },
  tool: { emoji: '🧰', label: 'เครื่องมือ', weight: 0.9 },
  view: { emoji: '🧭', label: 'เมนู', weight: 0.8 },
  action: { emoji: '⚡', label: 'คำสั่ง', weight: 0.85 },
};

export const TYPE_ORDER = ['action', 'view', 'task', 'event', 'memory', 'note', 'todo', 'tool'];

const limit = (text, n = 160) => {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** normalise สำหรับเทียบแบบ substring (ตัดเสียงวรรณยุกต์ + ตัวพิมพ์เล็ก) */
export function normalize(text = '') {
  return String(text).toLowerCase().replace(/[่-๋]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * เพิ่มรายการเข้าดัชนี
 * @param {object[]} items
 */
export function buildIndex({ memory = [], notes = [], todos = [], tasks = [], events = [], tools = [], views = [], actions = [] } = {}) {
  const items = [];
  const push = (type, id, title, extra = {}) => {
    if (!title) return;
    items.push({
      id: `${type}:${id}`,
      type,
      title: limit(title, 120),
      subtitle: limit(extra.subtitle || '', 120),
      text: `${title} ${extra.subtitle || ''} ${extra.keywords || ''}`,
      ts: Number(extra.ts) || 0,
      action: extra.action || null,
      meta: extra.meta || {},
    });
  };

  memory.forEach((f) => push('memory', f.id || f.text, f.text, {
    subtitle: f.source === 'user' ? 'ผู้ใช้สอนไว้' : 'เรียนรู้จากการคุย',
    ts: f.ts,
    action: { kind: 'memory', query: f.text },
    meta: { importance: f.importance, pinned: !!f.pinned },
  }));

  notes.forEach((n, i) => push('note', i, n.text, {
    subtitle: n.ts ? new Date(n.ts).toLocaleString('th-TH') : '',
    ts: n.ts,
    action: { kind: 'note', index: i },
  }));

  todos.forEach((t, i) => push('todo', i, t.text || t.title, {
    subtitle: t.done ? 'เสร็จแล้ว' : 'ยังไม่เสร็จ',
    ts: t.ts || t.createdAt,
    action: { kind: 'todo', index: i },
  }));

  tasks.forEach((t) => push('task', t.id || t.title, t.title, {
    subtitle: [t.done ? 'เสร็จแล้ว' : 'ค้างอยู่', t.due ? new Date(t.due).toLocaleString('th-TH') : ''].filter(Boolean).join(' · '),
    ts: Date.parse(t.updatedAt || t.createdAt || '') || Date.parse(t.due || '') || 0,
    action: { kind: 'task', id: t.id },
    meta: { done: !!t.done, priority: t.priority },
  }));

  events.forEach((e) => push('event', e.uid || e.id || e.title, e.title, {
    subtitle: e.start ? new Date(e.start).toLocaleString('th-TH') : '',
    ts: Number(e.start) || 0,
    action: { kind: 'event', id: e.uid || e.id },
  }));

  tools.forEach((t) => push('tool', t.id, `${t.emoji || '🧰'} ${t.label || t.id}`, {
    subtitle: t.desc || '',
    keywords: t.id,
    action: { kind: 'tool', id: t.id, label: t.label },
    meta: { risk: t.risk, category: t.category },
  }));

  views.forEach((v) => push('view', v.id, v.label, {
    subtitle: v.desc || '',
    action: { kind: 'view', id: v.id },
  }));

  actions.forEach((a) => push('action', a.id, a.label, {
    subtitle: a.desc || '',
    action: a.action || { kind: 'action', id: a.id },
  }));

  return items;
}

/** ช่วงตำแหน่งที่ตรงกับคำค้นในข้อความ (ใช้ทำ highlight) */
export function matchRanges(text, query) {
  const hay = normalize(text);
  const needle = normalize(query);
  if (!needle) return [];
  const ranges = [];
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at < 0) break;
    ranges.push([at, at + needle.length]);
    from = at + needle.length;
    if (ranges.length >= 8) break;
  }
  return ranges;
}

/**
 * ช่วงตำแหน่งบน "ข้อความดิบ" สำหรับทำ highlight (ไม่ตัดวรรณยุกต์ → index ตรงกับตัวอักษรจริง)
 * ใช้เฉพาะตอนแสดงผล; ส่วนคะแนนใช้ matchRanges/normalize
 */
export function highlightRanges(text, query) {
  const raw = String(text ?? '');
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) return [];
  const hay = raw.toLowerCase();
  const ranges = [];
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at < 0) break;
    ranges.push([at, at + needle.length]);
    from = at + needle.length;
    if (ranges.length >= 8) break;
  }
  return ranges;
}

function scoreItem(item, query, tokens) {
  const title = normalize(item.title);
  const text = normalize(item.text);
  const q = normalize(query);
  let score = 0;

  if (q) {
    if (title === q) score += 200;
    else if (title.startsWith(q)) score += 140;
    else if (title.includes(q)) score += 110;
    else if (text.includes(q)) score += 70;
  }

  let hit = 0;
  for (const tok of tokens) {
    if (title.includes(tok)) { score += 18; hit++; continue; }
    if (text.includes(tok)) { score += 8; hit++; }
  }
  if (tokens.length && hit === tokens.length) score += 40;
  if (!q && !score) score = 1; // query ว่าง → แสดงทุกอย่าง (สำหรับหน้าแรกของ palette)

  const typeWeight = SEARCH_TYPES[item.type]?.weight || 1;
  score *= typeWeight;

  // ความใหม่: เบา ๆ ภายใน 30 วัน (ไม่ให้ทับคะแนนข้อความ)
  if (item.ts) {
    const ageDays = Math.max(0, (Date.now() - item.ts) / 86_400_000);
    if (ageDays < 30) score += (30 - ageDays) * 0.6;
  }
  if (item.meta?.pinned) score += 25;
  if (item.meta?.importance) score += Number(item.meta.importance) * 2;
  if (item.type === 'task' && item.meta?.done) score -= 12;

  return Math.round(score * 100) / 100;
}

/**
 * ค้นหาในดัชนี
 * @param {object[]} index ผลจาก buildIndex
 * @param {string} query
 * @param {{limit?: number, types?: string[]|null, now?: number}} [opts]
 * @returns {Array<{id,type,title,subtitle,score,ranges,emoji,action,meta}>}
 */
export function searchIndex(index = [], query = '', { limit: max = 12, types = null } = {}) {
  const q = normalize(query);
  const tokens = q ? [...new Set(tokenize(query))].filter((t) => t.length > 0) : [];
  const allowed = types && types.length ? new Set(types) : null;

  const scored = [];
  for (const item of index) {
    if (allowed && !allowed.has(item.type)) continue;
    const score = scoreItem(item, q, tokens);
    if (score <= 0) continue;
    scored.push({
      id: item.id,
      type: item.type,
      title: item.title,
      subtitle: item.subtitle,
      score,
      ranges: matchRanges(item.title, query),
      emoji: SEARCH_TYPES[item.type]?.emoji || '•',
      action: item.action,
      meta: item.meta,
    });
  }

  scored.sort((a, b) => b.score - a.score || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));

  // จำกัดจำนวนต่อชนิด เพื่อไม่ให้ชนิดเดียวท่วมผลลัพธ์
  const perType = Math.max(2, Math.ceil(max / 3));
  const seen = new Map();
  const out = [];
  for (const row of scored) {
    const n = seen.get(row.type) || 0;
    if (n >= perType) continue;
    seen.set(row.type, n + 1);
    out.push(row);
    if (out.length >= max) break;
  }
  return out;
}

/** จัดกลุ่มผลลัพธ์ตามชนิด (สำหรับแสดงใน palette) */
export function groupResults(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.type)) groups.set(row.type, { type: row.type, label: SEARCH_TYPES[row.type]?.label || row.type, emoji: SEARCH_TYPES[row.type]?.emoji || '•', items: [] });
    groups.get(row.type).items.push(row);
  }
  return [...groups.values()].sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
}

/** เมนู/คำสั่งมาตรฐานที่ควรมีใน palette */
export function defaultPaletteExtras() {
  return {
    views: [
      { id: 'chat', label: '💬 แชท', desc: 'คุยกับ No7' },
      { id: 'tools', label: '🧰 เครื่องมือ', desc: 'ดู/ลองเครื่องมือทั้งหมด' },
      { id: 'memory', label: '🧠 ความจำ', desc: 'ค้น/แก้ความจำระยะยาว' },
      { id: 'calendar', label: '📅 ตารางนัด', desc: 'นัดหมายและงาน' },
      { id: 'devices', label: '🔗 อุปกรณ์', desc: 'Phone-Link / ESP32' },
      { id: 'desktop', label: '🖥️ เดสก์ท็อป', desc: 'หน้าต่างและสูตรอัตโนมัติ' },
      { id: 'settings', label: '⚙️ ตั้งค่า', desc: 'ผู้ให้บริการ AI, สิทธิ์, เสียง' },
    ],
    actions: [
      { id: 'digest', label: '🌅 สรุปวันนี้', desc: 'สร้างสรุปงาน/นัดหมาย/ความจำ', action: { kind: 'digest' } },
      { id: 'stop', label: '⏹ หยุดทุกอย่าง', desc: 'หยุดงานที่กำลังทำและเสียง', action: { kind: 'stop' } },
      { id: 'new-chat', label: '✨ เริ่มบทสนทนาใหม่', desc: 'ล้างประวัติแชทในหน้าปัจจุบัน', action: { kind: 'new-chat' } },
    ],
  };
}
