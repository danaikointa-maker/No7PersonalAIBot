// Long-term memory 2.0 — GraphRAG-lite (BM25) + episodic log + pin/edit/decay.
// Ported from ESP32 memory/ (MemoryStore, TextFeatures, EpisodicLog), now with
// usage-aware ranking and non-destructive portable export/import.

const KEY = 'no7.memory.v2';
const LEGACY_FACTS = 'no7.memory.facts.v1';
const LEGACY_LOG = 'no7.memory.log.v1';
const DAY = 24 * 60 * 60 * 1000;
const MEMORY_IMPORT_VERSION = 2;

export function validateMemoryImportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { valid: false, reason: 'root' };
  if (payload.kind !== undefined && payload.kind !== 'no7-memory') return { valid: false, reason: 'kind' };
  if (payload.version !== undefined && (!Number.isInteger(payload.version) || payload.version < 1 || payload.version > MEMORY_IMPORT_VERSION)) {
    return { valid: false, reason: 'version' };
  }
  const hasFacts = Object.hasOwn(payload, 'facts');
  const hasLog = Object.hasOwn(payload, 'log');
  if (hasFacts && !Array.isArray(payload.facts)) return { valid: false, reason: 'facts' };
  if (hasLog && !Array.isArray(payload.log)) return { valid: false, reason: 'log' };
  if (!hasFacts && !hasLog) return { valid: false, reason: 'collections' };
  return { valid: true, reason: '' };
}

function loadRaw(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveRaw(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch (err) {
    const quota = /quota|exceeded/i.test(err?.name || err?.message || '');
    try {
      globalThis.dispatchEvent?.(new CustomEvent('no7:storage-error', {
        detail: {
          key,
          message: quota
            ? 'พื้นที่เก็บข้อมูลเต็ม — ส่งออกความจำและจัดการพื้นที่ด้วยตนเองในหน้าตั้งค่า; ระบบจะไม่ลบข้อมูลเก่าอัตโนมัติ'
            : `บันทึกความจำไม่สำเร็จ: ${err?.message || err}`,
        },
      }));
    } catch {}
    return false;
  }
}

// --- Thai text features (from ESP32 TextFeatures) ---
// UTF-8 → strip tone marks → bigram (Thai) / word (English) → FNV hash
export function tokenize(text) {
  const clean = String(text || '')
    .toLowerCase()
    .replace(/[่-๋]/g, '')
    .replace(/[^\u0E00-\u0E7F\w\s]/g, ' ');
  const tokens = [];
  const thai = clean.match(/[\u0E00-\u0E7F]+/g) || [];
  for (const chunk of thai) {
    for (let i = 0; i < chunk.length - 1; i++) tokens.push(chunk.slice(i, i + 2));
  }
  const eng = clean.match(/[a-z0-9]+/g) || [];
  tokens.push(...eng);
  return tokens;
}

export function fnvHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

const id = () => `f${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export class MemoryStore {
  constructor() {
    this._importPlans = new WeakMap();
    const state = loadRaw(KEY, null);
    if (state) {
      this.facts = state.facts || [];
      this.log = state.log || [];
      this.meta = state.meta || {};
    } else {
      // migrate v1 (two keys) → v2 (one document)
      this.facts = loadRaw(LEGACY_FACTS, []).map((f) => ({
        id: f.id || id(), text: f.text, tokens: f.tokens || tokenize(f.text),
        importance: f.importance ?? 1, ts: f.ts || Date.now(), created: f.ts || Date.now(),
        pinned: false, used: 0, source: 'legacy',
      }));
      this.log = loadRaw(LEGACY_LOG, []);
      this.meta = { migratedFrom: 'v1', migratedAt: Date.now(), lastConsolidated: 0 };
      this._persist();
    }
    this._buildIndex();
  }

  _buildIndex() {
    this.df = new Map();
    for (const f of this.facts) {
      for (const t of new Set(f.tokens)) this.df.set(t, (this.df.get(t) || 0) + 1);
    }
  }

  _cloneFacts() {
    return this.facts.map((fact) => ({ ...fact, tokens: Array.isArray(fact.tokens) ? [...fact.tokens] : tokenize(fact.text) }));
  }

  _commitState({ facts = this.facts, log = this.log, meta = this.meta } = {}) {
    if (!saveRaw(KEY, { version: 2, facts, log, meta })) return false;
    this.facts = facts;
    this.log = log;
    this.meta = meta;
    this._buildIndex();
    return true;
  }

  /** Add or merge a fact. opts: {importance, source, pinned} */
  addFact(text, importanceOrOpts = 1, legacySource) {
    const opts = typeof importanceOrOpts === 'object' && importanceOrOpts !== null
      ? importanceOrOpts
      : { importance: importanceOrOpts, source: legacySource };
    const clean = String(text || '').trim();
    if (!clean) return null;
    const tokens = tokenize(clean);
    const facts = this._cloneFacts();
    const existing = facts.find((fact) => jaccard(tokens, fact.tokens) >= 0.75);
    if (existing) {
      existing.importance = Math.max(existing.importance, opts.importance ?? 1);
      if (opts.pinned) existing.pinned = true;
      existing.ts = Date.now();
      return this._commitState({ facts }) ? existing : null;
    }
    const fact = {
      id: id(), text: clean, tokens,
      importance: Math.min(5, Math.max(1, Number(opts.importance) || 1)),
      ts: Date.now(), created: Date.now(),
      pinned: !!opts.pinned, used: 0, source: opts.source || 'user',
    };
    facts.push(fact);
    return this._commitState({ facts }) ? fact : null;
  }

  updateFact(factId, patch = {}) {
    const facts = this._cloneFacts();
    const f = facts.find((item) => item.id === factId);
    if (!f) return null;
    if (typeof patch.text === 'string' && patch.text.trim()) {
      f.text = patch.text.trim();
      f.tokens = tokenize(f.text);
    }
    if (patch.importance != null) f.importance = Math.min(5, Math.max(1, Number(patch.importance) || 1));
    if (patch.pinned != null) f.pinned = !!patch.pinned;
    f.ts = Date.now();
    return this._commitState({ facts }) ? f : null;
  }

  togglePin(factId) {
    const facts = this._cloneFacts();
    const f = facts.find((item) => item.id === factId);
    if (!f) return null;
    f.pinned = !f.pinned;
    return this._commitState({ facts }) ? f : null;
  }

  removeFact(factId) {
    if (!this.facts.some((fact) => fact.id === factId)) return false;
    const facts = this._cloneFacts().filter((fact) => fact.id !== factId);
    return this._commitState({ facts });
  }

  /** Restore exact fact records without overwriting edits made since removal. */
  restoreFacts(records = []) {
    const result = { restored: 0, skipped: 0 };
    const facts = this._cloneFacts();
    for (const raw of records) {
      const text = String(raw?.text || '').trim();
      if (!text || !raw?.id || facts.some((fact) => fact.id === raw.id || fact.text === text)) {
        result.skipped++;
        continue;
      }
      facts.push({ ...raw, text, tokens: tokenize(text) });
      result.restored++;
    }
    if (result.restored && !this._commitState({ facts })) return { restored: 0, skipped: result.skipped, failed: true };
    return result;
  }

  /** listFacts({query, pinnedOnly, sort}) — pinned first, then recency */
  listFacts(opts = {}) {
    let list = [...this.facts];
    if (opts.pinnedOnly) list = list.filter((f) => f.pinned);
    if (opts.query) {
      const hits = new Set(this.search(opts.query, 100).map((f) => f.id));
      list = list.filter((f) => hits.has(f.id));
    }
    const sort = opts.sort || 'recent';
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sort === 'importance') return b.importance - a.importance || b.ts - a.ts;
      if (sort === 'used') return (b.used || 0) - (a.used || 0) || b.ts - a.ts;
      return b.ts - a.ts;
    });
    return list;
  }

  getFact(factId) { return this.facts.find((f) => f.id === factId) || null; }

  /** BM25 (k1=1.2, b=0.5) × importance × recency × pin bonus */
  search(query, limit = 6) {
    const qTokens = tokenize(query);
    if (!qTokens.length || !this.facts.length) return [];
    const N = this.facts.length;
    const avgLen = this.facts.reduce((s, f) => s + f.tokens.length, 0) / N || 1;
    const now = Date.now();
    const scored = [];
    for (const f of this.facts) {
      const tf = new Map();
      for (const t of f.tokens) tf.set(t, (tf.get(t) || 0) + 1);
      let score = 0;
      for (const qt of new Set(qTokens)) {
        const freq = tf.get(qt);
        if (!freq) continue;
        const df = this.df.get(qt) || 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const tfNorm = (freq * 2.2) / (freq + 1.2 * (0.5 + 0.5 * (f.tokens.length / avgLen)));
        score += idf * tfNorm;
      }
      if (score <= 0) continue;
      const ageDays = Math.max(0, (now - (f.ts || now)) / DAY);
      const recency = 1 + 0.2 * Math.exp(-ageDays / 30);      // fresh facts weigh a bit more
      score *= (f.importance || 1) * recency * (f.pinned ? 1.25 : 1);
      scored.push({ fact: f, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const out = scored.slice(0, limit).map((s) => s.fact);
    for (const f of out) f.used = (f.used || 0) + 1;          // usage feeds consolidation
    return out;
  }

  logTurn(role, text, meta = {}) {
    const item = { role, text: String(text).slice(0, 2000), ts: Date.now(), ...meta };
    const log = [...this.log, item];
    return this._commitState({ log }) ? item : false;
  }

  recentLog(n = 20) { return this.log.slice(-n); }

  stats() {
    const now = Date.now();
    const week = this.facts.filter((f) => now - f.ts < 7 * DAY).length;
    return {
      facts: this.facts.length,
      pinned: this.facts.filter((f) => f.pinned).length,
      logTurns: this.log.length,
      addedThisWeek: week,
      avgImportance: this.facts.length
        ? +(this.facts.reduce((s, f) => s + (f.importance || 1), 0) / this.facts.length).toFixed(2)
        : 0,
      lastConsolidated: this.meta.lastConsolidated || 0,
    };
  }

  /** Importance decay for facts that were never used and are old. */
  decay({ now = Date.now(), staleDays = 45, floor = 1 } = {}) {
    let changed = 0;
    const facts = this._cloneFacts();
    for (const f of facts) {
      if (f.pinned) continue;
      const ageDays = (now - (f.ts || now)) / DAY;
      if (ageDays > staleDays && (f.used || 0) === 0 && f.importance > floor) {
        f.importance = Math.max(floor, f.importance - 1);
        f.ts = now;
        changed++;
      }
    }
    if (changed && !this._commitState({ facts })) return 0;
    return changed;
  }

  markConsolidated(now = Date.now()) {
    return this._commitState({ meta: { ...this.meta, lastConsolidated: now } });
  }

  exportData() {
    return {
      kind: 'no7-memory', version: 2, exportedAt: new Date().toISOString(),
      facts: this.facts.map((f) => ({ ...f })),
      log: this.log.map((item) => ({ ...item })),
      meta: { ...this.meta },
    };
  }

  /** Build a read-only import preview. Nothing is persisted until applyImportPlan(). */
  planImport(payload, { merge = true } = {}) {
    let snapshot;
    let storageSnapshot;
    try {
      snapshot = JSON.stringify([this.facts, this.log, this.meta]);
      storageSnapshot = localStorage.getItem(KEY);
    } catch { return null; }
    const facts = (merge ? this.facts : []).map((fact) => ({
      ...fact,
      tokens: Array.isArray(fact.tokens) ? [...fact.tokens] : tokenize(fact.text),
    }));
    const log = merge ? [...this.log] : [];
    const result = { added: 0, merged: 0, skipped: 0, logAdded: 0, logSkipped: 0 };
    const now = Date.now();

    for (const raw of Array.isArray(payload?.facts) ? payload.facts : []) {
      const text = String(raw?.text || '').trim();
      if (!text) { result.skipped++; continue; }
      const exact = facts.find((fact) => fact.text === text);
      if (exact) {
        exact.importance = Math.max(exact.importance || 1, raw.importance || 1);
        if (raw.pinned) exact.pinned = true;
        result.merged++;
        continue;
      }
      const tokens = tokenize(text);
      const fuzzy = facts.find((fact) => jaccard(tokens, fact.tokens) >= 0.75);
      if (fuzzy) {
        fuzzy.importance = Math.max(fuzzy.importance || 1, raw.importance || 1);
        if (raw.pinned) fuzzy.pinned = true;
        fuzzy.ts = now;
        result.merged++;
        continue;
      }
      facts.push({
        id: id(), text, tokens,
        importance: Math.min(5, Math.max(1, Number(raw.importance) || 1)),
        ts: now, created: now, pinned: !!raw.pinned, used: 0, source: raw.source || 'import',
      });
      result.added++;
    }

    const identities = new Set();
    for (const item of log) {
      if (!item || !['user', 'assistant'].includes(item.role) || typeof item.text !== 'string') continue;
      const ts = Number(item.ts);
      if (Number.isFinite(ts) && ts > 0) identities.add(JSON.stringify([item.role, Math.trunc(ts), item.text.slice(0, 2000)]));
    }
    for (const raw of Array.isArray(payload?.log) ? payload.log : []) {
      if (!raw || !['user', 'assistant'].includes(raw.role) || typeof raw.text !== 'string' || !raw.text.trim()) {
        result.logSkipped++;
        continue;
      }
      const ts = Number(raw.ts);
      if (!Number.isFinite(ts) || ts <= 0) { result.logSkipped++; continue; }
      const item = { role: raw.role, text: raw.text.slice(0, 2000), ts: Math.trunc(ts) };
      const identity = JSON.stringify([item.role, item.ts, item.text]);
      if (identities.has(identity)) { result.logSkipped++; continue; }
      identities.add(identity);
      log.push(item);
      result.logAdded++;
    }
    log.sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
    const plan = Object.freeze({ result: Object.freeze({ ...result }) });
    this._importPlans.set(plan, { merge, facts, log, result: { ...result }, snapshot, storageSnapshot, applied: false });
    return plan;
  }

  applyImportPlan(plan) {
    const state = plan && typeof plan === 'object' ? this._importPlans.get(plan) : null;
    if (!state || state.applied) return null;
    let currentSnapshot;
    let currentStorageSnapshot;
    try {
      currentSnapshot = JSON.stringify([this.facts, this.log, this.meta]);
      currentStorageSnapshot = localStorage.getItem(KEY);
    } catch { return null; }
    if (currentSnapshot !== state.snapshot || currentStorageSnapshot !== state.storageSnapshot) {
      this._importPlans.delete(plan);
      return null;
    }
    const nextMeta = state.merge ? this.meta : {};
    if (!saveRaw(KEY, { version: 2, facts: state.facts, log: state.log, meta: nextMeta })) {
      const error = new Error('Memory storage write failed; existing data was not changed');
      error.code = 'MEMORY_STORAGE_WRITE_FAILED';
      throw error;
    }
    this.facts = state.facts;
    this.log = state.log;
    this.meta = nextMeta;
    this._buildIndex();
    if (!state.merge) {
      try { localStorage.removeItem(LEGACY_FACTS); localStorage.removeItem(LEGACY_LOG); } catch {}
    }
    state.applied = true;
    return { ...state.result };
  }

  /** importData(payload, {merge}) → {added, merged, skipped}; immediate API for already-confirmed callers. */
  importData(payload, { merge = true } = {}) {
    return this.applyImportPlan(this.planImport(payload, { merge }));
  }

  _persist() {
    return saveRaw(KEY, { version: 2, facts: this.facts, log: this.log, meta: this.meta });
  }

  clearAll() {
    if (!this._commitState({ facts: [], log: [], meta: {} })) return false;
    try { localStorage.removeItem(LEGACY_FACTS); localStorage.removeItem(LEGACY_LOG); } catch {}
    return true;
  }
}
