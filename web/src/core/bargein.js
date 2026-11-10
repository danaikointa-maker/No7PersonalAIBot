// Barge-in — ให้ผู้ใช้ "พูดขัดจังหวะ" ระหว่างที่ No7 กำลังพูด
// ใช้ SpeechRecognition ตัวที่สอง (แยกจาก wake word) และกรองเสียงสะท้อนของ No7 เอง

const KEYWORDS = /(หยุด|พอแล้ว|พอ|เดี๋ยว|ชู่|ไม่ต้อง|stop|wait|hold on|shut up|cancel)/i;

export const BARGE_MODES = {
  off: { label: 'ปิด (กดปุ่มหยุดเอง)' },
  keyword: { label: 'พูดคำสั่งหยุด ("หยุด/พอ/stop")' },
  any: { label: 'พูดอะไรก็หยุด (ไวที่สุด)' },
};

/** ตัดช่องว่าง/วรรคตอน เพื่อเทียบเสียงสะท้อน */
export function normalizeSpeech(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[่-๋]/g, '')
    .replace(/[^\u0E00-\u0E7F\w]/g, '');
}

/** ข้อความที่ได้ยิน เป็นเสียงของ No7 เองหรือเปล่า */
export function isEcho(heard = '', spoken = '') {
  const h = normalizeSpeech(heard);
  const s = normalizeSpeech(spoken);
  if (!h || !s) return false;
  if (h.length >= 4 && s.includes(h)) return true;
  // เทียบอัตราส่วนตัวอักษรร่วม (กัน STT ได้ยินเพี้ยนเล็กน้อย)
  const set = new Set(s);
  let hit = 0;
  for (const ch of h) if (set.has(ch)) hit++;
  return hit / h.length > 0.85 && h.length >= 6;
}

export class BargeIn {
  /**
   * @param {{mode?: 'off'|'keyword'|'any', lang?: string, onInterrupt?: (heard: string) => void,
   *          onState?: (s: string) => void, windowRef?: object}} opts
   */
  constructor({ mode = 'keyword', lang = 'th-TH', onInterrupt = null, onState = null, windowRef = globalThis.window } = {}) {
    this.mode = BARGE_MODES[mode] ? mode : 'keyword';
    this.lang = lang;
    this.onInterrupt = onInterrupt;
    this.onState = onState;
    this.win = windowRef;
    this.rec = null;
    this.active = false;
    this.spoken = '';
    this.lastResultAt = 0;
  }

  get supported() {
    return !!(this.win?.SpeechRecognition || this.win?.webkitSpeechRecognition);
  }

  /** เรียกเมื่อเริ่มพูดประโยคใหม่ — ใช้เป็นข้อความอ้างอิงสำหรับกรองเสียงสะท้อน */
  setSpoken(text = '') {
    this.spoken = String(text).slice(-400);
  }

  start() {
    if (this.mode === 'off' || this.active || !this.supported) return false;
    const SR = this.win.SpeechRecognition || this.win.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let heard = '';
      for (let i = e.resultIndex; i < e.results.length; i++) heard += e.results[i][0].transcript;
      heard = heard.trim();
      if (!heard) return;
      if (isEcho(heard, this.spoken)) return;              // เสียงของ No7 เอง

      const now = Date.now();
      if (now - this.lastResultAt < 500) return;            // กันยิงรัว
      if (this.mode === 'keyword' && !KEYWORDS.test(heard)) return;

      this.lastResultAt = now;
      this.onInterrupt?.(heard);
    };
    rec.onerror = () => { /* ปล่อยให้ onend เริ่มใหม่ */ };
    rec.onend = () => {
      if (!this.active) return;
      setTimeout(() => { if (this.active) this._spawn(); }, 400);
    };

    this.rec = rec;
    this.active = true;
    try { rec.start(); } catch {}
    this.onState?.('listening');
    return true;
  }

  _spawn() {
    if (!this.active) return;
    try { this.rec?.abort?.(); } catch {}
    this.active = false;
    this.start();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    try { this.rec?.abort?.(); } catch {}
    this.rec = null;
    this.onState?.('off');
  }
}
