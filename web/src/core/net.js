// เครือข่ายสำหรับดึงหน้าเว็บ/ฟีด — ลองตรงก่อน ถ้า CORS บล็อกจะผ่าน server proxy

export function serverUrlFromSettings(settings) {
  return String(settings?.serverUrl || 'http://localhost:8787').replace(/\/$/, '');
}

/**
 * ดึงข้อความจาก URL: ตรง → (ถ้าพัง) ผ่าน /api/fetch ของ companion server
 * @returns {Promise<{text: string, via: 'direct'|'proxy'}>}
 */
export async function fetchText(url, { serverUrl = 'http://localhost:8787', timeoutMs = 12000 } = {}) {
  const target = String(url || '').trim();
  if (!/^https?:\/\//i.test(target)) throw new Error('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://');

  const withTimeout = async (u) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(u, { signal: ctrl.signal, headers: { Accept: 'text/html,application/xml,text/xml,*/*' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } finally { clearTimeout(t); }
  };

  try {
    const text = await withTimeout(target);
    return { text, via: 'direct' };
  } catch (directErr) {
    try {
      const text = await withTimeout(`${serverUrlFromSettings({ serverUrl })}/api/fetch?url=${encodeURIComponent(target)}`);
      return { text, via: 'proxy' };
    } catch {
      throw new Error(`ดึงเนื้อหาไม่ได้ (CORS/เครือข่าย) — เปิด npm run server เพื่อใช้ proxy\n${directErr.message}`);
    }
  }
}

/** ตัดแท็ก HTML ให้เหลือข้อความอ่านง่าย */
export function stripHtml(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<\/(p|div|br|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** อ่าน meta title/description อย่างง่าย */
export function pageMeta(html = '') {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() || '';
  const desc = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]?.trim()
    || /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]?.trim() || '';
  return { title: stripHtml(title), description: stripHtml(desc) };
}

/**
 * แยกฟีด RSS/Atom แบบไม่ต้องใช้ DOMParser (ใช้ได้ทั้งเบราว์เซอร์และ node test)
 * @returns {{title: string, link: string, date: string|null, summary: string}[]}
 */
export function parseRss(xml = '', { limit = 8 } = {}) {
  const channelTitle = firstTag(xml, 'title') || '';
  const blocks = [...String(xml).matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  const items = blocks.slice(0, limit).map((b) => {
    const title = textOf(firstTag(b, 'title'));
    let link = textOf(firstTag(b, 'link'));
    if (!link) {
      const m = /<link[^>]+href=["']([^"']+)["']/i.exec(b);
      if (m) link = m[1];
    }
    const date = textOf(firstTag(b, 'pubDate') || firstTag(b, 'updated') || firstTag(b, 'published')) || null;
    const summary = textOf(firstTag(b, 'description') || firstTag(b, 'summary') || firstTag(b, 'content'));
    return { title, link, date, summary: stripHtml(summary).slice(0, 240) };
  }).filter((i) => i.title);

  return items.map((i) => ({ ...i, channel: stripHtml(channelTitle) }));
}

function firstTag(xml, tag) {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml || '');
  if (m) return m[1];
  const self = new RegExp(`<${tag}[^>]*\\/>`, 'i').exec(xml || '');
  return self ? '' : '';
}
function textOf(s) {
  return stripHtml(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim();
}
