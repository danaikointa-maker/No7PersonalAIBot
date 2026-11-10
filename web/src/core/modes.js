// Role modes — "เลือกทั้งหมด" ทำได้ด้วยโหมดอัตโนมัติที่สลับบทบาทเอง
// แต่ละโหมดจำกัดเครื่องมือและปรับน้ำเสียง เพื่อไม่ให้ No7 ทำเรื่องไม่เกี่ยวกัน
import { allToolIds, toolMeta } from './tools.js';

export const MODES = {
  auto: {
    emoji: '✨',
    label: 'ทั้งหมด',
    desc: 'ปรับบทบาทเองตามคำขอ (เพื่อน + งาน + ชีวิต + อุปกรณ์)',
    categories: ['read', 'memory', 'act', 'message', 'control', 'mcp'],
    extra: `คุณทำได้ทุกบทบาท: เพื่อนคุย, ผู้ช่วยทำงาน, ผู้ช่วยชีวิตประจำวัน, และศูนย์ควบคุมอุปกรณ์
อ่านเจตนาของผู้ใช้แล้วสวมบทบาทที่เหมาะกับคำขอนั้นทันที ไม่ต้องถามว่าอยากได้โหมดไหน`,
  },
  companion: {
    emoji: '💛',
    label: 'เพื่อนคุย',
    desc: 'คุยเล่น ระบาย ปลุกกำลังใจ',
    categories: ['read', 'memory', 'act'],
    extra: `โหมดเพื่อนคุย: ให้ความสำคัญกับการฟังและอารมณ์ผู้ใช้ก่อนข้อมูล
ตอบสั้น เป็นธรรมชาติ มีอารมณ์ขันได้ ไม่ต้องยัดข้อมูลเยอะ ถามกลับบ้าง`,
  },
  work: {
    emoji: '💼',
    label: 'งาน',
    desc: 'สรุป เขียน คำนวณ วางแผน',
    categories: ['read', 'memory', 'act', 'message', 'mcp'],
    extra: `โหมดงาน: กระชับ ตรงประเด็น มีโครงสร้าง (หัวข้อ/ขั้นตอน) ระบุสมมติฐานให้ชัด
ถ้าคำขอใหญ่ ให้แตกเป็นขั้นตอนที่ทำได้จริงก่อนลงมือ`,
  },
  daily: {
    emoji: '📅',
    label: 'ชีวิตประจำวัน',
    desc: 'เตือนความจำ ตาราง ค่าใช้จ่าย',
    categories: ['read', 'memory', 'act', 'message', 'mcp'],
    extra: `โหมดชีวิตประจำวัน: ช่วยจัดการเวลาและความจำ ส่วนตัว กระตือรือร้นที่จะตั้งเตือน/จดบันทึกให้
ย้ำเวลาและรายละเอียดให้ชัดเจน`,
  },
  hub: {
    emoji: '🏠',
    label: 'อุปกรณ์',
    desc: 'ควบคุมเครื่อง/บอร์ด ตรวจสถานะ',
    categories: ['read', 'memory', 'control'],
    extra: `โหมดควบคุมอุปกรณ์: ตรวจสอบให้แน่ใจก่อนสั่งงานทุกครั้ง ระบุคำสั่งที่จะส่งให้ชัด
ถ้าคำสั่งเสี่ยงหรือไม่ชัด ให้ถามยืนยันก่อน`,
  },
};

export const MODE_IDS = Object.keys(MODES);

export function getMode(id) {
  return MODES[id] || MODES.auto;
}

/** Tools visible in this mode (used for the prompt and the Tools tab filter). */
export function toolsForMode(modeId) {
  const mode = getMode(modeId);
  return allToolIds().filter((id) => mode.categories.includes(toolMeta(id).category));
}

/** Heuristic hint for the auto mode — helps the model pick a role faster. */
export function detectMode(text = '') {
  const t = String(text).toLowerCase();
  if (/(เปิดโปรแกรม|สั่งงาน|บอร์ด|esp32|อุปกรณ์|ปิดไฟ|รีบูต|ปลั๊ก|โฮม|ควบคุม)/.test(t)) return 'hub';
  if (/(ทำงาน|ประชุม|รายงาน|สรุป|เขียน|โค้ด|คำนวณ|วางแผน|อีเมล)/.test(t)) return 'work';
  if (/(เตือน|นัด|ตาราง|จ่าย|ค่าใช้จ่าย|ยา|ตื่น|นอน|สิ่งที่ต้องทำ)/.test(t)) return 'daily';
  if (/(เหงา|เศร้า|เครียด|คิดถึง|ดีใจ|เล่าให้ฟัง|เป็นเพื่อน|กวน|เล่น)/.test(t)) return 'companion';
  return 'auto';
}
