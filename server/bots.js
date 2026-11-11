// Chat bots (Telegram / LINE) — ให้ No7 คุยได้จากแอปแชทที่คนใช้จริง
// ทำงานฝั่ง companion server เท่านั้น: token/secret อยู่ที่ server ไม่เคยไปถึงเบราว์เซอร์
//
// - Telegram: webhook → normalizeTelegramUpdate → handleBotMessage → sendMessage
// - LINE: webhook → verifyLineSignature → normalizeLineEvents → reply
//
// ทุกฟังก์ชันรับ fetchImpl ได้ เพื่อให้เทสต์ได้โดยไม่ต้องต่อเน็ต

export const BOT_MAX_CHARS = 3800;
export const BOT_SESSION_TTL = 2 * 60 * 60 * 1000;

/** ตัดข้อความยาวเป็นหลายข้อความ (แชทจำกัดความยาวต่อข้อความ) */
export function splitForChat(text = '', max = BOT_MAX_CHARS) {
  const clean = String(text || '').trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const out = [];
  let rest = clean;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export const BOT_COMMANDS = {
  '/start': 'เริ่มคุยกับ No7',
  '/help': 'ดูคำสั่งที่ใช้ได้',
  '/clear': 'ล้างประวัติบทสนทนาในแชทนี้',
  '/tools': 'ดูว่า No7 ทำอะไรได้',
};

/** แยกคำสั่ง (รองรับ /cmd@BotName และ arguments) */
export function parseCommand(text = '') {
  const t = String(text || '').trim();
  if (!t.startsWith('/')) return { command: '', args: '' };
  const [raw, ...rest] = t.split(/\s+/);
  const command = raw.split('@')[0].toLowerCase();
  return { command, args: rest.join(' ') };
}

export function normalizeTelegramUpdate(update = {}) {
  const msg = update.message || update.edited_message || update.channel_post;
  if (!msg) return null;
  const text = msg.text || msg.caption || '';
  const chatId = msg.chat?.id;
  if (chatId == null || !text) return null;
  return {
    provider: 'telegram',
    chatId: String(chatId),
    userId: String(msg.from?.id ?? chatId),
    name: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || msg.from?.username || '',
    text: String(text),
    messageId: msg.message_id ?? null,
    isGroup: ['group', 'supergroup'].includes(msg.chat?.type),
  };
}

/** LINE webhook body → ข้อความที่ต้องตอบ (event ละข้อความ) */
export function normalizeLineEvents(body = {}) {
  const events = Array.isArray(body.events) ? body.events : [];
  const out = [];
  for (const ev of events) {
    if (!ev || ev.type !== 'message' || ev.message?.type !== 'text') continue;
    if (!ev.replyToken) continue;
    out.push({
      provider: 'line',
      chatId: String(ev.source?.groupId || ev.source?.roomId || ev.source?.userId || 'unknown'),
      userId: String(ev.source?.userId || ''),
      name: ev.source?.userId ? '' : '',
      text: String(ev.message.text || ''),
      replyToken: ev.replyToken,
      messageId: ev.message.id || null,
      isGroup: ['group', 'room'].includes(ev.source?.type),
    });
  }
  return out;
}

/** ตรวจ X-Line-Signature (HMAC-SHA256 base64 ของ raw body) */
export function verifyLineSignature({ secret = '', rawBody = '', signature = '', cryptoImpl = null } = {}) {
  if (!secret || !signature) return false;
  const impl = cryptoImpl || globalThis.crypto;
  if (!impl?.createHmac) return false;
  const expected = impl.createHmac('sha256', secret).update(String(rawBody)).digest('base64');
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  return impl.timingSafeEqual ? impl.timingSafeEqual(a, b) : a.equals(b);
}

/** ประวัติบทสนทนาต่อแชท (in-memory, TTL + cap) */
export class BotSessions {
  constructor({ ttlMs = BOT_SESSION_TTL, maxChats = 200, maxMessages = 16, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.maxChats = maxChats;
    this.maxMessages = maxMessages;
    this.now = now;
    this.chats = new Map(); // chatId -> { messages, updatedAt }
  }

  _prune() {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, s] of this.chats) if (s.updatedAt < cutoff) this.chats.delete(id);
    while (this.chats.size > this.maxChats) {
      const oldest = [...this.chats.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
      if (!oldest) break;
      this.chats.delete(oldest[0]);
    }
  }

  push(chatId, role, content) {
    this._prune();
    const s = this.chats.get(chatId) || { messages: [], updatedAt: this.now() };
    s.messages.push({ role, content: String(content).slice(0, 4000) });
    if (s.messages.length > this.maxMessages) s.messages = s.messages.slice(-this.maxMessages);
    s.updatedAt = this.now();
    this.chats.set(chatId, s);
    this._prune();
    return this.chats.get(chatId)?.messages || [];
  }

  history(chatId) {
    const s = this.chats.get(chatId);
    if (!s) return [];
    if (s.updatedAt < this.now() - this.ttlMs) { this.chats.delete(chatId); return []; }
    return [...s.messages];
  }

  clear(chatId) { this.chats.delete(chatId); }
  size() { return this.chats.size; }
}

export function botSystemPrompt({ platform = 'telegram' } = {}) {
  return [
    'คุณคือ No7 ผู้ช่วยส่วนตัวภาษาไทยที่คุยผ่านแอปแชท',
    `ช่องทาง: ${platform}`,
    'ตอบสั้น กระชับ เป็นธรรมชาติ 1–4 ประโยค เว้นแต่ผู้ใช้ขอรายละเอียด',
    'ไม่ต้องมี markdown หนัก ๆ (ใช้ข้อความธรรมดาและขีดกลางได้)',
    'ถ้าผู้ใช้ขอให้ทำงานที่ต้องใช้เครื่องมือในแอป (เปิดเว็บ/สั่งอุปกรณ์/ความจำ) ให้บอกว่าต้องทำในแอป No7',
    'ถ้าไม่รู้ให้บอกตรง ๆ และถามกลับเมื่อจำเป็น',
  ].join('\n');
}

/** คำสั่งพื้นฐานที่ไม่ต้องเรียก AI */
export function cannedReply(command, { toolCount = 28 } = {}) {
  switch (command) {
    case '/start':
      return `สวัสดีครับ ผม No7 👋\nพิมพ์คุยได้เลย เช่น "อากาศกรุงเทพวันนี้" หรือ "เตือนฉัน 20 นาที"\nดูคำสั่งทั้งหมด: /help`;
    case '/help':
      return `คำสั่งที่ใช้ได้\n${Object.entries(BOT_COMMANDS).map(([c, d]) => `- ${c} — ${d}`).join('\n')}\n\nนอกจากนี้ก็พิมพ์คุยได้ตามปกติครับ`;
    case '/clear':
      return '🧹 ล้างประวัติแชทนี้แล้ว — เริ่มบทสนทนาใหม่ได้เลย';
    case '/tools':
      return `ในแอป No7 มี ${toolCount} เครื่องมือ (อากาศ, ราคา, ข่าว, ปฏิทิน, เตือน, อุปกรณ์)\n`
        + 'แชทนี้คุยได้ทุกเรื่อง แต่การสั่งงานเครื่อง/อุปกรณ์ต้องทำในแอปครับ';
    default:
      return null;
  }
}

/**
 * ประมวลผลข้อความหนึ่งข้อความ → ข้อความตอบ (แบ่งก้อนตามความยาวแล้ว)
 * @param {{text: string, chatId: string, provider?: string, sessions: BotSessions,
 *          chat: (messages: object[]) => Promise<string>, toolCount?: number}} input
 */
export async function handleBotMessage({
  text, chatId, provider = 'telegram', sessions, chat, toolCount = 28,
} = {}) {
  const { command } = parseCommand(text);
  if (command) {
    if (command === '/clear') sessions?.clear(chatId);
    const canned = cannedReply(command, { toolCount });
    if (canned) return splitForChat(canned);
    return splitForChat(`ไม่รู้จักคำสั่ง ${command} — พิมพ์ /help เพื่อดูคำสั่งที่ใช้ได้`);
  }
  if (typeof chat !== 'function') throw new Error('ต้องมี chat() สำหรับตอบข้อความ');
  const history = sessions?.history(chatId) || [];
  const messages = [
    { role: 'system', content: botSystemPrompt({ platform: provider }) },
    ...history.filter((m) => m.role !== 'system'),
    { role: 'user', content: String(text) },
  ];
  const reply = await chat(messages);
  const answer = String(reply || '').trim() || 'ขอโทษครับ ผมตอบไม่ได้ตอนนี้ ลองอีกครั้งนะ';
  sessions?.push(chatId, 'user', text);
  sessions?.push(chatId, 'assistant', answer);
  return splitForChat(answer);
}

export async function sendTelegramMessage({
  token = '', chatId, text, apiBase = 'https://api.telegram.org', fetchImpl = null,
} = {}) {
  if (!token) throw new Error('ยังไม่ได้ตั้ง TELEGRAM_BOT_TOKEN');
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  const res = await doFetch(`${String(apiBase).replace(/\/$/, '')}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(`telegram ${res.status}: ${data.description || 'sendMessage failed'}`);
  }
  return data.result || null;
}

export async function replyLine({
  token = '', replyToken, text, apiBase = 'https://api.line.me', fetchImpl = null,
} = {}) {
  if (!token) throw new Error('ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN');
  if (!replyToken) throw new Error('ต้องมี replyToken');
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  const res = await doFetch(`${String(apiBase).replace(/\/$/, '')}/v2/bot/message/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`line ${res.status}: ${detail.slice(0, 160)}`);
  }
  return true;
}
