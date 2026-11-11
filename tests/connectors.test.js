import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
})();

const { parseRss, stripHtml, pageMeta, fetchText } = await import('../web/src/core/net.js');
const { collectBundle, mergeBundle } = await import('../web/src/core/sync.js');
const { MemoryStore } = await import('../web/src/core/memory.js');
const { CalendarStore } = await import('../web/src/core/calendar.js');
const { createPersona, getPersona, customPersonas } = await import('../web/src/core/persona-store.js');

test('parseRss reads RSS items with channel title', () => {
  const xml = `<rss><channel><title>ข่าวไทย</title>
    <item><title>ข่าวที่ 1</title><link>https://a/1</link><description><![CDATA[<b>สรุป</b> หนึ่ง]]></description><pubDate>Mon, 10 Nov 2026 10:00:00 GMT</pubDate></item>
    <item><title>ข่าวที่ 2</title><link>https://a/2</link></item>
  </channel></rss>`;
  const items = parseRss(xml);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'ข่าวที่ 1');
  assert.equal(items[0].link, 'https://a/1');
  assert.equal(items[0].summary, 'สรุป หนึ่ง');
  assert.equal(items[0].channel, 'ข่าวไทย');
});

test('parseRss supports Atom link href', () => {
  const xml = `<feed><title>Atom</title><entry><title>E1</title><link href="https://x/1"/><updated>2026-11-10T09:00:00Z</updated></entry></feed>`;
  const items = parseRss(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].link, 'https://x/1');
  assert.equal(items[0].date, '2026-11-10T09:00:00Z');
});

test('parseRss respects limit and skips items without title', () => {
  const xml = '<rss><item><link>x</link></item><item><title>A</title></item><item><title>B</title></item></rss>';
  const items = parseRss(xml, { limit: 2 });
  assert.equal(items.length, 1);
});

test('stripHtml turns markup into readable text', () => {
  const html = '<div><h1>หัวข้อ</h1><p>ย่อหน้า&nbsp;หนึ่ง</p><script>bad()</script><style>.x{}</style></div>';
  const text = stripHtml(html);
  assert.ok(text.includes('หัวข้อ'));
  assert.match(text, /ย่อหน้า\s?หนึ่ง/);
  assert.ok(!text.includes('bad()'));
});

test('pageMeta extracts title and description', () => {
  const html = '<html><head><title>ชื่อหน้า</title><meta name="description" content="คำอธิบาย"></head><body></body></html>';
  const meta = pageMeta(html);
  assert.equal(meta.title, 'ชื่อหน้า');
  assert.equal(meta.description, 'คำอธิบาย');
});

test('fetchText falls back to the server proxy when direct fetch fails', async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) throw new TypeError('CORS blocked');
    return { ok: true, text: async () => '<rss><item><title>ผ่าน proxy</title></item></rss>' };
  };
  const res = await fetchText('https://blocked.example/feed', { serverUrl: 'http://localhost:8787' });
  assert.equal(res.via, 'proxy');
  assert.ok(res.text.includes('ผ่าน proxy'));
  assert.ok(calls[1].startsWith('http://localhost:8787/api/fetch?url='));
});

test('fetchText rejects non-http urls', async () => {
  await assert.rejects(() => fetchText('file:///etc/passwd'), /ต้องขึ้นต้นด้วย http/);
});

test('collectBundle strips secrets', () => {
  localStorage.clear();
  const mem = new MemoryStore();
  mem.addFact('ผู้ใช้ชื่อต้า', { importance: 3 });
  const bundle = collectBundle({
    memory: mem,
    personas: customPersonas(),
    calendar: [],
    settings: { apiKey: 'SECRET', syncToken: 'TOK', provider: 'pollinations' },
  });
  assert.equal(bundle.settings.apiKey, undefined);
  assert.equal(bundle.settings.syncToken, undefined);
  assert.equal(bundle.settings.provider, 'pollinations');
  assert.equal(bundle.memory.facts.length, 1);
});

test('mergeBundle adds facts, personas and events without duplicating', () => {
  localStorage.clear();
  const memory = new MemoryStore();
  const calendar = new CalendarStore();
  const now = Date.now();
  const bundle = {
    memory: { facts: [{ text: 'ผู้ใช้มีแมวชื่อมีโจ', importance: 2 }] },
    personas: [{ name: 'จากเครื่องอื่น', system: 'คุณคือผู้ช่วยจากอีกเครื่อง', desc: 'x' }],
    calendar: [{ uid: 'e1', title: 'นัดจากมือถือ', start: now + 3600000 }],
    todos: [{ text: 'งานจากมือถือ', ts: now }],
    notes: [],
  };
  const res = mergeBundle(bundle, { memory, createPersona, getPersona, listPersonas: customPersonas, calendar });
  assert.equal(res.facts, 1);
  assert.equal(res.personas, 1);
  assert.equal(res.events, 1);
  assert.ok(memory.search('แมว').length > 0);
  assert.equal(calendar.all().length, 1);
  assert.ok(customPersonas().some((p) => p.name === 'จากเครื่องอื่น'));

  // merge again → nothing added twice
  const res2 = mergeBundle(bundle, { memory, createPersona, getPersona, listPersonas: customPersonas, calendar });
  assert.equal(res2.facts, 0);
  assert.equal(res2.personas, 0);
  assert.equal(res2.events, 0);
});

test('mergeBundle tolerates an empty bundle', () => {
  const memory = new MemoryStore();
  const res = mergeBundle(null, { memory });
  assert.deepEqual(res, { facts: 0, personas: 0, events: 0, tasks: 0, conflicts: [], report: null });
});
