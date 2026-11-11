// TTS router — เลือก engine ได้: system (speechSynthesis) / openai-compatible / elevenlabs / ปิด
// ทุก engine ถูกห่อด้วย interface เดียว: speak(text, opts) → Promise, stop()
// + AudioCache: ข้อความเดิม (เสียงเดิม) เล่นซ้ำได้ทันทีโดยไม่ต้องเรียกผู้ให้บริการอีก

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
    defaultModel: 'tts-1',
    defaultVoice: 'alloy',
  },
  elevenlabs: {
    label: 'ElevenLabs (เสียงพรีเมียม)',
    desc: 'เสียงธรรมชาติหลายภาษา รวมไทย — ต้องมี ELEVENLABS_API_KEY ที่ server หรือกรอกในเครื่อง',
    needsServer: true,
    defaultModel: 'eleven_multilingual_v2',
    defaultVoice: '21m00Tcm4TlvDq8ikWAM',
  },
  off: { label: 'ปิดเสียง', desc: 'ไม่พูดเลย (อ่านข้อความเท่านั้น)', needsServer: false },
};

/** เสียงแนะนำต่อผู้ให้บริการ (ใช้เติม dropdown ในหน้าตั้งค่า) */
export const TTS_VOICES = {
  openai: [
    { id: 'alloy', label: 'Alloy (กลาง ๆ)' },
    { id: 'nova', label: 'Nova (สดใส)' },
    { id: 'shimmer', label: 'Shimmer (นุ่ม)' },
    { id: 'onyx', label: 'Onyx (ทุ้ม)' },
  ],
  elevenlabs: [
    { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel (หญิง, เล่าเรื่อง)' },
    { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah (หญิง, นุ่ม)' },
    { id: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh (ชาย, หนุ่ม)' },
    { id: 'pNInz6obpgDQGcFmaJgB', label: 'Adam (ชาย, ทุ้ม)' },
    { id: 'yoZ06aMxZJJ28mfd3POQ', label: 'Sam (กลาง ๆ)' },
  ],
};

export function voicesFor(provider = '') {
  return TTS_VOICES[provider] || [];
}

/** รวม settings → ค่าที่ router ใช้จริง (เติม default ต่อ provider ให้) */
export function resolveTTSConfig(settings = {}) {
  const provider = TTS_PROVIDERS[settings.ttsProvider] ? settings.ttsProvider : 'system';
  const meta = TTS_PROVIDERS[provider];
  const defaultVoice = meta.defaultVoice || '';
  const voice = String(settings.ttsVoice || '').trim() || defaultVoice;
  return {
    provider,
    needsServer: !!meta.needsServer,
    voice: provider === 'elevenlabs' && /^(alloy|nova|shimmer|onyx)$/.test(voice) ? defaultVoice : voice,
    model: String(settings.ttsModel || '').trim() || meta.defaultModel || '',
    baseUrl: String(settings.ttsBaseUrl || '').trim(),
    apiKey: String(settings.ttsApiKey || '').trim(),
    cache: settings.ttsCache !== false,
  };
}

/**
 * แคชเสียงในหน่วยความจำ (LRU ตามจำนวนรายการ + ไบต์)
 * เก็บเป็น Blob แล้วสร้าง object URL ใหม่ทุกครั้งที่เล่น → revoke ได้ปลอดภัย
 */
export class AudioCache {
  constructor({ maxEntries = 20, maxBytes = 5 * 1024 * 1024, now = () => Date.now() } = {}) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.now = now;
    this.map = new Map(); // key -> { blob, bytes, at }
    this.bytes = 0;
    this.hits = 0;
    this.misses = 0;
  }

  static key({ provider = '', voice = '', model = '', lang = '', text = '' } = {}) {
    return `${provider}|${voice}|${model}|${lang}|${String(text).trim()}`;
  }

  get(key) {
    const hit = this.map.get(key);
    if (!hit) { this.misses++; return null; }
    this.map.delete(key);          // ย้ายไปท้ายสุด (recent)
    hit.at = this.now();
    this.map.set(key, hit);
    this.hits++;
    return hit.blob;
  }

  set(key, blob, bytes = 0) {
    if (!blob) return null;
    const size = Number(bytes) || Number(blob.size) || 0;
    if (size > this.maxBytes) return null;            // ก้อนใหญ่เกินเพดาน = ไม่แคช
    if (this.map.has(key)) this.delete(key);
    this.map.set(key, { blob, bytes: size, at: this.now() });
    this.bytes += size;
    this._evict();
    return blob;
  }

  delete(key) {
    const hit = this.map.get(key);
    if (!hit) return false;
    this.bytes -= hit.bytes;
    this.map.delete(key);
    return true;
  }

  _evict() {
    while ((this.map.size > this.maxEntries || this.bytes > this.maxBytes) && this.map.size > 1) {
      const oldest = this.map.keys().next().value;
      this.delete(oldest);
    }
  }

  clear() {
    this.map.clear();
    this.bytes = 0;
    this.hits = 0;
    this.misses = 0;
  }

  stats() {
    return { entries: this.map.size, bytes: this.bytes, hits: this.hits, misses: this.misses, maxEntries: this.maxEntries, maxBytes: this.maxBytes };
  }
}

export class TTSRouter {
  /**
   * @param {{settings: () => object, voice: object, serverUrl?: () => string}} deps
   */
  constructor({ settings, voice, serverUrl = () => 'http://localhost:8787', audioFactory = null, fetchImpl = null, cache = null } = {}) {
    this.cache = cache === false ? null : (cache || new AudioCache());
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
    const cfg = resolveTTSConfig(this.getSettings?.() || {});
    if (cfg.provider === 'off') return { engine: 'off' };

    if (cfg.needsServer) {
      try {
        const res = await this._speakServer(clean, opts, cfg);
        return res;
      } catch (err) {
        this.onFallback?.(err);
        // ตกไปใช้เสียงระบบ เพื่อไม่ให้เงียบ
      }
    }
    await this.voice.speak(clean, opts);
    return { engine: 'system' };
  }

  cacheStats() { return this.cache ? this.cache.stats() : null; }

  clearCache() { this.cache?.clear(); }

  async _speakServer(text, opts = {}, cfg = resolveTTSConfig(this.getSettings?.() || {})) {
    const lang = opts.lang || 'th';
    const key = AudioCache.key({ provider: cfg.provider, voice: cfg.voice, model: cfg.model, lang, text });
    let blob = cfg.cache ? this.cache?.get(key) : null;
    const cached = !!blob;

    if (!blob) {
      blob = await this._fetchAudio(text, lang, cfg);
      if (cfg.cache) this.cache?.set(key, blob, blob?.size || 0);
    }

    const played = await this._playBlob(blob);
    return { engine: cfg.provider, cached, ...played };
  }

  async _fetchAudio(text, lang, cfg) {
    const serverUrl = String(this.getServerUrl?.() || '').replace(/\/$/, '');
    const body = {
      provider: cfg.provider,
      text,
      voice: cfg.voice,
      model: cfg.model,
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      lang,
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
    return res.blob();
  }

  async _playBlob(blob) {
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
      audio.onended = () => { done(); resolve({}); };
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
