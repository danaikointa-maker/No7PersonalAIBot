// Prompt builder — persona + retrieved memory (GraphRAG-lite) + tool catalog.
import { describeTools } from './tools.js';

export function buildSystemPrompt({ persona, memory, language = 'th', polite = true, platform = 'web', extra = '' }) {
  const langLine = language === 'th'
    ? 'ตอบเป็นภาษาไทยเสมอ (ยกเว้นชื่อเฉพาะหรือศัพท์เทคนิค)'
    : language === 'en'
      ? 'Always answer in English.'
      : 'ตอบด้วยภาษาที่ผู้ใช้ใช้';

  const politeLine = polite
    ? (persona.gender === 'female' ? 'ลงท้ายด้วย "ค่ะ" อย่างสม่ำเสมอ' : 'ลงท้ายด้วย "ครับ" อย่างสม่ำเสมอ')
    : 'พูดเป็นกันเอง ไม่ต้องลงท้าย ค่ะ/ครับ';

  const facts = (memory || []).map((f, i) => `${i + 1}. ${f.text}`).join('\n') || '(ยังไม่มีความจำที่เกี่ยวข้อง)';

  return `${persona.system}

กฎการทำงาน:
- ${langLine}
- ${politeLine}
- ตอบให้ครบทุกส่วนของคำถาม ไม่ตัดทอน ถ้าเป็นตัวเลข/ราคา/อากาศ ให้บอกค่าจริงและความหมายสั้นๆ
- ห้ามแต่งข้อมูลเอง ถ้าไม่รู้ให้บอกตรงๆ ว่ายังไม่รู้
- กำลังรันอยู่บนแพลตฟอร์ม: ${platform}

ความจำระยะยาวที่เกี่ยวข้อง (จาก BM25 retrieval):
${facts}

เครื่องมือที่เรียกใช้ได้: เมื่อต้องใช้ข้อมูลจริง ให้ตอบเป็นบล็อกเดียวแบบนี้เป๊ะๆ
\`\`\`tool
{"tool":"ชื่อเครื่องมือ","args":{...}}
\`\`\`
แล้วรอผลลัพธ์ อย่าทำนายผลลัพธ์เอง

รายการเครื่องมือ:
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
