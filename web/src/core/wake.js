// Wake word — "No7" ฟังเบาๆ อยู่เบื้องหลัง แล้วเริ่มฟังจริงเมื่อได้ยินชื่อ
// ใช้ Web Speech แบบต่อเนื่อง (Chrome/Edge/Safari) และหยุดชั่วคราวขณะ No7 พูด (กันเสียงตัวเอง)

const DEFAULT_PHRASES = [
  /โน\s*เซเว่น/i, /โน่\s*เซเว่น/i, /นัมเบอร์\s*เซเวน/i, /โน7/i,
  /\bno\s*7\b/i, /\bno\s*seven\b/i, /\bhey\s*no7\b/i,
];

export class WakeWord {
  /**
   * @param {{phrases?: RegExp[], lang?: string, onWake?: () => void, onState?: (s: string) => void, onHeard?: (t: string) => void}} opts
   */
  constructor({ phrases = DEFAULT_PHRASES, lang = 'th-TH', onWake = null, onState = null, onHeard = null } = {}) {
    this.phrases = phrases;
    this.lang = lang;
    this.onWake = onWake;
    this.onState = onState;
    this.onHeard = onHeard;
    this.active = false;
    this.paused = false;
    this.rec = null;
    this.lastWake = 0;
    this.restartDelay = 600;
    this._restartTimer = null;
  }

  get supported() {
    return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  get state() {
    if (!this.active) return 'off';
    if (this.paused) return 'paused';
    return 'listening';
  }

  start() {
    if (!this.supported) throw new Error('อุปกรณ์นี้ไม่รองรับการฟังเบื้องหลัง');
    if (this.active) return;
    this.active = true;
    this._spawn();
    this.onState?.(this.state);
  }

  stop() {
    this.active = false;
    clearTimeout(this._restartTimer);
    try { this.rec?.abort?.(); } catch {}
    this.rec = null;
    this.onState?.(this.state);
  }

  /** หยุดชั่วคราวตอน No7 พูด — ไม่ให้ไมค์ได้ยินเสียงตัวเอง */
  pause() {
    if (!this.active || this.paused) return;
    this.paused = true;
    try { this.rec?.abort?.(); } catch {}
    this.onState?.(this.state);
  }

  resume() {
    if (!this.active || !this.paused) return;
    this.paused = false;
    this._spawn();
    this.onState?.(this.state);
  }

  _spawn() {
    if (!this.active || this.paused) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    this.rec = rec;

    rec.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
      const clean = text.trim();
      if (!clean) return;
      this.onHeard?.(clean);
      if (this.paused) return;
      if (this.phrases.some((re) => re.test(clean))) {
        const now = Date.now();
        if (now - this.lastWake < 2500) return;     // กันเรียกซ้ำรัวๆ
        this.lastWake = now;
        this.onWake?.();
      }
    };

    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.active = false;
        this.onState?.('denied');
        return;
      }
      // no-speech / network → ปล่อยให้ onend เริ่มใหม่
    };

    rec.onend = () => {
      if (!this.active || this.paused) return;
      clearTimeout(this._restartTimer);
      this._restartTimer = setTimeout(() => this._spawn(), this.restartDelay);
    };

    try { rec.start(); } catch { /* เครื่องอาจยังไม่พร้อม — onend จะลองใหม่ */ }
  }
}
