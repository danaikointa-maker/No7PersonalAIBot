// Permission layer — the guardrail that makes "ให้ทำได้ทุกอย่าง" ปลอดภัย.
// ทุกเครื่องมือมีหมวด (category) และระดับความเสี่ยง (risk 0–3)
import { toolMeta } from './tools.js';

export const CATEGORIES = {
  read: { emoji: '📖', label: 'อ่านข้อมูล', desc: 'อากาศ ราคา ข่าว วิกิ คำนวณ ข้อมูลเครื่อง', risk: 0 },
  memory: { emoji: '🧠', label: 'ความจำ', desc: 'จำ ค้นความจำ โน้ต รายการงาน', risk: 0 },
  act: { emoji: '⚡', label: 'ทำงานในเครื่อง', desc: 'ตั้งเตือน คัดลอกข้อความ เปิดลิงก์', risk: 1 },
  message: { emoji: '✉️', label: 'ร่างข้อความ', desc: 'เปิดหน้าต่างอีเมล/SMS/LINE พร้อมร่าง (คุณกดส่งเอง)', risk: 2 },
  control: { emoji: '🎛️', label: 'ควบคุมอุปกรณ์', desc: 'เปิดโปรแกรม สั่งงานเครื่อง/บอร์ด', risk: 3 },
};

export const AUTONOMY = {
  'ask-all': { label: 'ถามก่อนทุกครั้ง', desc: 'ยืนยันทุกครั้งที่มีการกระทำ (ปลอดภัยสุด)' },
  'ask-risky': { label: 'ถามเมื่อเสี่ยง', desc: 'อ่าน/จำ ทำงานเบาได้เลย · ร่างข้อความ/ควบคุมเครื่องต้องยืนยัน (แนะนำ)' },
  'allow-all': { label: 'ทำได้เลยทุกอย่าง', desc: 'ไม่ถามเลย — ใช้เมื่อคุณไว้ใจเต็มที่' },
};

export const DEFAULT_PERMISSIONS = {
  autonomy: 'ask-risky',
  allow: { read: true, memory: true, act: true, message: true, control: true },
};

export function normalizePermissions(p) {
  return {
    autonomy: AUTONOMY[p?.autonomy] ? p.autonomy : DEFAULT_PERMISSIONS.autonomy,
    allow: { ...DEFAULT_PERMISSIONS.allow, ...(p?.allow || {}) },
  };
}

/** Is the category enabled at all? (disabled = blocked, model is told so) */
export function isAllowed(toolId, perms) {
  const { category } = toolMeta(toolId);
  return normalizePermissions(perms).allow[category] !== false;
}

/** Does this call need a human "yes" before running? */
export function needsConfirm(toolId, perms) {
  const p = normalizePermissions(perms);
  if (p.autonomy === 'allow-all') return false;
  const { risk } = toolMeta(toolId);
  if (p.autonomy === 'ask-all') return risk >= 1;
  return risk >= 1;
}

export function blockedCategories(perms) {
  const p = normalizePermissions(perms);
  return Object.keys(CATEGORIES).filter((c) => p.allow[c] === false);
}

export function permissionSummary(perms) {
  const p = normalizePermissions(perms);
  const open = Object.entries(p.allow).filter(([, v]) => v).map(([c]) => CATEGORIES[c].label);
  const blocked = blockedCategories(p).map((c) => CATEGORIES[c].label);
  return {
    autonomy: AUTONOMY[p.autonomy].label,
    allowed: open,
    blocked,
    text: `ระดับอิสระ: ${AUTONOMY[p.autonomy].label}\nอนุญาต: ${open.join(', ') || 'ไม่มี'}\nปิด: ${blocked.join(', ') || 'ไม่มี'}`,
  };
}

export function riskLabel(risk) {
  return ['อ่านเท่านั้น', 'เปลี่ยนแปลงเล็กน้อย', 'ส่งข้อมูลออก', 'ควบคุมเครื่อง'][risk] || 'ไม่ทราบ';
}
