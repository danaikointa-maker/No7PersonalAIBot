// Local models — "สมองในเครื่อง" (Ollama / LM Studio) สำหรับโหมดออฟไลน์
// หลักการ: ตรวจก่อนใช้ (probe) → เลือกโมเดล → อุ่นเครื่อง (warm-up) → ใช้เป็นสมองหลักเมื่อไม่มีเน็ต
//
// ใช้ได้ทั้งยิงตรงจากเบราว์เซอร์ (ถ้า Ollama/LM Studio อนุญาต origin) และผ่าน companion server
// (`POST /api/local-models`) ซึ่งเลี่ยง CORS และจำกัดปลายทางให้อยู่ในเครื่อง/วง LAN เท่านั้น

export const LOCAL_PRESETS = {
  ollama: {
    label: 'Ollama',
    baseUrl: 'http://localhost:11434',
    tagsPath: '/api/tags',
    chatPath: '/api/chat',
    defaultModel: 'llama3.1',
  },
  lmstudio: {
    label: 'LM Studio',
    baseUrl: 'http://localhost:1234',
    tagsPath: '/v1/models',
    chatPath: '/v1/chat/completions',
    defaultModel: '',
  },
};

export const LOCAL_TIMEOUT_MS = 4000;
export const LOCAL_CACHE_TTL_MS = 60_000;

/** ปลายทางที่ยอมให้ proxy ไปถึง — เครื่องเดียวกันหรือวง LAN ส่วนตัวเท่านั้น */
export function isPrivateHost(hostname = '') {
  const h = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1') return true;
  if (/^127\./.test(h) || /^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

export function normalizeLocalTarget(raw = {}) {
  const kind = LOCAL_PRESETS[raw.kind] ? raw.kind : 'ollama';
  const preset = LOCAL_PRESETS[kind];
  let baseUrl = String(raw.baseUrl || preset.baseUrl).trim().replace(/\/$/, '');
  let parsed = null;
  try { parsed = new URL(baseUrl); } catch { parsed = null; }
  const ok = !!parsed && /^https?:$/.test(parsed.protocol);
  return {
    kind,
    label: String(raw.label || preset.label),
    baseUrl: ok ? baseUrl : preset.baseUrl,
    valid: ok,
    private: ok ? isPrivateHost(parsed.hostname) : false,
  };
}

/** แปลง response ของ /api/tags (Ollama) หรือ /v1/models (LM Studio) เป็นรายการเดียว */
export function parseModelList(kind = 'ollama', json = {}) {
  const list = kind === 'lmstudio'
    ? (Array.isArray(json?.data) ? json.data : [])
    : (Array.isArray(json?.models) ? json.models : []);
  const seen = new Set();
  const out = [];
  for (const m of list) {
    const id = String(m?.name || m?.model || m?.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: id.replace(/:latest$/, ''),
      sizeBytes: Number(m?.size) || 0,
      family: String(m?.details?.family || m?.details?.family_large || m?.owned_by || ''),
      modifiedAt: m?.modified_at || m?.created || '',
    });
  }
  return out;
}

export function matchModel(models = [], query = '') {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [...models];
  const scored = models.map((m) => {
    const id = String(m.id || m).toLowerCase();
    let score = 0;
    if (id === q || m.name?.toLowerCase() === q) score = 3;
    else if (id.startsWith(q)) score = 2;
    else if (id.includes(q)) score = 1;
    return { m, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.m);
}

/** เลือกโมเดล: เอาตัวที่ผู้ใช้ตั้งไว้ถ้ามี → ไม่มีก็ตัวแรก */
export function pickBestModel(models = [], preferred = '') {
  if (!models.length) return '';
  const hit = matchModel(models, preferred)[0];
  return hit ? (hit.id || hit) : (models[0].id || models[0]);
}

async function withTimeout(fetchImpl, timeoutMs) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    return await fetchImpl(controller ? { signal: controller.signal } : {});
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ตรวจว่ามีเซิร์ฟเวอร์โมเดลในเครื่องไหม + มีโมเดลอะไรบ้าง
 * @returns {Promise<{results: Array<object>, models: Array<object>, best: object|null}>}
 */
export async function probeLocal({ targets = null, fetchImpl = null, timeoutMs = LOCAL_TIMEOUT_MS } = {}) {
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  const list = (Array.isArray(targets) && targets.length ? targets : [{ kind: 'ollama' }, { kind: 'lmstudio' }])
    .map(normalizeLocalTarget);

  const results = await Promise.all(list.map(async (t) => {
    const started = Date.now();
    try {
      const res = await withTimeout((init) => doFetch(`${t.baseUrl}${LOCAL_PRESETS[t.kind].tagsPath}`, init), timeoutMs);
      const latencyMs = Date.now() - started;
      if (!res?.ok) return { ...t, ok: false, latencyMs, models: [], error: `HTTP ${res?.status || 0}` };
      const json = await res.json();
      const models = parseModelList(t.kind, json);
      return { ...t, ok: true, latencyMs, models, error: '' };
    } catch (err) {
      return { ...t, ok: false, latencyMs: Date.now() - started, models: [], error: err?.message || String(err) };
    }
  }));

  const models = [];
  for (const r of results) {
    for (const m of r.models) models.push({ ...m, kind: r.kind, baseUrl: r.baseUrl });
  }
  const best = results.find((r) => r.ok && r.models.length) || null;
  return { results, models, best };
}

/** อุ่นเครื่อง: ยิงคำขวัญสั้น ๆ เพื่อให้โมเดลถูกโหลดเข้า RAM (ครั้งแรกจะช้า) */
export async function warmModel({ kind = 'ollama', baseUrl = '', model = '', fetchImpl = null, timeoutMs = 120000 } = {}) {
  const target = normalizeLocalTarget({ kind, baseUrl });
  if (!target.valid) throw new Error('baseUrl ไม่ถูกต้อง');
  if (!model) throw new Error('ต้องระบุชื่อโมเดล');
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  const started = Date.now();
  const path = LOCAL_PRESETS[target.kind].chatPath;
  const body = target.kind === 'lmstudio'
    ? { model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false }
    : { model, messages: [{ role: 'user', content: 'ping' }], stream: false, options: { num_predict: 1 } };
  const res = await withTimeout(
    (init) => doFetch(`${target.baseUrl}${path}`, {
      ...init,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    timeoutMs,
  );
  const ms = Date.now() - started;
  if (!res?.ok) {
    const detail = await res?.text?.().catch(() => '');
    throw new Error(`อุ่นเครื่องไม่สำเร็จ (HTTP ${res?.status || 0}) ${String(detail || '').slice(0, 120)}`);
  }
  return { ok: true, ms, model, kind: target.kind, baseUrl: target.baseUrl };
}

/** แคชผล probe 60 วินาที (กันกดซ้ำรัว ๆ) */
export class LocalModelCache {
  constructor({ ttlMs = LOCAL_CACHE_TTL_MS, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.entry = null;
  }

  get() {
    if (!this.entry) return null;
    if (this.now() - this.entry.at > this.ttlMs) { this.entry = null; return null; }
    return this.entry.value;
  }

  set(value) {
    this.entry = { at: this.now(), value };
    return value;
  }

  clear() { this.entry = null; }
}

export function normalizeOfflineBrain(raw = {}) {
  const target = normalizeLocalTarget({ kind: raw.kind, baseUrl: raw.baseUrl });
  return {
    enabled: raw.enabled === true,
    kind: target.kind,
    baseUrl: target.baseUrl,
    model: String(raw.model || '').trim(),
  };
}

/**
 * ถ้าออฟไลน์ + เปิด "สมองในเครื่อง" → สลับไปใช้โมเดลในเครื่องเป็นตัวเดียว
 * (คืน settings ตัวใหม่ ไม่แก้ของเดิม)
 */
export function offlineChainSettings(settings = {}, { online = null } = {}) {
  const isOnline = online === null
    ? (typeof navigator === 'undefined' ? true : navigator.onLine !== false)
    : !!online;
  const local = normalizeOfflineBrain(settings.offlineBrain);
  if (isOnline || !local.enabled || !local.baseUrl) return settings;
  return {
    ...settings,
    costMode: 'private',            // chain = [ollama] เท่านั้น
    provider: 'ollama',
    baseUrl: local.baseUrl,
    model: local.model || settings.model || LOCAL_PRESETS.ollama.defaultModel,
    apiKey: '',
  };
}

export function describeLocalBrain(settings = {}) {
  const local = normalizeOfflineBrain(settings.offlineBrain);
  if (!local.enabled) return 'สมองในเครื่อง: ปิด';
  return `สมองในเครื่อง: ${LOCAL_PRESETS[local.kind].label} · ${local.model || 'ยังไม่เลือกโมเดล'} · ${local.baseUrl}`;
}
