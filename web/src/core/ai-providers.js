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
