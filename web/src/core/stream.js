// Streaming helpers — ให้ No7 เริ่มพูดได้ก่อนคำตอบจบ
// 1) SentenceSplitter: ตัดข้อความไทย/อังกฤษเป็นประโยคที่พูดได้
// 2) SpeechQueue: คิว TTS พูดทีละประโยค ไม่ทับกัน

/**
 * ตัดเป็นประโยคเมื่อเจอตัวจบประโยค หรือเมื่อยาวเกิน maxLen (ไทยไม่ค่อยมีช่องว่าง)
 */
export class SentenceSplitter {
  constructor({ maxLen = 140, minLen = 8 } = {}) {
    this.buf = '';
    this.maxLen = maxLen;
    this.minLen = minLen;
  }

  /** @returns {string[]} ประโยคที่ “จบแล้ว” */
  push(chunk = '') {
    this.buf += chunk;
    const out = [];
    let guard = 0;
    while (this.buf.length && guard++ < 200) {
      const idx = findBreak(this.buf, this.maxLen);
      if (idx < 0) break;
      const piece = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx);
      if (piece.length >= this.minLen) out.push(clean(piece));
    }
    return out;
  }

  /** ส่วนที่เหลือตอนจบคำตอบ */
  flush() {
    const rest = clean(this.buf.trim());
    this.buf = '';
    return rest ? [rest] : [];
  }

  reset() { this.buf = ''; }
}

const ENDERS = /[.!?。！？\n]/;
const THAI_END = /[ฯ]/;

function findBreak(text, maxLen) {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ENDERS.test(ch) || THAI_END.test(ch)) {
      // รวมช่องว่าง/อักขระปิดที่ตามมา
      let j = i + 1;
      while (j < text.length && /["'”’)\]\s]/.test(text[j])) j++;
      return j;
    }
  }
  if (text.length > maxLen) {
    // ตัดที่ช่องว่างใกล้สุด หรือตัดแข็งถ้าไทยล้วน
    const slice = text.slice(0, maxLen);
    const sp = slice.lastIndexOf(' ');
    if (sp > maxLen * 0.5) return sp + 1;
    return maxLen;
  }
  return -1;
}

function clean(s) {
  return s.replace(/\s+/g, ' ').replace(/^[.,;:\-–—\s]+/, '').trim();
}

/**
 * คิวพูด: รับประโยคเข้ามาแล้วพูดต่อเนื่องกัน หยุดได้ทันที
 * voice ต้องมี speak(text) คืน Promise และ stopSpeaking()
 */
export class SpeechQueue {
  constructor(voice, { onSentence = null } = {}) {
    this.voice = voice;
    this.onSentence = onSentence;
    this.queue = [];
    this.speaking = false;
    this.stopped = false;
  }

  enqueue(sentences) {
    const list = Array.isArray(sentences) ? sentences : [sentences];
    for (const s of list) if (s && s.trim()) this.queue.push(s.trim());
    this._drain();
  }

  async _drain() {
    if (this.speaking) return;
    this.speaking = true;
    while (this.queue.length && !this.stopped) {
      const next = this.queue.shift();
      this.onSentence?.(next);
      try { await this.voice.speak(next); } catch { /* ข้ามประโยคที่พูดไม่ได้ */ }
    }
    this.speaking = false;
  }

  stop() {
    this.stopped = true;
    this.queue = [];
    try { this.voice.stopSpeaking?.(); } catch {}
    this.speaking = false;
  }

  resume() { this.stopped = false; }
}

/** ประกอบข้อความที่สตรีมมาแล้วให้ UI แสดง (เติม cursor ให้เห็นว่ายังไม่จบ) */
export function withCursor(text, streaming = true) {
  const t = String(text || '');
  if (!streaming) return t;
  return t ? `${t}▍` : '▍';
}
