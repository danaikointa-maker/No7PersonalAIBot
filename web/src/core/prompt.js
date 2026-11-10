// Prompt builder — persona + role mode + permission rules + memory (BM25) + tool catalog.
import { describeTools } from './tools.js';
import { permissionSummary } from './permissions.js';

export function buildSystemPrompt({
  persona,
  memory,
  language = 'th',
  polite = true,
  platform = 'web',
  mode = null,
  roleHint = null,
  permissions = null,
  allowedCategories = null,
  maxSteps = 4,
  extra = '',
}) {
  const langLine = language === 'th'
    ? 'ตอบเป็นภาษาไทยเสมอ (ยกเว้นชื่อเฉพาะหรือศัพท์เทคนิค)'
    : language === 'en'
      ? 'Always answer in English.'
      : 'ตอบด้วยภาษาที่ผู้ใช้ใช้';

  const politeLine = polite
    ? (persona.gender === 'female' ? 'ลงท้ายด้วย "ค่ะ" อย่างสม่ำเสมอ' : 'ลงท้ายด้วย "ครับ" อย่างสม่ำเสมอ')
    : 'พูดเป็นกันเอง ไม่ต้องลงท้าย ค่ะ/ครับ';

  const facts = (memory || []).map((f, i) => `${i + 1}. ${f.text}`).join('\n') || '(ยังไม่มีความจำที่เกี่ยวข้อง)';

  const modeBlock = mode
    ? `บทบาทปัจจุบัน: ${mode.emoji} ${mode.label} — ${mode.desc}\n${mode.extra}`
      + (roleHint && roleHint !== mode.id ? `\n(คำขอนี้เข้าข่ายบทบาท "${roleHint}" — ปรับน้ำเสียงให้เหมาะได้เลย)` : '')
    : '';

  const perm = permissions ? permissionSummary(permissions) : null;
  const permBlock = perm
    ? `สิทธิ์ที่ผู้ใช้อนุญาต: ${perm.allowed.join(', ') || 'ไม่มี'}\n`
      + `สิทธิ์ที่ปิดอยู่: ${perm.blocked.join(', ') || 'ไม่มี'}\n`
      + `ระดับอิสระ: ${perm.autonomy}\n`
      + (allowedCategories ? `หมวดเครื่องมือที่ใช้ได้ตอนนี้: ${allowedCategories.join(', ') || 'ไม่มี'}\n` : '')
      + 'ถ้าจำเป็นต้องใช้เครื่องมือที่ปิดอยู่ ให้บอกผู้ใช้ว่าไปเปิดที่ "ตั้งค่า > สิทธิ์" — ห้ามพยายามเรียกซ้ำ'
    : '';

  const personaCore = persona.system || '';
  const banned = (persona.banned || []).filter(Boolean);
  const banBlock = banned.length
    ? `\nหัวข้อที่ต้องหลีกเลี่ยงโดยเด็ดขาด: ${banned.join(', ')}\n`
      + 'ถ้าผู้ใช้ถามเรื่องเหล่านี้ ให้บอกอย่างสุภาพว่าไม่สะดวกตอบ แล้วชวนคุยเรื่องอื่น'
    : '';

  return `${personaCore}${banBlock}

กฎการทำงาน:
- ${langLine}
- ${politeLine}
- ตอบให้ครบทุกส่วนของคำถาม ไม่ตัดทอน ถ้าเป็นตัวเลข/ราคา/อากาศ ให้บอกค่าจริงและความหมายสั้นๆ
- ห้ามแต่งข้อมูลเอง ถ้าไม่รู้ให้บอกตรงๆ ว่ายังไม่รู้
- กำลังรันอยู่บนแพลตฟอร์ม: ${platform}
${modeBlock ? `\n${modeBlock}\n` : ''}${permBlock ? `\n${permBlock}\n` : ''}
การใช้เครื่องมือ:
- เรียกได้ต่อเนื่องสูงสุด ${maxSteps} ครั้งต่อคำขอหนึ่ง ถ้างานต้องใช้หลายข้อมูลให้เรียกหลายครั้งแล้วสรุปทีเดียว
- เมื่อต้องใช้ข้อมูลจริง ให้ตอบเป็นบล็อกเดียวแบบนี้เป๊ะๆ
\`\`\`tool
{"tool":"ชื่อเครื่องมือ","args":{...}}
\`\`\`
แล้วรอผลลัพธ์ อย่าทำนายผลลัพธ์เอง
- ถ้าผลลัพธ์พอแล้ว ห้ามเรียกเครื่องมือซ้ำ ให้สรุปเป็นคำตอบสุดท้ายทันที

ความจำระยะยาวที่เกี่ยวข้อง (จาก BM25 retrieval):
${facts}

รายการเครื่องมือ (ชื่อ [หมวด/ความเสี่ยง]):
${describeTools()}
${extra}`;
}

/** Short, speakable summary of a tool card (used for TTS + subtitle). */
export function summarizeToolResult(name, data) {
  const head = data.title ? `${data.title} ` : '';
  const big = data.big ? `${data.big} ` : '';
  const lines = (data.lines || []).slice(0, 3).join(' · ');
  return `${head}${big}${lines}`.trim() || `เรียกเครื่องมือ ${name} เรียบร้อย`;
}
