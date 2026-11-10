// Consolidation engine — turns raw conversation into durable facts.
// ทำงานได้สองโหมด:
//   heuristic (ไม่ต้องใช้ AI/เน็ต)  +  LLM (ถ้ามีสมองและผู้ใช้เปิดไว้)
// หลักการเดียวกับ ESP32 "daily consolidation with Flash-Lite" แต่คุมต้นทุนและออฟไลน์ได้
import { tokenize } from './memory.js';

const DAY = 24 * 60 * 60 * 1000;

const PATTERNS = [
  { re: /(?:ฉันชื่อ|ผมชื่อ|หนูชื่อ|เรียกฉันว่า|my name is)\s*([^\s,。.!?]{1,30})/i, make: (m) => `ชื่อผู้ใช้คือ ${m[1]}`, importance: 4 },
  { re: /(?:จำไว้ว่า|จำไว้|remember that)\s*(.{3,200})/i, make: (m) => m[1].trim(), importance: 3 },
  { re: /(?:ฉันชอบ|ผมชอบ|หนูชอบ|ชอบกิน|ชอบฟัง)\s*(.{2,80})/i, make: (m) => `ผู้ใช้ชอบ ${m[1].trim()}`, importance: 2 },
  { re: /(?:ฉันไม่ชอบ|ผมไม่ชอบ|เกลียด)\s*(.{2,80})/i, make: (m) => `ผู้ใช้ไม่ชอบ ${m[1].trim()}`, importance: 2 },
  { re: /(?:ฉันอยู่|ผมอยู่|อาศัยอยู่|อยู่ที่)\s*(.{2,60})/i, make: (m) => `ผู้ใช้อาศัยอยู่ ${m[1].trim()}`, importance: 3 },
  { re: /(?:ฉันทำงาน|ผมทำงาน)(?:ที่|เป็น)\s*(.{2,60})/i, make: (m) => `ผู้ใช้ทำงาน ${m[1].trim()}`, importance: 3 },
  { re: /(?:ฉันมี|ผมมี)\s*(.{2,60})/i, make: (m) => `ผู้ใช้มี ${m[1].trim()}`, importance: 2 },
  { re: /(?:ทุกวัน|ประจำ)\s*(.{2,60})/i, make: (m) => `กิจวัตรประจำ: ${m[1].trim()}`, importance: 2 },
  { re: /(?:ฉันกำลัง|ผมกำลัง)\s*(.{2,80})/i, make: (m) => `ผู้ใช้กำลัง ${m[1].trim()}`, importance: 1 },
];

/** Extract candidate facts from user messages using Thai/English patterns. */
export function extractFromLog(log = []) {
  const out = [];
  for (const turn of log) {
    if (turn.role !== 'user' || !turn.text) continue;
    for (const p of PATTERNS) {
      const m = p.re.exec(turn.text);
      if (m && m[1] && m[1].length >= 1) {
        out.push({ text: p.make(m).trim(), importance: p.importance });
        break; // หนึ่งข้อความ → หนึ่งข้อเท็จจริง
      }
    }
  }
  return out;
}

/** Merge facts whose token sets overlap heavily; keeps the richest text. */
export function mergeDuplicates(memory, threshold = 0.7) {
  const facts = [...memory.facts];
  const kills = [];
  let merged = 0;
  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < facts.length; j++) {
      const a = facts[i], b = facts[j];
      if (kills.includes(b.id) || kills.includes(a.id)) continue;
      const A = new Set(tokenize(a.text)), B = new Set(tokenize(b.text));
      if (!A.size || !B.size) continue;
      let inter = 0;
      for (const t of A) if (B.has(t)) inter++;
      const score = inter / (A.size + B.size - inter);
      if (score >= threshold) {
        const richer = a.text.length >= b.text.length ? a : b;
        const poorer = richer === a ? b : a;
        memory.updateFact(richer.id, {
          importance: Math.max(a.importance, b.importance),
          pinned: a.pinned || b.pinned,
        });
        if (richer.text !== poorer.text) memory.updateFact(richer.id, { text: richer.text });
        kills.push(poorer.id);
        merged++;
      }
    }
  }
  for (const killId of kills) memory.removeFact(killId);
  return merged;
}

const LLM_PROMPT = `คุณเป็นตัวสรุปความจำของผู้ใช้ อ่านบทสนทนาด้านล่างแล้วสกัด "ข้อเท็จจริงระยะยาว" เกี่ยวกับผู้ใช้
กติกา:
- เอาเฉพาะสิ่งที่ยังจริงในอนาคต (ชื่อ ที่อยู่ งาน ความชอบ นิสัย เป้าหมาย สุขภาพ ครอบครัว)
- ไม่เอาเรื่องชั่วคราวในบทสนทนา (เช่น คำถามวันนี้อากาศเป็นไง)
- เขียนเป็นประโยคสั้นๆ ภาษาไทย ขึ้นต้นด้วย "ผู้ใช้..." หรือ "ชื่อผู้ใช้คือ..."
- ถ้าไม่มีอะไรใหม่ ให้ตอบ []
ตอบเป็น JSON array ของ string เท่านั้น ห้ามมีคำอธิบายอื่น`;

/** Ask the LLM to summarise the log into facts. Returns [] if it fails. */
export async function extractWithLLM(chat, log = [], existing = []) {
  if (!chat || !log.length) return [];
  const transcript = log.slice(-40).map((t) => `${t.role === 'user' ? 'ผู้ใช้' : 'No7'}: ${t.text}`).join('\n');
  const known = existing.slice(0, 40).map((f) => `- ${f.text}`).join('\n') || '(ยังไม่มี)';
  const reply = await chat([
    { role: 'system', content: LLM_PROMPT },
    { role: 'user', content: `ข้อเท็จจริงที่มีอยู่แล้ว:\n${known}\n\nบทสนทนา:\n${transcript}` },
  ]);
  const m = /\[[\s\S]*?\]/.exec(String(reply || ''));
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    return arr.filter((x) => typeof x === 'string' && x.trim().length >= 3)
      .slice(0, 8)
      .map((x) => ({ text: x.trim(), importance: 2 }));
  } catch {
    return [];
  }
}

export function shouldConsolidate(memory, { everyMs = DAY, minTurns = 6 } = {}) {
  const last = memory.meta.lastConsolidated || 0;
  const newTurns = memory.log.filter((t) => t.ts > last && t.role === 'user').length;
  return newTurns >= minTurns && Date.now() - last >= everyMs;
}

/**
 * Run consolidation.
 * @param {MemoryStore} memory
 * @param {{chat?: (m: object[]) => Promise<string>, useLLM?: boolean, now?: number, force?: boolean}} opts
 */
export async function consolidate(memory, { chat = null, useLLM = false, now = Date.now(), force = false } = {}) {
  const last = memory.meta.lastConsolidated || 0;
  const log = memory.log.filter((t) => t.ts > last);
  const result = { extracted: 0, mergeCandidates: 0, decayed: 0, usedLLM: false, skipped: false };

  if (!force && !log.length) { result.skipped = true; return result; }

  const decayed = memory.decay({ now });
  result.decayed = decayed;

  // 1) heuristic pass — ฟรีและออฟไลน์ได้
  const candidates = extractFromLog(log);
  for (const c of candidates) {
    const fact = memory.addFact(c.text, { importance: c.importance, source: 'heuristic' });
    if (fact) result.extracted++;
  }

  // 2) optional LLM pass
  if (useLLM && chat && log.length) {
    try {
      const llmFacts = await extractWithLLM(chat, log, memory.facts);
      result.usedLLM = llmFacts.length > 0;
      for (const c of llmFacts) {
        const fact = memory.addFact(c.text, { importance: c.importance, source: 'llm' });
        if (fact) result.extracted++;
      }
    } catch { /* เงียบไว้ — heuristic ทำงานไปแล้ว */ }
  }

  // 3) merge near duplicates
  result.mergeCandidates = mergeDuplicates(memory);
  memory.markConsolidated(now);
  return result;
}

/** Arms a daily consolidation timer. Returns a cancel function. */
export function startDailyConsolidation(memory, run, { intervalMs = 6 * 60 * 60 * 1000 } = {}) {
  const timer = setInterval(async () => {
    if (!shouldConsolidate(memory)) return;
    try { await run(); } catch {}
  }, intervalMs);
  if (timer.unref) timer.unref();
  return () => clearInterval(timer);
}
