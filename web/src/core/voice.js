// Voice layer — browser-native STT (Web Speech) + TTS (SpeechSynthesis),
// with a pluggable native bridge for Electron / Capacitor / ESP32 phone-link.
// This is the web re-implementation of the ESP32 audio pipeline (16 kHz up / 24 kHz down).

export class Voice {
  constructor() {
    this.recognizer = null;
    this.speaking = false;
    this.listening = false;
    this.onSubtitle = null;
    this.onState = null;
    this.lang = 'th-TH';
  }

  get sttSupported() {
    return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  get ttsSupported() {
    return typeof window !== 'undefined' && !!window.speechSynthesis;
  }

  /** List Thai voices available on this device. */
  thaiVoices() {
    if (!this.ttsSupported) return [];
    return window.speechSynthesis.getVoices().filter((v) => /^th/i.test(v.lang));
  }

  /** Listen once (push-to-talk). Resolves with the transcript. */
  async listenOnce({ lang = this.lang, timeoutMs = 15000 } = {}) {
    if (!this.sttSupported) throw new Error('เบราว์เซอร์นี้ไม่รองรับการฟัง (ลอง Chrome/Edge/Safari)');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    this.recognizer = rec;

    return new Promise((resolve, reject) => {
      let finalText = '';
      const timer = setTimeout(() => { try { rec.stop(); } catch {} }, timeoutMs);

      rec.onstart = () => { this.listening = true; this.onState?.('LISTENING'); };
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interim += r[0].transcript;
        }
        this.onSubtitle?.(finalText + interim);
      };
      rec.onerror = (e) => {
        clearTimeout(timer);
        this.listening = false;
        this.onState?.('IDLE');
        reject(new Error(`ฟังไม่สำเร็จ: ${e.error || 'unknown'}`));
      };
      rec.onend = () => {
        clearTimeout(timer);
        this.listening = false;
        this.onState?.('IDLE');
        resolve(finalText.trim());
      };
      try { rec.start(); } catch (err) { reject(err); }
    });
  }

  stopListening() {
    try { this.recognizer?.stop(); } catch {}
  }

  /** Speak Thai text. Resolves when done. */
  async speak(text, { lang = this.lang, rate = 1.0, pitch = 1.0, voiceName } = {}) {
    if (!text || !this.ttsSupported) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(String(text).slice(0, 3000));
    utter.lang = lang;
    utter.rate = rate;
    utter.pitch = pitch;
    const voices = window.speechSynthesis.getVoices();
    const match = voiceName
      ? voices.find((v) => v.name === voiceName)
      : voices.find((v) => /^th/i.test(v.lang)) || voices[0];
    if (match) utter.voice = match;

    this.speaking = true;
    this.onState?.('SPEAKING');
    return new Promise((resolve) => {
      utter.onend = utter.onerror = () => {
        this.speaking = false;
        this.onState?.('IDLE');
        resolve();
      };
      window.speechSynthesis.speak(utter);
    });
  }

  stopSpeaking() {
    if (this.ttsSupported) window.speechSynthesis.cancel();
    this.speaking = false;
    this.onState?.('IDLE');
  }
}

/** Native TTS/STT bridge for Electron (window.no7.native) or Capacitor. */
export async function speakNative(text, lang = 'th-TH') {
  const bridge = globalThis.no7?.native;
  if (bridge?.tts) {
    await bridge.tts(text, lang);
    return true;
  }
  return false;
}
