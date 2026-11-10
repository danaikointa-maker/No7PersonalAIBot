import './styles.css';
import { StateMachine, STATES } from './core/state.js';
import { PERSONAS, getPersona } from './core/personas.js';
import { MemoryStore } from './core/memory.js';
import { AIProvider, PROVIDERS, ModelFallback } from './core/ai-providers.js';
import { TOOLS, TOOL_IDS, runTool, extractToolCall, stripToolCalls } from './core/tools.js';
import { buildSystemPrompt, summarizeToolResult } from './core/prompt.js';
import { Voice } from './core/voice.js';
import { EyeAvatar } from './ui/avatar.js';
import { renderCard, renderError } from './ui/cards.js';
import { loadSettings, saveSettings, resetSettings, hasProviderConfigured } from './core/settings.js';
import { detectPlatform, platformLabel, isDesktopHost } from './core/platform.js';

/* ------------------------------------------------------------------ boot */
const $ = (sel) => document.querySelector(sel);

let settings = loadSettings();
const memory = new MemoryStore();
const sm = new StateMachine();
const voice = new Voice();
const fallback = new ModelFallback();
const platform = detectPlatform();

let history = [];          // [{role, content}] short-term (last 12 turns)
let busy = false;
let deferredInstall = null;

sm.set({ hasProvider: hasProviderConfigured(settings) });
sm.onChange((s) => {
  $('#state-label').textContent = s;
  $('#conn-badge').textContent = `● ${s === STATES.ERROR ? 'มีปัญหา' : s === STATES.SETUP ? 'ต้องตั้งค่า' : 'พร้อมใช้'}`;
  $('#conn-badge').style.color = s === STATES.ERROR ? '#f87171' : s === STATES.SETUP ? '#fbbf24' : '#34d399';
  avatar.setEmotion(stateEmotion(s));
  companionAvatar?.setEmotion(stateEmotion(s));
  globalThis.no7?.native?.sendEmotion?.(stateEmotion(s));
  updateMicUi();
});

const avatar = new EyeAvatar($('#avatar'));
avatar.start();
const companionAvatar = isDesktopHost() ? new EyeAvatar($('#companion-avatar')) : null;
if (companionAvatar) companionAvatar.start();

// Reflect the initial derived state (no transition fires on first paint).
$('#state-label').textContent = sm.current;
avatar.setEmotion(stateEmotion(sm.current));
$('#conn-badge').textContent = `● ${sm.current === STATES.SETUP ? 'ต้องตั้งค่า' : 'พร้อมใช้'}`;
$('#conn-badge').style.color = sm.current === STATES.SETUP ? '#fbbf24' : '#34d399';

// Voice events feed the same derived state machine.
voice.onState = (s) => sm.set({ micActive: s === STATES.LISTENING, ttsPlaying: s === STATES.SPEAKING });
voice.onSubtitle = (text) => { if (text) setSubtitle(text); };

$('#platform-badge').textContent = platformLabel(platform);
$('#device-info').textContent = `${platformLabel(platform)} · จอ ${window.innerWidth}×${window.innerHeight} · STT ${voice.sttSupported ? '✅' : '❌'} · TTS ${voice.ttsSupported ? '✅' : '❌'}`;

/* -------------------------------------------------------------- navigation */
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $('#view-title').textContent = { chat: 'แชทกับ No7', tools: 'เครื่องมือ', memory: 'ความจำ', settings: 'ตั้งค่า' }[name] || name;
  $('#sidebar').classList.remove('open');
  if (name === 'tools') renderToolsGrid();
  if (name === 'memory') renderMemory();
}
document.querySelectorAll('#nav button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
$('#menu-btn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

/* ------------------------------------------------------------------- chat */
function addMessage(role, text) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;
  $('#messages').appendChild(el);
  $('#messages').scrollTop = $('#messages').scrollHeight;
  return el;
}

function setSubtitle(text) {
  $('#subtitle').textContent = text;
  const bubble = $('#companion-bubble');
  if (bubble) { bubble.textContent = text; bubble.hidden = !text; }
  globalThis.no7?.native?.sendSubtitle?.(text);
}

async function speak(text) {
  if (!settings.tts || !text) return;
  setSubtitle(text);
  await voice.speak(text, { lang: settings.language === 'en' ? 'en-US' : 'th-TH' });
}

/** Retrieve memory → build prompt → AI → tool loop → answer. */
async function respond(userText) {
  if (busy) return;
  busy = true;
  sm.set({ error: null, requestInFlight: true });
  memory.logTurn('user', userText);
  history.push({ role: 'user', content: userText });
  if (history.length > 24) history = history.slice(-24);

  const persona = getPersona(settings.persona);
  const relevant = memory.search(userText, 6);
  const systemPrompt = buildSystemPrompt({
    persona,
    memory: relevant.map((f) => ({ text: f.text })),
    language: settings.language,
    polite: settings.polite,
    platform,
  });

  const provider = new AIProvider(settings);
  const messages = [{ role: 'system', content: systemPrompt }, ...history];
  const botEl = addMessage('bot', '…');

  try {
    let answer = await provider.chat(messages);

    // one tool round-trip is enough for this version
    const call = extractToolCall(answer);
    if (call) {
      sm.set({ requestInFlight: false, toolRunning: true });
      botEl.textContent = `กำลังใช้เครื่องมือ: ${TOOLS[call.name]?.label || call.name}…`;
      try {
        const res = await runTool(call.name, call.args, {});
        const followUp = await provider.chat([
          ...messages,
          { role: 'assistant', content: answer },
          { role: 'user', content: `ผลลัพธ์จากเครื่องมือ ${call.name}: ${JSON.stringify(res.data)}\n\nสรุปผลนี้ให้ผู้ใช้เป็นภาษาไทยสั้นๆ เป็นธรรมชาติ (ไม่ต้องมี JSON)` },
        ]);
        const spoken = stripToolCalls(followUp) || summarizeToolResult(call.name, res.data);
        botEl.textContent = spoken;
        renderCard(botEl, res.tool, res.data);
        answer = spoken;
      } catch (toolErr) {
        renderError(botEl, toolErr.message);
        answer = `เรียกเครื่องมือไม่สำเร็จ: ${toolErr.message}`;
      }
      sm.set({ toolRunning: false });
    } else {
      botEl.textContent = stripToolCalls(answer) || '(ไม่มีคำตอบ)';
    }

    memory.logTurn('assistant', answer);
    history.push({ role: 'assistant', content: answer });
    learnFrom(userText);
    sm.set({ requestInFlight: false });
    await speak(answer);
  } catch (err) {
    fallback.recordError(settings.model, Number(/(\d{3})/.exec(err.message)?.[1] || 0));
    botEl.textContent = `⚠️ ${err.message}`;
    sm.set({ error: err.message, requestInFlight: false });
    setSubtitle('มีปัญหาการเชื่อมต่อ ลองตรวจสอบการตั้งค่า');
    setTimeout(() => sm.set({ error: null }), 4000);
  } finally {
    busy = false;
    avatar.setEmotion(stateEmotion(sm.current));
  }
}

/** Lightweight fact extraction — the "on-device consolidation" idea, heuristic version. */
function learnFrom(text) {
  const name = /(?:ฉันชื่อ|ผมชื่อ|หนูชื่อ|เรียกฉันว่า|my name is)\s*([^\s,。.!?]{1,30})/i.exec(text);
  if (name) memory.addFact(`ชื่อผู้ใช้คือ ${name[1]}`, 3);

  const remember = /(?:จำไว้ว่า|จำไว้|remember that)\s*(.{3,200})/i.exec(text);
  if (remember) memory.addFact(remember[1].trim(), 2);

  const like = /(?:ฉันชอบ|ผมชอบ|ชอบ)\s*(.{2,60})/i.exec(text);
  if (like && like[1].length > 2) memory.addFact(`ผู้ใช้ชอบ ${like[1].trim()}`, 1);
}

/* -------------------------------------------------------- composer + mic */
$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#input').value.trim();
  if (!text) return;
  $('#input').value = '';
  addMessage('user', text);
  respond(text);
});

$('#mic-btn').addEventListener('click', async () => {
  if (voice.listening) { voice.stopListening(); return; }
  if (!settings.stt) { alert('เปิด "ใช้ไมค์พูด" ในตั้งค่าก่อน'); return; }
  try {
    setSubtitle('กำลังฟัง… 🎤');
    const text = await voice.listenOnce();
    if (text) {
      addMessage('user', text);
      respond(text);
    } else {
      setSubtitle('ไม่ได้ยินเสียง ลองอีกครั้ง');
    }
  } catch (e) {
    setSubtitle(e.message);
  }
});

function updateMicUi() {
  $('#mic-btn').classList.toggle('listening', sm.current === STATES.LISTENING);
}

function stateEmotion(s) {
  return {
    [STATES.IDLE]: 'happy',
    [STATES.LISTENING]: 'listening',
    [STATES.THINKING]: 'thinking',
    [STATES.CONNECTING]: 'thinking',
    [STATES.SPEAKING]: 'speaking',
    [STATES.ERROR]: 'error',
    [STATES.SLEEP]: 'sleepy',
    [STATES.SETUP]: 'confused',
  }[s] || 'neutral';
}

/* ------------------------------------------------------------------ tools */
function renderToolsGrid() {
  const grid = $('#tools-grid');
  if (grid.dataset.ready) return;
  for (const id of TOOL_IDS) {
    const t = TOOLS[id];
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.innerHTML = `<strong>${t.emoji} ${t.label}</strong><small>${t.desc}</small>`;
    btn.addEventListener('click', async () => {
      const out = $('#tool-result');
      out.innerHTML = '';
      try {
        const res = await runTool(id, {});
        renderCard(out, res.tool, res.data);
      } catch (e) {
        renderError(out, e.message);
      }
    });
    grid.appendChild(btn);
  }
  grid.dataset.ready = '1';
}

/* ----------------------------------------------------------------- memory */
function renderMemory() {
  const factsEl = $('#mem-facts');
  const list = memory.listFacts().slice(0, 30);
  factsEl.innerHTML = list.length ? '' : '<p class="hint">ยังไม่มีความจำ — ลองพิมพ์ "จำไว้ว่า ฉันชอบกาแฟดำ"</p>';
  for (const f of list) {
    const div = document.createElement('div');
    div.className = 'fact';
    div.textContent = f.text;
    const del = document.createElement('button');
    del.textContent = 'ลบ';
    del.style.cssText = 'float:right;padding:2px 8px;font-size:12px';
    del.addEventListener('click', () => { memory.removeFact(f.id); renderMemory(); });
    div.appendChild(del);
    factsEl.appendChild(div);
  }
}

$('#mem-search-btn').addEventListener('click', () => {
  const q = $('#mem-query').value.trim();
  const res = q ? memory.search(q, 10) : memory.listFacts().slice(0, 10);
  const el = $('#mem-results');
  el.innerHTML = res.length ? '' : '<p class="hint">ไม่พบความจำที่เกี่ยวข้อง</p>';
  for (const f of res) {
    const div = document.createElement('div');
    div.className = 'fact';
    div.textContent = f.text;
    el.appendChild(div);
  }
});

$('#mem-add-btn').addEventListener('click', () => {
  const v = $('#mem-new').value.trim();
  if (!v) return;
  memory.addFact(v, 2);
  $('#mem-new').value = '';
  renderMemory();
});

/* --------------------------------------------------------------- settings */
function renderSettingsForm() {
  const personaSel = $('#set-persona');
  personaSel.innerHTML = '';
  for (const p of PERSONAS) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = `${p.name} — ${p.desc}`;
    personaSel.appendChild(o);
  }
  personaSel.value = settings.persona;
  $('#set-language').value = settings.language;
  $('#set-polite').checked = settings.polite;
  $('#set-tts').checked = settings.tts;
  $('#set-stt').checked = settings.stt;
  $('#set-provider').value = settings.provider;
  $('#set-model').value = settings.model;
  $('#set-apikey').value = settings.apiKey;
  $('#set-baseurl').value = settings.baseUrl;
  updatePersonaHeader();
}

function updatePersonaHeader() {
  const p = getPersona(settings.persona);
  $('#persona-name').textContent = p.name;
  $('#persona-desc').textContent = p.desc;
}

function collectSettings() {
  return {
    persona: $('#set-persona').value,
    language: $('#set-language').value,
    polite: $('#set-polite').checked,
    tts: $('#set-tts').checked,
    stt: $('#set-stt').checked,
    provider: $('#set-provider').value,
    model: $('#set-model').value || PROVIDERS[$('#set-provider').value]?.defaultModel || '',
    apiKey: $('#set-apikey').value.trim(),
    baseUrl: $('#set-baseurl').value.trim(),
  };
}

$('#save-settings-btn').addEventListener('click', () => {
  settings = saveSettings(collectSettings());
  sm.set({ hasProvider: hasProviderConfigured(settings), error: null });
  updatePersonaHeader();
  $('#settings-status').textContent = '✅ บันทึกแล้ว (เก็บในเครื่องนี้เท่านั้น)';
});

$('#test-ai-btn').addEventListener('click', async () => {
  const draft = { ...settings, ...collectSettings() };
  $('#settings-status').textContent = 'กำลังทดสอบ…';
  try {
    const p = new AIProvider(draft);
    const reply = await p.chat([
      { role: 'system', content: 'ตอบสั้นๆ' },
      { role: 'user', content: 'พิมพ์คำว่า OK เท่านั้น' },
    ]);
    $('#settings-status').textContent = `✅ เชื่อมต่อได้: "${String(reply).slice(0, 60)}"`;
  } catch (e) {
    $('#settings-status').textContent = `❌ ${e.message}`;
  }
});

$('#set-provider').addEventListener('change', () => {
  const p = PROVIDERS[$('#set-provider').value];
  if (p) {
    $('#set-model').value = p.defaultModel;
    $('#set-baseurl').value = p.defaultBaseUrl || '';
  }
});

$('#export-btn').addEventListener('click', () => {
  const data = {
    exportedAt: new Date().toISOString(),
    settings: { ...settings, apiKey: '' },
    facts: memory.listFacts(),
    log: memory.recentLog(500),
    todos: JSON.parse(localStorage.getItem('no7.todos.v1') || '[]'),
    notes: JSON.parse(localStorage.getItem('no7.notes.v1') || '[]'),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `no7-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#reset-btn').addEventListener('click', () => {
  if (!confirm('ล้างข้อมูลทั้งหมดในเครื่องนี้? (ความจำ, ตั้งค่า, โน้ต)')) return;
  memory.clearAll();
  settings = resetSettings();
  ['no7.todos.v1', 'no7.notes.v1'].forEach((k) => localStorage.removeItem(k));
  renderSettingsForm();
  renderMemory();
  sm.set({ hasProvider: hasProviderConfigured(settings) });
  $('#settings-status').textContent = 'ล้างข้อมูลแล้ว';
});

/* ---------------------------------------------------------------- PWA */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
});
$('#install-btn').addEventListener('click', async () => {
  if (deferredInstall) {
    deferredInstall.prompt();
    deferredInstall = null;
  } else {
    alert('ถ้าเปิดในเบราว์เซอร์อยู่: ใช้เมนู "เพิ่มไปยังหน้าจอโฮม" หรือติดตั้งผ่าน Android/iOS build (ดู docs/BUILD.md)');
  }
});

/* ------------------------------------------------------- companion mode */
$('#companion-btn').addEventListener('click', () => {
  const c = $('#companion');
  c.hidden = !c.hidden;
  if (!c.hidden) makeDraggable(c);
});

function makeDraggable(el) {
  let dx = 0, dy = 0, dragging = false;
  const onDown = (e) => {
    dragging = true;
    const p = e.touches ? e.touches[0] : e;
    const r = el.getBoundingClientRect();
    dx = p.clientX - r.left; dy = p.clientY - r.top;
  };
  const onMove = (e) => {
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    el.style.left = `${p.clientX - dx}px`;
    el.style.top = `${p.clientY - dy}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    e.preventDefault();
  };
  const onUp = () => { dragging = false; };
  el.addEventListener('mousedown', onDown);
  el.addEventListener('touchstart', onDown, { passive: true });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);
}

/* ------------------------------------------------------- phone-link pairing */
$('#pair-btn').addEventListener('click', async () => {
  const out = $('#pair-output');
  out.textContent = 'กำลังสร้าง…';
  if (!globalThis.crypto?.subtle) {
    out.textContent = '⚠️ ต้องเปิดผ่าน https:// หรือ localhost (เบราว์เซอร์ปิด crypto.subtle บน http://)<\n'
      + 'ทางเลือก: รัน npm run server แล้วใช้ POST /api/pair เพื่อจับคู่';
    return;
  }
  try {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`pair:${code}`));
    const hex = [...new Uint8Array(sig)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('no7.pairing.v1', JSON.stringify({ code, secret: [...secret], createdAt: Date.now() }));
    out.textContent = `รหัสจับคู่: ${code}\nHMAC proof: ${hex}\n(บันทึกในเครื่องแล้ว — ใช้กับ ESP32 / Phone-Link ดู docs/PHONE_LINK.md)`;
  } catch (e) {
    out.textContent = `สร้างไม่สำเร็จ: ${e.message}`;
  }
});

/* ------------------------------------------------------------ timers */
window.addEventListener('no7:timer', (e) => {
  const label = e.detail?.label || 'Timer';
  addMessage('system', `⏱️ ${label}: ครบเวลาแล้ว!`);
  setSubtitle(`⏱️ ${label} ครบเวลาแล้ว`);
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('No7 AI', { body: `${label} ครบเวลาแล้ว` });
  }
  voice.speak(`${label} ครบเวลาแล้ว`, { lang: 'th-TH' });
});

// Desktop global hotkey (Ctrl/Cmd+Shift+Space) → same path as the mic button.
globalThis.no7?.native?.onPushToTalk?.(() => $('#mic-btn').click());

if ('Notification' in window && Notification.permission === 'default') {
  setTimeout(() => Notification.requestPermission().catch(() => {}), 5000);
}

/* -------------------------------------------------------------- startup */
renderSettingsForm();
renderToolsGrid();
addMessage('bot', 'สวัสดีครับ ผม No7 👋\nพิมพ์คุยได้เลย หรือกด 🎤 เพื่อพูด\n\nลองถาม: "อากาศกรุงเทพวันนี้", "ราคาบิทคอยน์", "ตั้งเวลา 5 นาที"');
setSubtitle('สวัสดีครับ ผม No7 พร้อมช่วยแล้ว');
if (!hasProviderConfigured(settings)) {
  setSubtitle('เริ่มต้น: ไปที่ ⚙️ ตั้งค่า เพื่อเลือกสมอง AI');
}
sm.recompute();

// re-check derived state periodically (sleep/idle)
setInterval(() => sm.recompute(), 15000);

// expose app internals for debugging (kept off globalThis.no7, which is the
// frozen native bridge injected by Electron's preload).
globalThis.__no7app = { settings, memory, sm, voice, respond, addMessage };
