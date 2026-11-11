import { t } from './i18n.js';
import { OfflineQueueFullError } from './retry.js';

const COPY = {
  th: {
    badge: (count) => `📥 ค้างส่ง ${count} ข้อความ`,
    queued: (count) => `📥 บันทึกข้อความลงคิวแล้ว (${count} รายการ) จะส่งเมื่อกลับมาออนไลน์`,
    enqueueFailed: (error) => `⚠️ บันทึกข้อความลงคิวไม่สำเร็จ (${error}) — ข้อความยังอยู่ในช่องพิมพ์`,
    full: '⚠️ คิวเต็ม — ข้อความยังอยู่ในช่องพิมพ์ กรุณาส่งหรือลบข้อความค้างส่งก่อน',
    sent: (sent, left) => `📤 ส่งข้อความที่ค้างไว้ให้แล้ว ${sent} รายการ${left ? ` (เหลือ ${left})` : ''}`,
    beforeSend: (error) => `⚠️ ยังไม่ได้ส่งข้อความใหม่ เพราะบันทึกสถานะคิวไม่สำเร็จ: ${error}`,
    sendFailed: (error) => `⚠️ ส่งข้อความที่ค้างไว้ไม่สำเร็จ — เก็บไว้ในคิวแล้ว: ${error}`,
    afterSend: (error) => `⚠️ ส่งข้อความแล้วแต่ลบออกจากคิวไม่สำเร็จ (${error}) ข้อความนี้อาจถูกส่งซ้ำได้`,
    exhausted: '⚠️ ลองส่งอัตโนมัติครบจำนวนแล้ว — ข้อความยังอยู่ในคิว กด “ลองส่งคิวอีกครั้ง” เมื่อตรวจสอบพร้อมแล้ว',
    offline: 'ยังออฟไลน์อยู่ — ข้อความยังคงอยู่ในคิว',
    removed: 'ลบข้อความออกจากคิวแล้ว',
    cleared: 'ล้างข้อความค้างส่งแล้ว',
    storageError: (error) => `จัดการคิวไม่สำเร็จ — ข้อมูลเดิมยังอยู่: ${error}`,
  },
  en: {
    badge: (count) => `📥 ${count} queued message${count === 1 ? '' : 's'}`,
    queued: (count) => `📥 Message saved to the queue (${count} pending); it will send when online.`,
    enqueueFailed: (error) => `⚠️ Could not save the message (${error}). It is still in the input field.`,
    full: '⚠️ Queue is full. The message remains in the input field; send or remove a queued message first.',
    sent: (sent, left) => `📤 Sent ${sent} queued message${sent === 1 ? '' : 's'}${left ? ` (${left} remaining)` : ''}`,
    beforeSend: (error) => `⚠️ No new message was sent because queue state could not be saved: ${error}`,
    sendFailed: (error) => `⚠️ Could not send a queued message; it remains in the queue: ${error}`,
    afterSend: (error) => `⚠️ The message was sent, but could not be removed from the queue (${error}); it may be sent again.`,
    exhausted: '⚠️ Automatic retries are exhausted. The message remains queued; retry manually when ready.',
    offline: 'Still offline — queued messages are preserved.',
    removed: 'Removed the message from the queue.',
    cleared: 'Cleared queued messages.',
    storageError: (error) => `Queue operation failed; existing messages are preserved: ${error}`,
  },
};

export function describeOutboxEnqueueFailure(error, language = 'th') {
  const messages = COPY[language === 'en' ? 'en' : 'th'];
  return error instanceof OfflineQueueFullError ? messages.full : messages.enqueueFailed(error?.message || String(error));
}

export function createOfflineOutboxUI({
  queue,
  isOnline = () => globalThis.navigator?.onLine !== false,
  isBusy = () => false,
  send = async () => false,
  notify = () => {},
  ask = (message) => globalThis.confirm?.(message) ?? false,
  language = () => 'th',
  maxTries = 3,
} = {}) {
  const panel = document.getElementById('outbox-panel');
  const badge = document.getElementById('outbox-badge');
  const list = document.getElementById('outbox-list');
  const retryButton = document.getElementById('outbox-retry');
  const clearButton = document.getElementById('outbox-clear');
  let flushing = false;
  const copy = () => COPY[language() === 'en' ? 'en' : 'th'];
  const show = (message) => { if (message) notify(message); };

  const render = () => {
    const items = queue.list();
    if (panel) panel.hidden = items.length === 0;
    if (badge) badge.textContent = copy().badge(items.length);
    if (retryButton) retryButton.disabled = !isOnline() || flushing;
    if (list) {
      list.replaceChildren();
      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'outbox-row';
        const text = document.createElement('span');
        text.textContent = item.text;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = t('outbox.remove', { lang: language() });
        remove.addEventListener('click', () => {
          const prompt = language() === 'en' ? 'Remove this queued message?' : 'ลบข้อความนี้ออกจากคิวใช่ไหม?';
          if (!ask(prompt)) return;
          try {
            queue.remove(item.id);
            render();
            show(copy().removed);
          } catch (error) {
            show(copy().storageError(error.message));
          }
        });
        row.append(text, remove);
        list.append(row);
      }
    }
  };

  const flush = async () => {
    if (!queue.size() || !isOnline() || isBusy() || flushing) { render(); return; }
    flushing = true;
    render();
    try {
      const result = await queue.drain(async (item) => {
        if (isBusy()) return false;
        return send(item.text);
      }, { maxTries });
      if (result.sent) show(copy().sent(result.sent, result.left));
      if (result.failureStage === 'before-send') show(copy().beforeSend(result.error?.message || 'storage error'));
      else if (result.failureStage === 'send') show(copy().sendFailed(result.error?.message || 'send failed'));
      else if (result.failureStage === 'after-send') show(copy().afterSend(result.error?.message || 'storage error'));
      else if (result.failureStage === 'exhausted') show(copy().exhausted);
    } catch (error) {
      show(copy().storageError(error.message));
    } finally {
      flushing = false;
      render();
    }
  };

  retryButton?.addEventListener('click', async () => {
    if (!isOnline()) { show(copy().offline); return; }
    try {
      queue.resetTries();
      render();
      await flush();
    } catch (error) {
      show(copy().storageError(error.message));
      render();
    }
  });

  clearButton?.addEventListener('click', () => {
    const prompt = language() === 'en'
      ? 'Permanently clear all queued messages? This cannot be undone.'
      : 'ลบข้อความค้างส่งทั้งหมดอย่างถาวรใช่ไหม? การกระทำนี้ย้อนกลับไม่ได้';
    if (!queue.size() || !ask(prompt)) return;
    try {
      queue.clear();
      render();
      show(copy().cleared);
    } catch (error) {
      show(copy().storageError(error.message));
    }
  });

  return { render, flush };
}
