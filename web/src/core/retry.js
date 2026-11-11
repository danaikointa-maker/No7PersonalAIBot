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

export class OfflineQueueStorageError extends Error {
  constructor(message = 'บันทึกข้อความค้างส่งลงในเครื่องไม่สำเร็จ', options = {}) {
    super(message, options);
    this.name = 'OfflineQueueStorageError';
  }
}

export class OfflineQueueFullError extends Error {
  constructor(message = 'คิวออฟไลน์เต็ม — ข้อความเดิมยังอยู่ กรุณาลองส่งหรือลบข้อความค้างส่งก่อน') {
    super(message);
    this.name = 'OfflineQueueFullError';
  }
}

/** คิวข้อความที่ยังส่งไม่ได้ (ออฟไลน์ / server ล่ม) — เก็บใน localStorage */
export class OfflineQueue {
  constructor({ storage = null, key = QUEUE_KEY, max = 20, now = () => Date.now() } = {}) {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.key = key;
    this.max = Math.max(1, Math.floor(Number(max) || 20));
    this.now = now;
    this.items = this._load();
  }

  _load() {
    try {
      const raw = this.storage?.getItem(this.key);
      const list = raw ? JSON.parse(raw) : [];
      // ไม่ตัดรายการตามอายุหรือ max อัตโนมัติ: ข้อความค้างส่งเป็นข้อมูลผู้ใช้
      return Array.isArray(list) ? list.filter((i) => i && typeof i.text === 'string') : [];
    } catch { return []; }
  }

  _save(candidate) {
    try {
      if (this.storage) {
        if (candidate.length) this.storage.setItem(this.key, JSON.stringify(candidate));
        else this.storage.removeItem(this.key);
      }
    } catch (cause) {
      throw new OfflineQueueStorageError('บันทึกคิวออฟไลน์ไม่สำเร็จ — พื้นที่จัดเก็บอาจเต็ม', { cause });
    }
    this.items = candidate;
  }

  enqueue(text, meta = {}) {
    const body = String(text || '').slice(0, 4000);
    if (!body.trim()) return null;
    if (this.items.length >= this.max) throw new OfflineQueueFullError();
    const item = {
      ...meta,
      id: `${this.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      text: body,
      at: this.now(),
      tries: 0,
    };
    this._save([...this.items, item]);
    return { ...item };
  }

  list() { return this.items.map((item) => ({ ...item })); }
  size() { return this.items.length; }

  remove(id) {
    const candidate = this.items.filter((item) => item.id !== id);
    if (candidate.length === this.items.length) return false;
    this._save(candidate);
    return true;
  }

  markTried(id) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) return false;
    const candidate = this.items.map((item, i) => i === index
      ? { ...item, tries: (Number(item.tries) || 0) + 1 }
      : item);
    this._save(candidate);
    return true;
  }

  resetTries() {
    if (!this.items.some((item) => Number(item.tries) > 0)) return false;
    this._save(this.items.map((item) => ({ ...item, tries: 0 })));
    return true;
  }

  clear() {
    if (!this.items.length) return;
    this._save([]);
  }

  /**
   * ส่งตามลำดับ; เมื่อ retry หมดจะคงรายการไว้และรอให้ผู้ใช้สั่งลองใหม่
   * failureStage: before-send | send | after-send | exhausted
   */
  async drain(handler, { maxTries = 3 } = {}) {
    let sent = 0;
    for (const item of this.list()) {
      const current = this.items.find((entry) => entry.id === item.id);
      if (!current) continue;
      if ((Number(current.tries) || 0) >= maxTries) {
        return { sent, left: this.size(), exhausted: true, failureStage: 'exhausted', itemId: item.id };
      }
      try {
        this.markTried(item.id);
      } catch (error) {
        return { sent, left: this.size(), error, failureStage: 'before-send', itemId: item.id };
      }
      const attempted = this.items.find((entry) => entry.id === item.id);
      try {
        const result = await handler({ ...attempted });
        if (result === false) throw new Error('ไม่สามารถส่งข้อความที่ค้างอยู่ได้');
      } catch (error) {
        return { sent, left: this.size(), error, failureStage: 'send', itemId: item.id };
      }
      sent += 1;
      try {
        this.remove(item.id);
      } catch (error) {
        return { sent, left: this.size(), error, failureStage: 'after-send', itemId: item.id };
      }
    }
    return { sent, left: this.size(), exhausted: false, failureStage: null, itemId: null };
  }
}
