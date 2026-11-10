// Multi-brain AI providers — merged from Uncle (llm.js/tiers.js) + ESP32 (GeminiLiveClient).
// Default: Pollinations (free, no key) so the app works out of the box on mobile + PC.

export const PROVIDERS = {
  pollinations: {
    label: 'Pollinations (ฟรี)',
    defaultModel: 'openai',
    needsKey: false,
  },
  gemini: {
    label: 'Google Gemini',
    defaultModel: 'gemini-2.0-flash',
    needsKey: true,
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    needsKey: true,
  },
  ollama: {
    label: 'Ollama (ในเครื่อง)',
    defaultModel: 'llama3.1',
    needsKey: false,
    defaultBaseUrl: 'http://localhost:11434',
  },
  'openai-compatible': {
    label: 'OpenAI-compatible',
    defaultModel: 'gpt-4o-mini',
    needsKey: true,
  },
};

export class AIProvider {
  constructor(settings) {
    this.settings = settings; // {provider, model, apiKey, baseUrl}
  }

  async chat(messages, { onToken } = {}) {
    const { provider, model, apiKey, baseUrl } = this.settings;
    switch (provider) {
      case 'pollinations': return this._pollinations(messages, model, onToken);
      case 'gemini': return this._gemini(messages, model, apiKey, onToken);
      case 'openai': return this._openai(messages, model, apiKey, baseUrl || 'https://api.openai.com/v1', onToken);
      case 'ollama': return this._ollama(messages, model, baseUrl || 'http://localhost:11434', onToken);
      case 'openai-compatible': return this._openai(messages, model, apiKey, baseUrl, onToken);
      default: throw new Error(`ไม่รู้จักผู้ให้บริการ: ${provider}`);
    }
  }

  // Pollinations: https://text.pollinations.ai/openai (OpenAI-compatible, no key)
  async _pollinations(messages, model, onToken) {
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || 'openai', messages }),
    });
    if (!res.ok) throw new Error(`Pollinations ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    onToken?.(text);
    return text;
  }

  async _gemini(messages, model, apiKey, onToken) {
    if (!apiKey) throw new Error('ใส่ Gemini API key ก่อนในตั้งค่า');
    const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: sys ? { parts: [{ text: sys }] } : undefined, contents }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    onToken?.(text);
    return text;
  }

  async _openai(messages, model, apiKey, baseUrl, onToken) {
    if (!apiKey && !baseUrl.includes('localhost')) throw new Error('ใส่ API key ก่อนในตั้งค่า');
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model: model || 'gpt-4o-mini', messages }),
    });
    if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    onToken?.(text);
    return text;
  }

  async _ollama(messages, model, baseUrl, onToken) {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || 'llama3.1', messages, stream: false }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status} — เปิด Ollama อยู่ไหม?`);
    const data = await res.json();
    const text = data.message?.content || '';
    onToken?.(text);
    return text;
  }
}

/**
 * Turn the chosen cost strategy into an ordered chain of brains.
 * free    → Pollinations first (and Ollama if configured)
 * quality → Gemini/OpenAI when keys exist, then free
 * private → Ollama only, never falls back to a cloud provider
 * mixed   → whatever the user configured, then free, then local
 */
export function resolveProviderChain(s) {
  const ollama = s.baseUrl ? { provider: 'ollama', model: s.model || 'llama3.1', baseUrl: s.baseUrl } : null;
  const free = { provider: 'pollinations', model: 'openai' };
  const chosen = { provider: s.provider, model: s.model, apiKey: s.apiKey, baseUrl: s.baseUrl };
  const configured = s.provider === 'pollinations' ? true
    : s.provider === 'ollama' ? !!s.baseUrl
      : s.provider === 'openai-compatible' ? !!s.baseUrl
        : !!s.apiKey;

  if (s.costMode === 'private') return ollama ? [ollama] : [];
  if (s.costMode === 'free') return [free, ...(ollama ? [ollama] : [])];
  if (s.costMode === 'quality') {
    const paid = ['gemini', 'openai', 'openai-compatible'].includes(s.provider) && s.apiKey ? [chosen] : [];
    return [...paid, free, ...(ollama ? [ollama] : [])];
  }
  // mixed
  const chain = [];
  if (configured && s.provider !== 'pollinations') chain.push(chosen);
  chain.push(free);
  if (ollama) chain.push(ollama);
  return chain;
}

/** Try each brain in order. 401/403 stops immediately (wrong key ≠ quota problem). */
export async function chatWithFallback(messages, chain, { fallback, onToken } = {}) {
  if (!chain?.length) throw new Error('ยังไม่มีสมอง AI ที่ใช้ได้ — ไปที่ตั้งค่า > สมอง AI');
  const errors = [];
  for (const cfg of chain) {
    try {
      const provider = new AIProvider(cfg);
      return await provider.chat(messages, { onToken });
    } catch (err) {
      const status = Number(/(\d{3})/.exec(err.message)?.[1] || 0);
      fallback?.recordError(cfg.model, status);
      errors.push(`${cfg.provider}: ${err.message}`);
      if (status === 401 || status === 403) {
        throw new Error(`คีย์/สิทธิ์ของ ${cfg.provider} ไม่ถูกต้อง — หยุดลองสมองอื่น\n${err.message}`);
      }
    }
  }
  throw new Error(`ทุกสมองใช้งานไม่ได้:\n${errors.join('\n')}`);
}

// Quota-aware fallback (from ESP32 ModelFallback):
// quota → pause 10–120 min, unavailable → 5 min, not found → 24 h. Wrong key never falls back.
export class ModelFallback {
  constructor() {
    this.cooldowns = new Map(); // model -> until timestamp
  }

  isCooling(model) {
    const until = this.cooldowns.get(model);
    return until && Date.now() < until;
  }

  recordError(model, status) {
    if (status === 429) this.cooldowns.set(model, Date.now() + 30 * 60 * 1000);
    else if (status === 503) this.cooldowns.set(model, Date.now() + 5 * 60 * 1000);
    else if (status === 404) this.cooldowns.set(model, Date.now() + 24 * 60 * 60 * 1000);
    // 401/403 = wrong key → no fallback
  }

  pick(models) {
    return models.find((m) => !this.isCooling(m)) || null;
  }
}

/* ------------------------------------------------------------------ streaming */
// ทุกผู้ให้บริการที่รองรับจะถูกสตรีมแบบ token ต่อ token ถ้าทำไม่ได้จะถอยไปใช้ chat() ปกติ

async function* readLines(res) {
  if (!res.body?.getReader) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) yield line;
    }
  }
  if (buf.trim()) yield buf.trim();
}

function deltaFromEvent(json, provider) {
  if (provider === 'gemini') {
    return json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  }
  if (provider === 'ollama') {
    return json?.message?.content || '';
  }
  return json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || '';
}

class StreamingMethods {
  get supportsStreaming() {
    return ['pollinations', 'openai', 'openai-compatible', 'ollama', 'gemini'].includes(this.settings.provider);
  }

  /** Stream a reply; calls onToken(delta) และคืนข้อความเต็ม */
  async chatStream(messages, { onToken } = {}) {
    const { provider, model, apiKey, baseUrl } = this.settings;
    let url;
    let body;
    let headers = { 'Content-Type': 'application/json' };

    if (provider === 'pollinations') {
      url = 'https://text.pollinations.ai/openai';
      body = { model: model || 'openai', messages, stream: true };
    } else if (provider === 'ollama') {
      url = `${(baseUrl || 'http://localhost:11434').replace(/\/$/, '')}/api/chat`;
      body = { model: model || 'llama3.1', messages, stream: true };
    } else if (provider === 'gemini') {
      if (!apiKey) throw new Error('ใส่ Gemini API key ก่อนในตั้งค่า');
      const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      const contents = messages.filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:streamGenerateContent?alt=sse&key=${apiKey}`;
      body = { systemInstruction: sys ? { parts: [{ text: sys }] } : undefined, contents };
    } else if (provider === 'openai' || provider === 'openai-compatible') {
      if (!apiKey && provider === 'openai') throw new Error('ใส่ OpenAI API key ก่อนในตั้งค่า');
      const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
      url = `${base}/chat/completions`;
      body = { model: model || 'gpt-4o-mini', messages, stream: true };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    } else {
      return this.chat(messages, { onToken });
    }

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text().catch(() => '')}`);

    let full = '';
    let sawToken = false;
    for await (const line of readLines(res)) {
      const payload = line.startsWith('data:') ? line.slice(5).trim() : line;
      if (!payload || payload === '[DONE]') continue;
      let json;
      try { json = JSON.parse(payload); } catch { continue; }
      const delta = deltaFromEvent(json, provider);
      if (delta) { full += delta; sawToken = true; onToken?.(delta); }
      if (json?.done === true) break;
    }

    if (!sawToken) {
      // ไม่มี body แบบ stream (เช่น ถูก mock/ถูก proxy) → ใช้คำตอบก้อนเดียว
      const text = await this.chat(messages);
      if (text) onToken?.(text);
      return text;
    }
    return full;
  }
}

// ติดเมธอดสตรีมเข้ากับ AIProvider ตัวเดิม (แยกไฟล์ไม่ได้เพราะต้องใช้ settings เดียวกัน)
for (const [key, desc] of Object.entries(Object.getOwnPropertyDescriptors(StreamingMethods.prototype))) {
  if (key !== 'constructor') Object.defineProperty(AIProvider.prototype, key, desc);
}

/** เหมือน chatWithFallback แต่สตรีม token — สลับเจ้าอื่นได้เฉพาะเมื่อยังไม่ออกเสียงไปแล้ว */
export async function chatWithFallbackStream(messages, chain, { fallback, onToken } = {}) {
  if (!chain?.length) throw new Error('ยังไม่มีสมอง AI ที่ใช้ได้ — ไปที่ตั้งค่า > สมอง AI');
  const errors = [];
  for (const cfg of chain) {
    let emitted = false;
    try {
      const provider = new AIProvider(cfg);
      const text = await provider.chatStream(messages, {
        onToken: (d) => { emitted = true; onToken?.(d); },
      });
      return text;
    } catch (err) {
      const status = Number(/(\d{3})/.exec(err.message)?.[1] || 0);
      fallback?.recordError(cfg.model, status);
      errors.push(`${cfg.provider}: ${err.message}`);
      if (status === 401 || status === 403) {
        throw new Error(`คีย์/สิทธิ์ของ ${cfg.provider} ไม่ถูกต้อง — หยุดลองสมองอื่น\n${err.message}`);
      }
      if (emitted) throw err;   // ออกเสียงไปแล้ว สลับกลางคันไม่ได้
    }
  }
  throw new Error(`ทุกสมองใช้งานไม่ได้:\n${errors.join('\n')}`);
}
