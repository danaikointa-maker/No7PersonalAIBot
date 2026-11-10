// Retry / backoff — เรียกซ้ำเฉพาะ error ที่ควรลองใหม่ (network, 429, 5xx)
// และคิวข้อความที่พิมพ์ตอนออฟไลน์ เพื่อไม่ให้คำขอหาย

export const RETRY_DEFAULTS = { retries: 2, baseMs: 350, maxMs: 5000, jitter: 0.25 };

export function sleep(ms, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('aborted')); return; }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, Math.max(0, ms));
    function onAbort() { clearTimeout(timer); reject(new Error('aborted')); }
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

/** แยกชนิด error → ควรลองใหม่ไหม */
export function classifyError(err) {
  const status = Number(err?.status || err?.code || 0) || 0;
  const message = String(err?.message || err || '');
  if (status === 429) return { retryable: true, kind: 'rate-limit', status };
  if (status === 408 || status === 504) return { retryable: true, kind: 'timeout', status };
  if (status >= 500) return { retryable: true, kind: 'server', status };
  if (status === 401 || status === 403) return { retryable: false, kind: 'auth', status };
  if (status >= 400) return { retryable: false, kind: 'client', status };
  if (/abort|timeout|timed out|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|network|fetch failed|Failed to fetch|load failed/i.test(message)) {
    return { retryable: true, kind: 'network', status };
  }
  if (/quota|rate.?limit|too many/i.test(message)) return { retryable: true, kind: 'rate-limit', status };
  return { retryable: false, kind: 'unknown', status };
}

function backoffDelay(attempt, { baseMs, maxMs, jitter }, random) {
  const raw = Math.min(maxMs, baseMs * 2 ** attempt);
  const spread = raw * jitter * (random() * 2 - 1);
  return Math.max(0, Math.round(raw + spread));
}

/**
 * เรียก fn ซ้ำเมื่อ error เป็นแบบชั่วคราว
 * @param {Function} fn
 * @param {{retries?: number, baseMs?: number, maxMs?: number, jitter?: number,
 *          isRetryable?: Function, onRetry?: Function, sleep?: Function, random?: Function, signal?: AbortSignal}} opts
 */
export async function withRetry(fn, opts = {}) {
  const cfg = { ...RETRY_DEFAULTS, ...opts };
  const wait = opts.sleep || sleep;
  const random = opts.random || Math.random;
  const shouldRetry = opts.isRetryable || ((err) => classifyError(err).retryable);
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      const info = classifyError(err);
      if (attempt >= cfg.retries || !shouldRetry(err)) throw err;
      const delay = backoffDelay(attempt, cfg, random);
      opts.onRetry?.({ attempt: attempt + 1, delay, error: err, ...info });
      attempt += 1;
      await wait(delay, { signal: opts.signal });
    }
  }
}

export const QUEUE_KEY = 'no7.outbox.v1';

/** คิวข้อความที่ยังส่งไม่ได้ (ออฟไลน์ / server ล่ม) — เก็บใน localStorage */
export class OfflineQueue {
  constructor({ storage = null, key = QUEUE_KEY, max = 20, ttlMs = 24 * 60 * 60 * 1000, now = () => Date.now() } = {}) {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.key = key;
    this.max = max;
    this.ttlMs = ttlMs;
    this.now = now;
    this.items = this._load();
  }

  _load() {
    try {
      const raw = this.storage?.getItem(this.key);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return [];
      const cutoff = this.now() - this.ttlMs;
      return list.filter((i) => i && typeof i.text === 'string' && (i.at || 0) >= cutoff).slice(-this.max);
    } catch { return []; }
  }

  _save() {
    try {
      if (!this.items.length) this.storage?.removeItem?.(this.key);
      else this.storage?.setItem(this.key, JSON.stringify(this.items));
    } catch { /* quota — ปล่อยผ่าน */ }
  }

  enqueue(text, meta = {}) {
    const item = {
      id: `${this.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      text: String(text || '').slice(0, 4000),
      at: this.now(),
      tries: 0,
      ...meta,
    };
    if (!item.text.trim()) return null;
    this.items.push(item);
    if (this.items.length > this.max) this.items = this.items.slice(-this.max);
    this._save();
    return item;
  }

  list() { return [...this.items]; }
  size() { return this.items.length; }

  remove(id) {
    this.items = this.items.filter((i) => i.id !== id);
    this._save();
  }

  markTried(id) {
    const item = this.items.find((i) => i.id === id);
    if (item) { item.tries += 1; this._save(); }
  }

  clear() {
    this.items = [];
    this._save();
  }

  /**
   * ส่งทุกรายการด้วย handler(item) — สำเร็จ = เอาออกจากคิว, ล้มเหลว = หยุดแล้วรอรอบหน้า
   * @returns {Promise<{sent: number, left: number}>}
   */
  async drain(handler, { maxTries = 3 } = {}) {
    let sent = 0;
    for (const item of this.list()) {
      if (item.tries >= maxTries) { this.remove(item.id); continue; }
      try {
        this.markTried(item.id);
        await handler(item);
        this.remove(item.id);
        sent += 1;
      } catch {
        break;
      }
    }
    return { sent, left: this.size() };
  }
}
