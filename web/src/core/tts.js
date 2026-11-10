// TTS router — เลือก engine ได้: system (speechSynthesis) / openai-compatible (ผ่าน server) / ปิด
// ทุก engine ถูกห่อด้วย interface เดียว: speak(text, opts) → Promise, stop()

export const TTS_PROVIDERS = {
  system: {
    label: 'เสียงของอุปกรณ์ (ฟรี)',
    desc: 'ใช้ speechSynthesis — เสียงไทยของเครื่อง รองรับออฟไลน์',
    needsServer: false,
  },
  openai: {
    label: 'OpenAI-compatible TTS (คุณภาพสูง)',
    desc: 'ใช้ /audio/speech ผ่าน companion server — ต้องมี API key ที่ server หรือในเครื่อง',
    needsServer: true,
  },
  off: { label: 'ปิดเสียง', desc: 'ไม่พูดเลย (อ่านข้อความเท่านั้น)', needsServer: false },
};

export class TTSRouter {
  /**
   * @param {{settings: () => object, voice: object, serverUrl?: () => string}} deps
   */
  constructor({ settings, voice, serverUrl = () => 'http://localhost:8787', audioFactory = null, fetchImpl = null } = {}) {
    this.getSettings = settings;
    this.voice = voice;
    this.getServerUrl = serverUrl;
    this.audioFactory = audioFactory || ((src) => new globalThis.Audio(src));
    this.fetchImpl = fetchImpl || ((...a) => globalThis.fetch(...a));
    this.currentAudio = null;
    this.speaking = false;
    this.onFallback = null;
  }

  get provider() {
    const s = this.getSettings?.() || {};
    return TTS_PROVIDERS[s.ttsProvider] ? s.ttsProvider : 'system';
  }

  async speak(text, opts = {}) {
    const clean = String(text || '').trim();
    if (!clean) return { engine: 'none' };
    const provider = this.provider;
    if (provider === 'off') return { engine: 'off' };

    if (provider === 'openai') {
      try {
        const res = await this._speakOpenAI(clean, opts);
        return res;
      } catch (err) {
        this.onFallback?.(err);
        // ตกไปใช้เสียงระบบ เพื่อไม่ให้เงียบ
      }
    }
    await this.voice.speak(clean, opts);
    return { engine: 'system' };
  }

  async _speakOpenAI(text, opts = {}) {
    const s = this.getSettings?.() || {};
    const serverUrl = String(this.getServerUrl?.() || '').replace(/\/$/, '');
    const body = {
      text,
      voice: s.ttsVoice || 'alloy',
      model: s.ttsModel || 'tts-1',
      apiKey: s.ttsApiKey || '',
      baseUrl: s.ttsBaseUrl || '',
      lang: opts.lang || 'th',
    };
    const res = await this.fetchImpl(`${serverUrl}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`TTS server ${res.status}: ${msg.slice(0, 120)}`);
    }
    const blob = await res.blob();
    const url = globalThis.URL.createObjectURL(blob);
    const audio = this.audioFactory(url);

    this.speaking = true;
    this.currentAudio = audio;
    return new Promise((resolve, reject) => {
      const done = () => {
        this.speaking = false;
        this.currentAudio = null;
        try { globalThis.URL.revokeObjectURL(url); } catch {}
      };
      audio.onended = () => { done(); resolve({ engine: 'openai' }); };
      audio.onerror = () => { done(); reject(new Error('เล่นเสียงไม่สำเร็จ')); };
      try { audio.play(); } catch (err) { done(); reject(err); }
    });
  }

  stop() {
    try { this.currentAudio?.pause?.(); } catch {}
    this.currentAudio = null;
    this.speaking = false;
    try { this.voice.stopSpeaking(); } catch {}
  }
}
