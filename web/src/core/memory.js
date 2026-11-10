// Long-term memory — GraphRAG-lite (BM25) + episodic log.
// Ported from ESP32 memory/ (MemoryStore, TextFeatures, EpisodicLog).
// Storage: localStorage (works on mobile + PC browser, no server needed).

const FACTS_KEY = 'no7.memory.facts.v1';
const LOG_KEY = 'no7.memory.log.v1';
const MAX_FACTS = 2000;
const MAX_LOG = 500;

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// --- Thai text features (from ESP32 TextFeatures) ---
// UTF-8 → strip tone marks → bigram (Thai) / word (English) → FNV hash
export function tokenize(text) {
  const clean = String(text || '')
    .toLowerCase()
    .replace(/[่-๋]/g, '') // strip tone marks
    .replace(/[^\u0E00-\u0E7F\w\s]/g, ' ');
  const tokens = [];
  // Thai bigrams
  const thai = clean.match(/[\u0E00-\u0E7F]+/g) || [];
  for (const chunk of thai) {
    for (let i = 0; i < chunk.length - 1; i++) tokens.push(chunk.slice(i, i + 2));
  }
  // English words
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

export class MemoryStore {
  constructor() {
    this.facts = load(FACTS_KEY, []); // [{id, text, tokens, importance, ts}]
    this.log = load(LOG_KEY, []);     // [{role, text, ts}]
    this._buildIndex();
  }

  _buildIndex() {
    this.df = new Map(); // token -> doc freq
    for (const f of this.facts) {
      for (const t of new Set(f.tokens)) this.df.set(t, (this.df.get(t) || 0) + 1);
    }
  }

  addFact(text, importance = 1) {
    const clean = String(text || '').trim();
    if (!clean) return null;
    const tokens = tokenize(clean);
    // merge duplicates (Jaccard >= 0.75)
    for (const f of this.facts) {
      if (jaccard(tokens, f.tokens) >= 0.75) {
        f.importance = Math.max(f.importance, importance);
        f.ts = Date.now();
        this._persist();
        return f;
      }
    }
    const fact = { id: `f${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: clean, tokens, importance, ts: Date.now() };
    this.facts.push(fact);
    if (this.facts.length > MAX_FACTS) this.facts = this.facts.slice(-MAX_FACTS);
    this._buildIndex();
    this._persist();
    return fact;
  }

  removeFact(id) {
    this.facts = this.facts.filter((f) => f.id !== id);
    this._buildIndex();
    this._persist();
  }

  listFacts() { return [...this.facts].sort((a, b) => b.ts - a.ts); }

  // BM25 (k1=1.2, b=0.5) × importance — same params as ESP32
  search(query, limit = 6) {
    const qTokens = tokenize(query);
    if (!qTokens.length || !this.facts.length) return [];
    const N = this.facts.length;
    const avgLen = this.facts.reduce((s, f) => s + f.tokens.length, 0) / N || 1;
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
      score *= f.importance;
      if (score > 0) scored.push({ fact: f, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.fact);
  }

  logTurn(role, text) {
    this.log.push({ role, text: String(text).slice(0, 2000), ts: Date.now() });
    if (this.log.length > MAX_LOG) this.log = this.log.slice(-MAX_LOG);
    this._persist();
  }

  recentLog(n = 20) { return this.log.slice(-n); }

  _persist() {
    save(FACTS_KEY, this.facts);
    save(LOG_KEY, this.log);
  }

  clearAll() {
    this.facts = []; this.log = [];
    this._buildIndex(); this._persist();
  }
}
