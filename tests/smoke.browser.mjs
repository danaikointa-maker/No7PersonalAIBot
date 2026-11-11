// Optional browser smoke test — runs the REAL app bundle in jsdom and walks
// through boot → nav → settings → memory → chat → tool call → mic → pairing.
// Needs dev-only packages: npm i -D jsdom esbuild
// Run: node tests/smoke.browser.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

let JSDOM;
let esbuild;
try {
  ({ JSDOM } = await import('jsdom'));
  esbuild = await import('esbuild');
} catch {
  console.log('⏭  skipped: ติดตั้ง dependency ก่อน → npm i -D jsdom esbuild');
  process.exit(0);
}

// 1) bundle the app the same way vite would (CSS dropped, no DOM deps)
const outfile = path.join(os.tmpdir(), `no7-smoke-${process.pid}.js`);
await esbuild.build({
  entryPoints: [path.join(ROOT, 'web/src/main.js')],
  bundle: true,
  format: 'iife',
  loader: { '.css': 'empty' },
  outfile,
  logLevel: 'silent',
});

// 2) jsdom + minimal browser stubs
const html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8')
  .replace('<script type="module" src="/src/main.js"></script>', '');

const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously' });
const { window } = dom;
window.HTMLElement.prototype.scrollIntoView = () => {};

const ctxStub = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'canvas') return { width: 360, height: 140 };
    return () => {};
  },
  set: () => true,
});
window.HTMLCanvasElement.prototype.getContext = () => ctxStub;
window.URL.createObjectURL = () => 'blob:stub';
window.open = () => ({ closed: false });
window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
Object.defineProperty(window, 'speechSynthesis', {
  value: {
    speak(u) { spoken.push(u.text); setTimeout(() => u.onend?.(), 0); },
    cancel() {},
    getVoices: () => [{ name: 'TestThai', lang: 'th-TH' }],
  },
});
const spoken = [];
window.SpeechRecognition = class {
  start() {
    this.onstart?.();
    setTimeout(() => {
      this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'ทดสอบเสียง' }], { isFinal: true })] });
      this.onend?.();
    }, 5);
  }
  stop() {}
};

// jsdom ไม่มี WebCrypto — stub ให้ HMAC ของ Phone-Link ทำงานได้ (ค่าคงที่พอสำหรับ UI test)
if (!window.crypto?.subtle) {
  const subtle = {
    importKey: async () => ({}),
    sign: async () => new Uint8Array(32).fill(7),
  };
  try { Object.defineProperty(window.crypto, 'subtle', { value: subtle, configurable: true }); } catch { window.crypto.subtle = subtle; }
}

const calls = [];
window.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), body: opts.body });
  const u = String(url);
  if (u.includes('text.pollinations.ai')) {
    const msgs = JSON.parse(opts.body).messages;
    const last = msgs[msgs.length - 1].content;
    const history = msgs.map((m) => String(m.content)).join('\n');
    const reply = (content) => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
    // multi-tool: คำขอ "สองอย่าง" → gold แล้วต่อด้วย calc ในลูปเดียว (ดูกำลังจากประวัติ ไม่ใช้สถานะภายนอก)
    if (history.includes('สองอย่าง') && last.includes('ผลลัพธ์จากเครื่องมือ gold') && !history.includes('ผลลัพธ์จากเครื่องมือ calc')) {
      return reply('```tool\n{"tool":"calc","args":{"expression":"2412*2"}}\n```');
    }
    if (last.includes('ผลลัพธ์จากเครื่องมือ')) return reply('ราคาทองตอนนี้ 2,412 ดอลลาร์ต่อออนซ์ครับ');
    if (last.includes('พิมพ์คำว่า OK')) return reply('OK');
    if (last.includes('สองอย่าง')) return reply('```tool\n{"tool":"gold","args":{}}\n```');
    if (last.includes('ราคาทอง')) return reply('```tool\n{"tool":"gold","args":{}}\n```');
    if (last.includes('เปิดเว็บ')) return reply('```tool\n{"tool":"open_url","args":{"url":"https://example.com"}}\n```');
    return reply('สวัสดีครับ ผมชื่อ No7');
  }
  const linkReply = (obj) => ({ ok: true, json: async () => obj, text: async () => JSON.stringify(obj) });
  if (u.includes('/api/local-models/warm')) {
    return linkReply({ ok: true, ms: 1200, model: 'llama3.1', kind: 'ollama', baseUrl: 'http://localhost:11434' });
  }
  if (u.includes('/api/local-models')) {
    const model = { id: 'llama3.1:latest', name: 'llama3.1', sizeBytes: 4_000_000_000, family: 'llama', kind: 'ollama', baseUrl: 'http://localhost:11434' };
    const target = { kind: 'ollama', label: 'Ollama', baseUrl: 'http://localhost:11434', ok: true, latencyMs: 12, models: [model], error: '' };
    return linkReply({ ok: true, models: [model], results: [target], best: target });
  }
  if (u.includes('/api/oauth/device')) {
    return { ok: true, json: async () => ({ status: 200, body: JSON.stringify({ device_code: 'dc-1', user_code: 'ABCD-EFGH', verification_uri: 'https://id.example.com/device', expires_in: 600, interval: 1 }) }) };
  }
  if (u.includes('/api/oauth/token')) {
    return { ok: true, json: async () => ({ status: 400, body: JSON.stringify({ error: 'authorization_pending' }) }) };
  }
  if (u.includes('/api/oauth/register')) {
    return { ok: true, json: async () => ({ status: 201, body: JSON.stringify({ client_id: 'dcr-1', client_secret: 's', token_endpoint_auth_method: 'none' }) }) };
  }
  if (u.includes('/api/link/hello')) {
    return linkReply({
      ok: true, protocol: 'no7-link/1', serverTime: 1_760_000_000_000,
      device: { code: '123456', name: 'PC ทดสอบ', capabilities: { mic: true, speaker: true, eyes: true, screen: true, buttons: true, voice: false } },
      features: ['hello', 'eyes', 'voice', 'command', 'results'], eyesTtlMs: 15000,
    });
  }
  if (u.includes('/api/link/eyes')) {
    return linkReply({ ok: true, eyes: { emotion: 'happy', mood: 'happy', intensity: 85, text: 'จาก No7', ttlMs: 15000, ts: 1_760_000_000_000, stale: false, ageMs: 1200 } });
  }
  if (u.includes('/api/link/voice/status')) {
    return linkReply({ ok: true, chunks: 2, bytes: 2048, lastSeq: 2, dropped: 0, final: true });
  }
  if (u.includes('/api/reminders/status')) {
    return { ok: true, json: async () => ({ count: 1, due: 0, next: { id: 't1', title: 'ทดสอบงาน', due: '2026-12-01T02:00:00.000Z' }, telegram: { configured: true }, tickMs: 30000 }) };
  }
  if (u.includes('/api/reminders')) return { ok: true, json: async () => ({ ok: true, count: 1, items: [] }) };
  if (u.includes('/api/bots/status')) {
    return { ok: true, json: async () => ({ provider: 'pollinations', model: null, telegram: { configured: true }, line: { configured: false }, sessions: 2, recent: [] }) };
  }
  if (u.includes('/api/mcp/stdio')) {
    return { ok: true, json: async () => ({ servers: [{ id: 'fixture', command: 'node', args: ['fixture.mjs'], running: false }] }) };
  }
  if (u.includes('/api/mcp')) {
    const payload = JSON.parse(opts.body || '{}').payload || {};
    const ok = (result) => ({ ok: true, json: async () => ({ status: 200, headers: {}, body: JSON.stringify({ jsonrpc: '2.0', id: payload.id, result }) }) });
    if (payload.method === 'initialize') return ok({ protocolVersion: '2024-11-05', serverInfo: { name: 'Demo' } });
    if (payload.method === 'tools/list') {
      return ok({ tools: [{ name: 'send_email', description: 'ส่งอีเมลผ่าน MCP', inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' } } } }] });
    }
    if (payload.method === 'tools/call') return ok({ content: [{ type: 'text', text: 'ส่งอีเมลแล้ว' }] });
    return { ok: true, json: async () => ({ status: 202, headers: {}, body: '' }) };
  }
  if (u.includes('gold-api')) return { ok: true, json: async () => ({ price: 2412.5, updatedAt: new Date().toISOString() }) };
  return { ok: true, json: async () => ({}) };
};

const script = window.document.createElement('script');
script.textContent = fs.readFileSync(outfile, 'utf8');
window.document.body.appendChild(script);
fs.rmSync(outfile, { force: true });

// 3) assertions
const $ = (s) => window.document.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, cond, extra = '') => results.push({ name, ok: !!cond, extra });
const submit = (text) => {
  $('#input').value = text;
  $('#composer').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
};

await wait(100);
check('boot: initial state', ['IDLE', 'SETUP'].includes($('#state-label').textContent), $('#state-label').textContent);
check('boot: welcome message', $('#messages').children.length >= 1);
check('boot: 30 tools in auto mode (28 + digest + weekly)', $('#tools-grid').children.length === 30, String($('#tools-grid').children.length));
check('boot: 5 role modes', $('#mode-chips').children.length === 5, String($('#mode-chips').children.length));
check('boot: persona header', $('#persona-name').textContent.length > 0);

$('#nav button[data-view="memory"]').click();
check('nav: memory view', $('#view-memory').classList.contains('active'));

// mode switching filters tools
window.document.querySelector('#mode-chips button[data-mode="hub"]').click();
await wait(20);
check('mode: hub filters tools', $('#tools-grid').children.length === 23, String($('#tools-grid').children.length));
window.document.querySelector('#mode-chips button[data-mode="auto"]').click();
await wait(20);
check('mode: back to auto', $('#tools-grid').children.length === 30, String($('#tools-grid').children.length));

$('#set-provider').value = 'pollinations';
$('#save-settings-btn').click();
check('settings: saved', $('#settings-status').textContent.includes('บันทึกแล้ว'));

$('#test-ai-btn').click();
await wait(80);
check('settings: test AI', $('#settings-status').textContent.includes('OK'), $('#settings-status').textContent);

$('#mem-new').value = 'ฉันชอบกาแฟดำ';
$('#mem-add-btn').click();
await wait(20);
check('memory: fact added', $('#mem-results').textContent.includes('กาแฟดำ'), $('#mem-results').textContent.slice(0, 60));
$('#mem-query').value = 'กาแฟ';
$('#mem-search-btn').click();
check('memory: BM25 search', $('#mem-results').textContent.includes('กาแฟ'));
check('memory: stats rendered', $('#mem-stats').textContent.includes('ข้อเท็จจริง'), $('#mem-stats').textContent.slice(0, 40));

submit('สวัสดี No7');
await wait(120);
check('chat: bot replied', [...$('#messages').querySelectorAll('.msg.bot')].some((m) => m.textContent.includes('No7')));
check('chat: TTS spoke', spoken.length > 0, spoken.join(' | '));

submit('ราคาทองวันนี้');
await wait(220);
const lastBot = [...$('#messages').querySelectorAll('.msg.bot')].at(-1);
check('tool: card rendered', !!lastBot?.querySelector('.card'));
check('progressive: card lands in .msg-cards', !!lastBot?.querySelector('.msg-cards .card'));
check('progressive: answer stays in .msg-text', lastBot?.querySelector('.msg-text')?.textContent.includes('2,412'), lastBot?.querySelector('.msg-text')?.textContent?.slice(0, 40));
check('progressive: card count recorded', lastBot?.querySelector('.msg-cards')?.dataset.count === '1', lastBot?.querySelector('.msg-cards')?.dataset.count);
check('tool: provider API called', calls.some((c) => c.url.includes('gold-api')));
check('tool: spoken summary', lastBot?.textContent.includes('2,412'), lastBot?.textContent.slice(0, 60));
check('timeline: visible after a tool run', !$('#run-timeline').hidden, $('#run-timeline').hidden ? 'hidden' : 'shown');
check('timeline: lists thinking + tool steps', $('#run-timeline').querySelectorAll('.tl-row').length >= 2, String($('#run-timeline').querySelectorAll('.tl-row').length));
check('timeline: headline says finished', /เสร็จใน|Done in/.test($('#run-timeline').textContent), $('#run-timeline').textContent.slice(0, 70));

// multi-tool in a single request → two cards in the same bubble, rendered as they arrive
submit('ทำสองอย่างให้หน่อย');
await wait(300);
const multiBot = [...$('#messages').querySelectorAll('.msg.bot')].at(-1);
check('progressive: two cards in one answer', multiBot?.querySelectorAll('.msg-cards .card').length === 2, `cards=${multiBot?.querySelectorAll('.msg-cards .card').length} txt=${multiBot?.textContent?.slice(0, 80)} calls=${calls.filter((c) => c.url.includes('gold-api')).length}`);
check('progressive: count attribute matches', multiBot?.querySelector('.msg-cards')?.dataset.count === '2', multiBot?.querySelector('.msg-cards')?.dataset.count);
check('progressive: cards survive final text', multiBot?.querySelectorAll('.msg-cards .card').length === 2 && !!multiBot?.querySelector('.msg-text')?.textContent);

$('#mic-btn').click();
await wait(80);
check('voice: transcript sent', [...$('#messages').querySelectorAll('.msg.user')].some((m) => m.textContent.includes('ทดสอบเสียง')));

await wait(400);          // รอให้คิวก่อนหน้าจบ (busy guard)
submit('จำไว้ว่า ฉันมีแมวชื่อมีโจ');
await wait(300);
$('#nav button[data-view="memory"]').click();
check('memory: learned from chat', $('#mem-results').textContent.includes('มีโจ'), $('#mem-results').textContent.slice(0, 80));

// calendar view
$('#nav button[data-view="calendar"]').click();
$('#cal-title').value = 'ประชุมทดสอบ';
$('#cal-when').value = '2026-12-01T10:00';
$('#cal-add-btn').click();
await wait(20);
check('calendar: event added', $('#cal-list').textContent.includes('ประชุมทดสอบ'), $('#cal-list').textContent.slice(0, 60));
check('calendar: persisted', JSON.parse(window.localStorage.getItem('no7.calendar.v1') || '[]').length > 0);

// tasks: add, list, complete
$('#task-title').value = 'ทดสอบงาน';
$('#task-when').value = '2026-12-01T09:00';
$('#task-priority').value = '2';
$('#task-add').click();
await wait(30);
check('tasks: task added', $('#task-list').textContent.includes('ทดสอบงาน'), $('#task-list').textContent.slice(0, 60));
check('tasks: stats updated', $('#task-stats').textContent.includes('ค้าง 1'), $('#task-stats').textContent);
check('tasks: persisted', JSON.parse(window.localStorage.getItem('no7.tasks.v1') || '[]').some((t) => t.title === 'ทดสอบงาน'));
$('#task-list').querySelectorAll('.fact button')[0]?.click();  // ✅ ปิดงาน
await wait(20);
$('#task-filter').value = 'done';
$('#task-filter').dispatchEvent(new window.Event('change'));
check('tasks: server reminder status shown', $('#task-server-status').textContent.includes('server:'), $('#task-server-status').textContent);
check('tasks: completed task shown in done filter', $('#task-list').textContent.includes('ทดสอบงาน'), $('#task-list').textContent.slice(0, 60));
$('#task-filter').value = 'open';
$('#task-filter').dispatchEvent(new window.Event('change'));

// E2E journey: recurring task advances instead of closing
$('#nav button[data-view="calendar"]').click();
$('#task-title').value = 'งานซ้ำทดสอบ';
$('#task-when').value = '2026-12-02T08:00';
$('#task-repeat').value = 'daily';
$('#task-add').click();
await wait(30);
check('journey: recurring task shown with 🔁', $('#task-list').textContent.includes('งานซ้ำทดสอบ') && $('#task-list').textContent.includes('🔁'), $('#task-list').textContent.slice(0, 80));
const recurringRow = [...$('#task-list').querySelectorAll('.fact')].find((r) => r.textContent.includes('งานซ้ำทดสอบ'));
recurringRow?.querySelectorAll('button')[0]?.click();
await wait(30);
check('journey: completing recurring task advances it', /เลื่อนไปรอบถัดไป/.test($('#task-status').textContent), $('#task-status').textContent.slice(0, 60));
const stillOpen = [...$('#task-list').querySelectorAll('.fact')].some((r) => r.textContent.includes('งานซ้ำทดสอบ'));
check('journey: recurring task stays open', stillOpen, $('#task-list').textContent.slice(0, 60));
$('#task-repeat').value = '';

// backup / restore (schema 2)
window.confirm = () => true;
$('#nav button[data-view="settings"]').click();
$('#export-btn').click();
check('backup: export reports a schema-2 file', $('#backup-status').textContent.includes('schema 2'), $('#backup-status').textContent.slice(0, 80));
check('backup: export summary includes health history count', $('#backup-status').textContent.includes('ประวัติสุขภาพ'));
const backupPayload = {
  app: 'no7-personal-ai', schema: 2, version: '2.2.0', createdAt: new Date().toISOString(), includeSecrets: false,
  data: {
    settings: { language: 'th', uiLang: 'th' },
    facts: [{ id: 'imp-1', text: 'ความจำจากการนำเข้า', ts: Date.now(), importance: 2 }],
    log: [], notes: [{ text: 'โน้ตจากไฟล์สำรอง', ts: Date.now() }], todos: [], tasks: [], events: [],
    healthHistory: [{ date: new Date().toISOString().slice(0, 10), score: 41, grade: 'D', issues: { high: 1, medium: 2, low: 3 }, privateText: 'must stay private' }],
    personas: [{ id: 'p-smoketest1', name: 'จากไฟล์สำรอง', system: 'ตัวตนที่นำเข้ามา', desc: 'persona custom', gender: 'neutral', createdAt: Date.now(), updatedAt: Date.now(), extra: 'strip' }],
  },
};
const backupFile = new window.File([JSON.stringify(backupPayload)], 'no7-backup.json', { type: 'application/json' });
Object.defineProperty($('#import-file'), 'files', { value: [backupFile], configurable: true });
$('#import-file').dispatchEvent(new window.Event('change'));
await wait(120);
check('backup: import succeeded', $('#backup-status').textContent.includes('นำเข้าแล้ว'), $('#backup-status').textContent.slice(0, 80));
const restoredBackupHealth = JSON.parse(window.localStorage.getItem('no7.health.history.v1') || '{}').snapshots || [];
check('backup: health summary restored without private fields', restoredBackupHealth.length === 1 && restoredBackupHealth[0].score === 41 && !JSON.stringify(restoredBackupHealth).includes('must stay private'));
const restoredCustomPersonas = JSON.parse(window.localStorage.getItem('no7.personas.v1') || '[]');
check('backup: custom persona restored and unknown fields stripped', restoredCustomPersonas.some((p) => p.id === 'p-smoketest1' && p.name === 'จากไฟล์สำรอง') && !JSON.stringify(restoredCustomPersonas).includes('strip'));
$('#nav button[data-view="memory"]').click();
$('#mem-query').value = 'นำเข้า';
$('#mem-search-btn').click();
check('backup: imported fact searchable', $('#mem-results').textContent.includes('ความจำจากการนำเข้า'), $('#mem-results').textContent.slice(0, 60));
check('backup: imported note stored', JSON.parse(window.localStorage.getItem('no7.notes.v1') || '[]').some((n) => n.text.includes('โน้ตจากไฟล์สำรอง')));
const badFile = new window.File(['{not json'], 'bad.json', { type: 'application/json' });
Object.defineProperty($('#import-file'), 'files', { value: [badFile], configurable: true });
$('#import-file').dispatchEvent(new window.Event('change'));
await wait(80);
check('backup: broken file rejected', $('#backup-status').textContent.includes('❌'), $('#backup-status').textContent.slice(0, 60));

// command palette (Ctrl/⌘ K)
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
await wait(30);
check('palette: opens with Ctrl+K', !$('#palette').hidden, $('#palette').hidden ? 'hidden' : 'shown');
const pInput = $('#palette-input');
pInput.value = 'กาแฟ';
pInput.dispatchEvent(new window.Event('input'));
await wait(20);
check('palette: finds memory fact', $('#palette-results').textContent.includes('กาแฟดำ'), $('#palette-results').textContent.slice(0, 60));
check('palette: highlights match', !!$('#palette-results mark'), $('#palette-results').innerHTML.slice(0, 80));
$('#palette-results .palette-row').click();
await wait(30);
check('palette: closes after choosing', $('#palette').hidden);
check('palette: navigated to memory with query', $('#view-memory').classList.contains('active') && $('#mem-query').value.includes('กาแฟ'), $('#mem-query').value);
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
await wait(20);
$('#palette-input').value = 'สรุปวันนี้';
$('#palette-input').dispatchEvent(new window.Event('input'));
await wait(20);
check('palette: finds the digest action', $('#palette-results').textContent.includes('สรุปวันนี้'), $('#palette-results').textContent.slice(0, 60));
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await wait(20);
check('palette: Esc closes', $('#palette').hidden);

// weekly review
$('#weekly-btn').click();
await wait(30);
check('weekly: card rendered', !$('#weekly-card').hidden, $('#weekly-card').hidden ? 'hidden' : 'shown');
check('weekly: shows the range', /\d/.test($('#weekly-card').textContent), $('#weekly-card').textContent.slice(0, 70));
check('weekly: focus section present', $('#weekly-card').textContent.includes('โฟกัสสัปดาห์หน้า'), $('#weekly-card').textContent.slice(0, 80));
check('weekly: posted to chat', [...$('#messages').querySelectorAll('.msg.bot.digest')].length >= 1);
check('weekly: export buttons present', $('#weekly-card').querySelectorAll('[data-export]').length === 2, String($('#weekly-card').querySelectorAll('[data-export]').length));
$('#weekly-card').querySelector('[data-export="weekly-csv"]').click();
await wait(10);
check('weekly: CSV export does not break the app', !$('#weekly-card').hidden);

// HTTP tool plugins
$('#nav button[data-view="tools"]').click();
$('#plugin-example').click();
await wait(10);
$('#plugin-validate').click();
check('plugins: example validates', $('#plugin-status').textContent.includes('ผ่านทั้งหมด 2'), $('#plugin-status').textContent);
$('#plugin-save').click();
await wait(20);
check('plugins: saved to settings', (JSON.parse(window.localStorage.getItem('no7.settings.v1') || '{}').customPlugins || []).length === 2);
check('plugins: listed in panel', $('#plugin-list').textContent.includes('เกร็ดแมว'), $('#plugin-list').textContent.slice(0, 60));
check('plugins: tools grid grows', $('#tools-grid').children.length === 32, String($('#tools-grid').children.length));
$('#plugin-json').value = '[{"id":"bad","label":"ไม่ดี","url":"http://insecure.example.com/x"}]';
$('#plugin-save').click();
check('plugins: http url rejected', $('#plugin-status').textContent.includes('❌'), $('#plugin-status').textContent.slice(0, 60));
$('#plugin-json').value = '[]';
$('#plugin-save').click();
await wait(10);
check('plugins: cleared back to 30 tools', $('#tools-grid').children.length === 30, String($('#tools-grid').children.length));

// daily digest
$('#digest-btn').click();
await wait(30);
check('digest: card rendered', !$('#digest-card').hidden, $('#digest-card').hidden ? 'hidden' : 'shown');
check('digest: includes today\'s task', $('#digest-card').textContent.includes('ทดสอบงาน') || $('#digest-card').textContent.includes('งานซ้ำทดสอบ'), `${JSON.parse(window.localStorage.getItem('no7.tasks.v1') || '[]').length} tasks / ${$('#digest-card').textContent.slice(0, 120)}`);
check('digest: posted to chat', [...$('#messages').querySelectorAll('.msg.bot.digest')].length >= 2, String([...$('#messages').querySelectorAll('.msg.bot.digest')].length));
check('digest: remembers the day', !!window.localStorage.getItem('no7.digest.last'));
check('digest: export buttons present', $('#digest-card').querySelectorAll('[data-export]').length === 2, String($('#digest-card').querySelectorAll('[data-export]').length));
$('#digest-card').querySelector('[data-export="digest-md"]').click();
await wait(10);
check('digest: Markdown export does not break the app', !$('#digest-card').hidden);
$('#set-digest-auto').checked = true;
$('#set-digest-auto').dispatchEvent(new window.Event('change'));
check('digest: auto toggle persists', JSON.parse(window.localStorage.getItem('no7.settings.v1') || '{}').digestAuto === true);

// data health: report and explicitly confirmed cleanup of only empty entries
window.localStorage.setItem('no7.notes.v1', JSON.stringify([{ text: '' }, { text: 'keep note' }]));
window.localStorage.setItem('no7.todos.v1', JSON.stringify([{ text: '   ' }, { text: 'keep todo' }]));
check('health: scan button is available', !!$('#health-btn'));
$('#health-btn').click();
await wait(20);
check('health: report card rendered with cleanup preview', !$('#health-card').hidden && $('#health-card').textContent.includes('รายการที่ล้างได้อย่างปลอดภัย'), $('#health-card').textContent.slice(0, 100));
const healthHistory = JSON.parse(window.localStorage.getItem('no7.health.history.v1') || '{}');
check('health history: stores only one score summary', healthHistory.snapshots?.length === 1 && Object.keys(healthHistory.snapshots[0]).sort().join(',') === 'date,grade,issues,score');
check('health history: chart is accessible', !!$('#health-card svg[role="img"][aria-label]'));
check('health history: 7/30-day filters are available', $('#health-card').querySelectorAll('[data-health-range]').length === 2);
const healthHistoryBeforeFilter = window.localStorage.getItem('no7.health.history.v1');
$('#health-card').querySelector('[data-health-range="7"]').click();
check('health history: range switch updates active filter', $('#health-card').querySelector('[data-health-range="7"]').getAttribute('aria-pressed') === 'true');
check('health history: range switch does not write data', window.localStorage.getItem('no7.health.history.v1') === healthHistoryBeforeFilter);
$('#health-card').querySelector('[data-health-range="30"]').click();
check('health history: CSV/Markdown/JSON export buttons are available', $('#health-card').querySelectorAll('[data-health-export]').length === 3);
$('#health-card').querySelector('[data-health-export="json"]').click();
await wait(10);
check('health history: export click keeps the card active', !$('#health-card').hidden);
const healthHistoryBeforeImport = JSON.parse(window.localStorage.getItem('no7.health.history.v1'));
const importedDay = new Date(Date.parse(`${healthHistoryBeforeImport.snapshots[0].date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
const historyBackupFile = new window.File([JSON.stringify({
  format: 'no7-health-history', schema: 1, exportedAt: new Date().toISOString(),
  snapshots: [
    { ...healthHistoryBeforeImport.snapshots[0], score: 88, grade: 'B', privateText: 'must not import' },
    { date: importedDay, score: 76, grade: 'B', issues: { high: 0, medium: 0, low: 1 }, title: 'private' },
  ],
})], 'health-history.json', { type: 'application/json' });
Object.defineProperty($('#health-history-import'), 'files', { value: [historyBackupFile], configurable: true });
$('#health-history-import').dispatchEvent(new window.Event('change'));
await wait(50);
const healthHistoryAfterImport = JSON.parse(window.localStorage.getItem('no7.health.history.v1'));
check('health history: JSON import merges conflict by date', healthHistoryAfterImport.snapshots.length === 2 && healthHistoryAfterImport.snapshots.find((s) => s.date === healthHistoryBeforeImport.snapshots[0].date)?.score === 88);
check('health history: JSON import strips extra personal fields', !JSON.stringify(healthHistoryAfterImport).includes('must not import') && !JSON.stringify(healthHistoryAfterImport).includes('private'));
check('health: report posted to chat', $('#messages').textContent.includes('สุขภาพข้อมูล'));
window.confirm = () => true;
$('#health-clean-btn').click();
await wait(20);
check('health: cleanup removes only flagged empty entries', JSON.parse(window.localStorage.getItem('no7.notes.v1')).length === 1 && JSON.parse(window.localStorage.getItem('no7.todos.v1')).length === 1);
check('health: cleanup refreshes report', !$('#health-card').hidden && !$('#health-card').textContent.includes('รายการที่ล้างได้อย่างปลอดภัย'));
check('health: undo is available after cleanup', !!$('#health-undo-btn'));
$('#health-undo-btn').click();
await wait(20);
check('health: undo restores deleted entries', JSON.parse(window.localStorage.getItem('no7.notes.v1')).length === 2 && JSON.parse(window.localStorage.getItem('no7.todos.v1')).length === 2);
check('health: undo refreshes cleanup preview', $('#health-card').textContent.includes('รายการที่ล้างได้อย่างปลอดภัย'));
$('#health-history-clear').click();
await wait(10);
check('health history: clear button removes only score history', window.localStorage.getItem('no7.health.history.v1') === null && $('#health-card').textContent.includes('สแกนสุขภาพข้อมูลเพื่อเริ่มบันทึกแนวโน้ม'));
$('#nav button[data-view="settings"]').click();

// memory 2.0: pin + consolidate run
$('#nav button[data-view="memory"]').click();
await wait(20);
$('#mem-results').querySelector('.fact button')?.click();      // ปุ่ม 📍 ตัวแรก
await wait(20);
check('memory: pin toggles', $('#mem-results').textContent.includes('📌'), $('#mem-results').textContent.slice(0, 40));
$('#mem-consolidate-btn').click();
await wait(200);
check('memory: consolidate runs', $('#mem-status').textContent.includes('สรุปเสร็จ'), $('#mem-status').textContent);

$('#nav button[data-view="settings"]').click();
$('#pair-btn').click();
await wait(50);
check('pairing: handled (code or clear warning)', /รหัสจับคู่|ต้องเปิดผ่าน https|สร้างไม่สำเร็จ/.test($('#pair-output').textContent), $('#pair-output').textContent.slice(0, 60));

// devices view (no server running → must fail gracefully)
$('#nav button[data-view="devices"]').click();
$('#dev-name').value = 'PC ทดสอบ';
$('#dev-url').value = 'http://127.0.0.1:9';
$('#dev-code').value = '123456';
$('#dev-secret').value = 'a'.repeat(64);
$('#dev-add').click();
await wait(20);
check('devices: added to registry', $('#dev-list').textContent.includes('PC ทดสอบ'), $('#dev-list').textContent.slice(0, 60));
$('#dev-list').querySelector('.dev-actions button')?.click();
await wait(150);
check('devices: failure logged, no crash', $('#dev-log').hidden === false, $('#dev-log').textContent.slice(0, 80));

// phone-link ครบวงจร: hello / eyes / voice status
$('#link-hello').click();
await wait(60);
check('phone-link: hello shows capabilities', /no7-link\/1/.test($('#link-status').textContent), $('#link-status').textContent.slice(0, 70));
$('#link-eyes').click();
await wait(60);
check('phone-link: eyes sent', /👀/.test($('#link-status').textContent) && /happy/.test($('#link-status').textContent), $('#link-status').textContent.slice(0, 70));
$('#link-voice-status').click();
await wait(60);
check('phone-link: voice queue status', /🎧/.test($('#link-status').textContent) && /2 chunk/.test($('#link-status').textContent), $('#link-status').textContent.slice(0, 70));

// desktop view: windows (no Electron bridge → graceful) + recipe editor
$('#nav button[data-view="desktop"]').click();
await wait(30);
check('desktop: window list explains missing bridge', /เดสก์ท็อป/.test($('#win-status').textContent), $('#win-status').textContent.slice(0, 60));
$('#recipe-name').value = 'ทดสอบ UI';
$('#recipe-steps').value = 'notify สวัสดี\nwait 100';
$('#recipe-save').click();
check('desktop: recipe saved from UI', /บันทึกสูตร/.test($('#recipe-status').textContent) && $('#recipe-select').options.length > 1, $('#recipe-status').textContent);
$('#recipe-try').click();
check('desktop: dry-run shows plan', $('#recipe-log').hidden === false && $('#recipe-log').textContent.includes('แจ้งเตือน'), $('#recipe-log').textContent.slice(0, 60));

// capabilities + storage panels (R1)
check('caps: list rendered', $('#caps-list').children.length > 3, String($('#caps-list').children.length));
check('caps: summary line', /พร้อมใช้/.test($('#caps-list').textContent), $('#caps-list').textContent.slice(0, 50));
check('storage: summary rendered', $('#storage-summary').textContent.includes('พื้นที่'), $('#storage-summary').textContent.slice(0, 60));
$('#storage-clean-metrics').click();
check('storage: clean metrics works', $('#settings-status').textContent.includes('ล้างสถิติ'), $('#settings-status').textContent);
check('offline banner hidden while online', $('#offline-banner').hidden === true);

// Persona Studio
$('#nav button[data-view="settings"]').click();
check('sync: controls present', !!$('#sync-push-btn') && !!$('#set-serverurl'));
check('sync: strategy select has 4 options', $('#set-syncstrategy') && $('#set-syncstrategy').options.length === 4, String($('#set-syncstrategy')?.options.length));
check('sync: strategy defaults to newest', $('#set-syncstrategy').value === 'newest', $('#set-syncstrategy').value);
check('sync: conflict report hidden by default', $('#sync-report').hidden === true);
check('persona: list rendered', $('#persona-list').children.length === 9, String($('#persona-list').children.length));
$('#persona-new').click();
$('#pf-name').value = 'น้องสโมค';
$('#pf-emoji').value = '🍊';
$('#pf-system').value = 'คุณคือน้องสโมค พูดจาน่ารัก';
$('#pf-greeting').value = 'สวัสดีค่ะ น้องสโมคมาแล้ว';
$('#pf-save').click();
await wait(20);
check('persona: custom created', $('#persona-list').children.length === 10, String($('#persona-list').children.length));
check('persona: selected header updated', $('#persona-name').textContent.includes('น้องสโมค'), $('#persona-name').textContent);
check('persona: appears in dropdown', [...$('#set-persona').options].some((o) => o.textContent.includes('น้องสโมค')));

// MCP: add server → discover tools → tools appear in grid
check('mcp: empty state shown', $('#mcp-status').textContent.includes('ยังไม่มี server'), $('#mcp-status').textContent);
$('#mcp-name').value = 'Demo';
$('#mcp-url').value = 'http://localhost:3100/mcp';
$('#mcp-add').click();
await wait(150);
check('mcp: server listed', $('#mcp-list').textContent.includes('Demo'), $('#mcp-list').textContent.slice(0, 80));
check('mcp: tool count reported', $('#mcp-list').textContent.includes('1 เครื่องมือ'), $('#mcp-list').textContent.slice(0, 120));
check('mcp: dynamic tool in tools grid', [...$('#tools-grid').children].some((b) => b.textContent.includes('send_email')));
check('mcp: permission category listed', $('#perm-list').children.length === 6, String($('#perm-list').children.length));
check('control: disabled by default', $('#set-control-enabled').checked === false);
check('control: audit summary rendered', $('#control-audit-summary').textContent.length > 0, $('#control-audit-summary').textContent);
check('control: allowlist fields present', !!$('#set-control-apps') && !!$('#set-control-commands'));
check('bots: status polled from server', $('#bots-status').textContent.includes('Telegram: ✅'), $('#bots-status').textContent);
check('bots: line shown as not configured', $('#bots-status').textContent.includes('LINE: —'), $('#bots-status').textContent);
check('mcp: transport offers stdio', [...$('#mcp-transport').options].some((o) => o.value === 'stdio'));
$('#mcp-transport').value = 'stdio';
$('#mcp-transport').dispatchEvent(new window.Event('change'));
await wait(80);
check('mcp: stdio select reveals server list', $('#mcp-stdio-wrap').hidden === false && $('#mcp-stdio-id').value === 'fixture', $('#mcp-stdio-id').value);
check('mcp: oauth section present', !!$('#mcp-oauth-token'));
check('mcp: oauth device + registration fields', !!$('#mcp-oauth-device') && !!$('#mcp-oauth-register'));

// add a second server that supports device flow + DCR
$('#mcp-name').value = 'Device Demo';
$('#mcp-url').value = 'http://localhost:3100/device-mcp';
$('#mcp-oauth-authorize').value = 'https://id.example.com/authorize';
$('#mcp-oauth-token').value = 'https://id.example.com/token';
$('#mcp-oauth-device').value = 'https://id.example.com/device';
$('#mcp-oauth-register').value = 'https://id.example.com/register';
$('#mcp-add').click();
await wait(200);
$('#mcp-list').querySelector('[data-mcp-register]')?.click();
await wait(250);
const dcrClient = (() => {
  try {
    const saved = JSON.parse(window.localStorage.getItem('no7.settings.v1') || '{}');
    return (saved.mcpServers || []).map((x) => x.oauth?.clientId).filter(Boolean).join(',');
  } catch { return ''; }
})();
check('oauth: DCR client id persisted', dcrClient === 'dcr-1', dcrClient || $('#mcp-status').textContent.slice(0, 60));
$('#mcp-list').querySelector('[data-mcp-device]')?.click();
await wait(250);
check('oauth: device code shown for user', /ABCD-EFGH/.test($('#mcp-status').textContent), $('#mcp-status').textContent.slice(0, 80));
$('#mcp-transport').value = 'proxy';
$('#mcp-transport').dispatchEvent(new window.Event('change'));

// voice & streaming settings
$('#nav button[data-view="settings"]').click();
check('voice: thai voice listed', $('#set-voice').options.length >= 2, `${$('#set-voice').options.length} options`);
check('voice: 4 tts providers offered', $('#set-ttsprovider').options.length === 4, `${$('#set-ttsprovider').options.length} options`);
$('#set-ttsprovider').value = 'elevenlabs';
$('#set-ttsprovider').dispatchEvent(new window.Event('change'));
await wait(20);
check('voice: elevenlabs reveals server fields', $('#tts-openai-fields').hidden === false && $('#set-ttsmodel').value === 'eleven_multilingual_v2', `${$('#set-ttsmodel').value} / hidden=${$('#tts-openai-fields').hidden}`);
check('voice: elevenlabs voice suggestions', $('#set-ttsvoice').getAttribute('list') === 'tts-voice-list' && window.document.getElementById('tts-voice-list').children.length === 5, String(window.document.getElementById('tts-voice-list')?.children.length));
$('#set-ttsprovider').value = 'system';
$('#set-ttsprovider').dispatchEvent(new window.Event('change'));

// i18n: switch the UI to English and back
$('#set-uilang').value = 'en';
$('#set-uilang').dispatchEvent(new window.Event('change'));
await wait(30);
check('i18n: nav switched to English', $('#nav button[data-view="chat"]').textContent === '💬 Chat', $('#nav button[data-view="chat"]').textContent);
check('i18n: view title translated', $('#view-title').textContent === 'Settings', $('#view-title').textContent);
check('health i18n: existing card updates to English', $('#health-card').textContent.includes('Data health') && $('#health-card').textContent.includes('Clean duplicates/empty items'), $('#health-card').textContent.slice(0, 100));
check('health i18n: scan button updates to English', $('#health-btn').textContent === '🩺 Check data health');
check('i18n: html lang attribute', window.document.documentElement.getAttribute('lang') === 'en', window.document.documentElement.getAttribute('lang'));
check('i18n: placeholder translated', $('#input').getAttribute('placeholder') === 'Type or talk to No7…', $('#input').getAttribute('placeholder'));
$('#set-uilang').value = 'th';
$('#set-uilang').dispatchEvent(new window.Event('change'));
await wait(30);
check('i18n: back to Thai', $('#nav button[data-view="chat"]').textContent === '💬 แชท' && $('#view-title').textContent === 'ตั้งค่า', $('#view-title').textContent);
check('health i18n: card and scan button return to Thai', $('#health-card').textContent.includes('สุขภาพข้อมูล') && $('#health-btn').textContent === '🩺 ตรวจสุขภาพข้อมูล');

// local brain panel (stubbed server probe)
$('#local-scan').click();
await wait(120);
check('local: models listed', /พบ 1 โมเดล/.test($('#local-status').textContent), $('#local-status').textContent.slice(0, 60));
check('local: model row rendered', $('#local-models').textContent.includes('llama3.1'), $('#local-models').textContent.slice(0, 60));
$('#local-models').querySelector('button')?.click();
await wait(30);
check('local: model chosen', /เลือก llama3.1/.test($('#local-status').textContent), $('#local-status').textContent.slice(0, 60));
$('#set-offlinebrain').checked = true;
$('#set-offlinebrain').dispatchEvent(new window.Event('change'));
await wait(20);
const offlineBrain = (() => {
  try { return JSON.parse(window.localStorage.getItem('no7.settings.v1') || '{}').offlineBrain || {}; } catch { return {}; }
})();
check('local: offline brain saved', offlineBrain.enabled === true && offlineBrain.model === 'llama3.1:latest', JSON.stringify(offlineBrain).slice(0, 80));
$('#local-warm').click();
await wait(150);
check('local: warm-up reported', /พร้อมใช้/.test($('#local-status').textContent), $('#local-status').textContent.slice(0, 60));
check('voice: openai fields hidden by default', $('#tts-openai-fields').hidden === true);
$('#set-ttsprovider').value = 'openai';
$('#set-ttsprovider').dispatchEvent(new window.Event('change'));
check('voice: openai fields reveal on select', $('#tts-openai-fields').hidden === false);
check('voice: barge-in defaults to keyword', $('#set-bargein').value === 'keyword', $('#set-bargein').value);
$('#set-streaming').checked = false;
$('#set-speakstream').checked = false;
$('#save-settings-btn').click();
await wait(20);
$('#nav button[data-view="chat"]').click();
$('#stop-btn').click();
check('voice: stop button halts speech', $('#subtitle').textContent.includes('หยุดแล้ว'), $('#subtitle').textContent);

// permission gate: risky tool must ask first
submit('เปิดเว็บ example.com ให้หน่อย');
await wait(150);
check('permission: confirm modal shown', $('#confirm-modal').hidden === false, $('#confirm-title').textContent);
$('#confirm-no').click();
await wait(120);
check('permission: denial respected', $('#messages').textContent.includes('ไม่อนุญาต') || $('#messages').textContent.includes('ไม่ได้ทำอะไรต่อ'), $('#messages').textContent.slice(-120));
submit('เปิดเว็บ example.com อีกครั้ง');
await wait(150);
check('permission: asks again next time', $('#confirm-modal').hidden === false);
$('#confirm-always').click();
await wait(150);
check('permission: approved run completed', $('#messages').textContent.includes('เปิดลิงก์') || $('#messages').textContent.includes('example.com'), $('#messages').textContent.slice(-160));

$('#companion-btn').click();
check('companion: overlay toggled', $('#companion').hidden === false);

$('#nav button[data-view="tools"]').click();
$('#tools-grid').children[4].click();
await wait(80);
check('tools view: direct run card', $('#tool-result').children.length > 0);

// reliability: metrics, diagnostics, offline queue
$('#nav button[data-view="settings"]').click();
await wait(20);
check('metrics: summary rendered', $('#metrics-summary').textContent.length > 0, $('#metrics-summary').textContent);
$('#diag-run').click();
await wait(80);
check('diagnostics: report generated', $('#diag-output').textContent.includes('# No7 Diagnostics'), $('#diag-output').textContent.slice(0, 40));
check('diagnostics: no api keys in report', !/sk-[A-Za-z0-9]{8,}/.test($('#diag-output').textContent));
check('diagnostics: settings section present', $('#diag-output').textContent.includes('## สถิติ'));

$('#nav button[data-view="chat"]').click();
Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
submit('ทดสอบคิวออฟไลน์');
await wait(30);
check('offline: message queued', $('#outbox-badge').hidden === false && $('#outbox-badge').textContent.includes('1'), $('#outbox-badge').textContent);
Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
window.dispatchEvent(new window.Event('online'));
await wait(250);
check('offline: queue flushed when back online', $('#messages').textContent.includes('ส่งข้อความที่ค้างไว้'), $('#messages').textContent.slice(-120));

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `  → ${r.extra}`}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
window.close();
process.exit(failed.length ? 1 : 0);
