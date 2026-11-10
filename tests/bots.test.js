import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  splitForChat, parseCommand, normalizeTelegramUpdate, normalizeLineEvents, verifyLineSignature,
  BotSessions, cannedReply, handleBotMessage, botSystemPrompt, sendTelegramMessage, replyLine,
  BOT_MAX_CHARS,
} from '../server/bots.js';

test('splitForChat keeps short text and splits long text', () => {
  assert.deepEqual(splitForChat('สวัสดี'), ['สวัสดี']);
  assert.deepEqual(splitForChat('   '), []);
  const long = Array.from({ length: 40 }, (_, i) => `บรรทัดที่ ${i} ${'x'.repeat(120)}`).join('\n');
  const parts = splitForChat(long, 500);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= 500, p.length);
  assert.ok(parts.join('\n').length >= long.length - parts.length);
});

test('parseCommand handles @bot suffix and args', () => {
  assert.deepEqual(parseCommand('/start'), { command: '/start', args: '' });
  assert.deepEqual(parseCommand('/Help@No7Bot now'), { command: '/help', args: 'now' });
  assert.deepEqual(parseCommand('สวัสดี'), { command: '', args: '' });
  assert.deepEqual(parseCommand('  '), { command: '', args: '' });
});

test('normalizeTelegramUpdate extracts text/chat/user', () => {
  const msg = normalizeTelegramUpdate({
    update_id: 1,
    message: {
      message_id: 9,
      chat: { id: 555, type: 'private' },
      from: { id: 7, first_name: 'นก', last_name: 'ใจดี' },
      text: 'อากาศเป็นไง',
    },
  });
  assert.equal(msg.chatId, '555');
  assert.equal(msg.userId, '7');
  assert.equal(msg.name, 'นก ใจดี');
  assert.equal(msg.text, 'อากาศเป็นไง');
  assert.equal(msg.isGroup, false);
  assert.equal(normalizeTelegramUpdate({}), null);
  assert.equal(normalizeTelegramUpdate({ message: { chat: { id: 1 } } }), null, 'ต้องมีข้อความ');
  assert.equal(normalizeTelegramUpdate({ message: { chat: { id: 1, type: 'group' }, text: 'hi' } }).isGroup, true);
});

test('normalizeLineEvents keeps only text messages with replyToken', () => {
  const events = normalizeLineEvents({
    events: [
      { type: 'message', replyToken: 'rt1', source: { type: 'user', userId: 'U1' }, message: { type: 'text', id: 'm1', text: 'สวัสดี' } },
      { type: 'message', replyToken: 'rt2', source: { type: 'group', groupId: 'G1', userId: 'U2' }, message: { type: 'image', id: 'm2' } },
      { type: 'follow', replyToken: 'rt3', source: { type: 'user', userId: 'U3' } },
      { type: 'message', replyToken: 'rt4', source: { type: 'group', groupId: 'G9', userId: 'U4' }, message: { type: 'text', id: 'm4', text: 'ในกลุ่ม' } },
    ],
  });
  assert.equal(events.length, 2);
  assert.equal(events[0].chatId, 'U1');
  assert.equal(events[0].replyToken, 'rt1');
  assert.equal(events[1].chatId, 'G9');
  assert.equal(events[1].isGroup, true);
});

test('verifyLineSignature accepts only matching HMAC', () => {
  const secret = 'line-secret';
  const raw = JSON.stringify({ events: [] });
  const signature = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  assert.equal(verifyLineSignature({ secret, rawBody: raw, signature, cryptoImpl: crypto }), true);
  assert.equal(verifyLineSignature({ secret, rawBody: raw, signature: 'nope', cryptoImpl: crypto }), false);
  assert.equal(verifyLineSignature({ secret, rawBody: raw, signature, cryptoImpl: null }), false);
  assert.equal(verifyLineSignature({ secret: '', rawBody: raw, signature, cryptoImpl: crypto }), false);
});

test('BotSessions trims, TTL-expires and clears', () => {
  let now = 1000;
  const s = new BotSessions({ ttlMs: 500, maxMessages: 4, maxChats: 2, now: () => now });
  for (let i = 0; i < 6; i++) s.push('a', 'user', `m${i}`);
  assert.deepEqual(s.history('a').map((m) => m.content), ['m2', 'm3', 'm4', 'm5']);
  s.push('b', 'user', 'b1');
  now += 1000;
  assert.deepEqual(s.history('a'), [], 'หมดอายุตาม TTL');
  assert.deepEqual(s.history('b'), []);
  s.push('c', 'user', 'c1');
  s.push('d', 'user', 'd1');
  s.push('e', 'user', 'e1');
  assert.ok(s.size() <= 2, String(s.size()));
  s.clear('e');
  assert.equal(s.size(), 1);
});

test('canned replies cover commands and unknown', () => {
  assert.match(cannedReply('/start'), /No7/);
  assert.match(cannedReply('/help'), /\/clear/);
  assert.match(cannedReply('/tools', { toolCount: 24 }), /24 เครื่องมือ/);
  assert.equal(cannedReply('/nope'), null);
  assert.match(botSystemPrompt({ platform: 'line' }), /line/);
});

test('handleBotMessage answers commands without calling the model', async () => {
  const s = new BotSessions();
  let called = 0;
  const reply = await handleBotMessage({
    text: '/start', chatId: 'tg:1', sessions: s, chat: async () => { called += 1; return 'x'; },
  });
  assert.equal(called, 0);
  assert.match(reply[0], /สวัสดี/);
  const unknown = await handleBotMessage({ text: '/wat', chatId: 'tg:1', sessions: s, chat: async () => 'x' });
  assert.match(unknown[0], /ไม่รู้จักคำสั่ง/);
});

test('handleBotMessage keeps history, clears it, and chunks long answers', async () => {
  const s = new BotSessions();
  const seen = [];
  const chat = async (messages) => {
    seen.push(messages);
    return 'y'.repeat(5000);
  };
  const parts = await handleBotMessage({ text: 'สวัสดี', chatId: 'line:9', sessions: s, chat });
  assert.ok(parts.length > 1);
  assert.equal(s.history('line:9').length, 2);
  const next = await handleBotMessage({ text: 'ต่อ', chatId: 'line:9', sessions: s, chat });
  assert.ok(parts.length);
  assert.equal(seen[1][0].role, 'system');
  assert.equal(seen[1].at(-1).content, 'ต่อ');
  assert.ok(seen[1].some((m) => m.content === 'สวัสดี'), 'ต้องมีประวัติเดิม');

  const cleared = await handleBotMessage({ text: '/clear', chatId: 'line:9', sessions: s, chat });
  assert.match(cleared[0], /ล้างประวัติ/);
  assert.equal(s.history('line:9').length, 0);
});

test('handleBotMessage falls back when the model returns nothing', async () => {
  const s = new BotSessions();
  const reply = await handleBotMessage({ text: 'hi', chatId: 'tg:2', sessions: s, chat: async () => '  ' });
  assert.match(reply[0], /ขอโทษ/);
});

test('handleBotMessage requires a chat function', async () => {
  await assert.rejects(() => handleBotMessage({ text: 'hi', chatId: 'x', sessions: new BotSessions() }), /chat/);
});

test('sendTelegramMessage posts to the Bot API and surfaces errors', async () => {
  const calls = [];
  const okFetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  };
  const res = await sendTelegramMessage({ token: 'T', chatId: '1', text: 'hi', apiBase: 'https://tg.test', fetchImpl: okFetch });
  assert.equal(res.message_id, 1);
  assert.equal(calls[0].url, 'https://tg.test/botT/sendMessage');
  assert.equal(calls[0].body.chat_id, '1');
  await assert.rejects(() => sendTelegramMessage({ token: '', chatId: '1', text: 'hi' }), /TELEGRAM_BOT_TOKEN/);
  const failFetch = async () => ({ ok: false, status: 400, json: async () => ({ ok: false, description: 'chat not found' }) });
  await assert.rejects(() => sendTelegramMessage({ token: 'T', chatId: '1', text: 'hi', fetchImpl: failFetch }), /chat not found/);
});

test('replyLine posts a text reply and validates inputs', async () => {
  const calls = [];
  const okFetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return { ok: true, status: 200, text: async () => '' };
  };
  await replyLine({ token: 'L', replyToken: 'rt', text: 'hi', apiBase: 'https://line.test', fetchImpl: okFetch });
  assert.equal(calls[0].url, 'https://line.test/v2/bot/message/reply');
  assert.equal(calls[0].headers.authorization, 'Bearer L');
  assert.deepEqual(calls[0].body, { replyToken: 'rt', messages: [{ type: 'text', text: 'hi' }] });
  await assert.rejects(() => replyLine({ token: '', replyToken: 'rt', text: 'hi' }), /LINE_CHANNEL_ACCESS_TOKEN/);
  await assert.rejects(() => replyLine({ token: 'L', text: 'hi' }), /replyToken/);
});

test('BOT_MAX_CHARS default is safe for both providers', () => {
  assert.ok(BOT_MAX_CHARS <= 4000);
});
