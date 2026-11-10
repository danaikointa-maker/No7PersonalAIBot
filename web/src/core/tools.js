// Tool registry — the ESP32 "42 tools with on-screen cards" principle, re-implemented
// for web so the SAME code runs on mobile + PC. Only key-free public APIs by default,
// plus local tools (timer/todo/note) so the bot is useful offline.

export const TOOLS = {
  weather: {
    emoji: '🌤️',
    label: 'อากาศ',
    desc: 'พยากรณ์อากาศและอุณหภูมิปัจจุบันของเมือง (ไม่ต้องใช้คีย์)',
    params: { city: 'string (เช่น Bangkok) — ไม่ใส่ = กรุงเทพฯ' },
    async run({ city = 'Bangkok' }) {
      const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=th`).then((r) => r.json());
      const place = geo.results?.[0];
      if (!place) throw new Error(`ไม่พบเมือง "${city}"`);
      const w = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`
      ).then((r) => r.json());
      const c = w.current;
      return {
        title: `อากาศ ${place.name}`,
        big: `${Math.round(c.temperature_2m)}°C`,
        lines: [
          `${weatherText(c.weather_code)} · รู้สึกเหมือน ${Math.round(c.apparent_temperature)}°C`,
          `ความชื้น ${c.relative_humidity_2m}% · ลม ${c.wind_speed_10m} km/h`,
          ...w.daily.time.slice(1, 3).map((d, i) =>
            `${d}: ${Math.round(w.daily.temperature_2m_min[i + 1])}–${Math.round(w.daily.temperature_2m_max[i + 1])}°C, ฝน ${w.daily.precipitation_probability_max[i + 1]}%`),
        ],
      };
    },
  },

  air: {
    emoji: '😷',
    label: 'PM2.5',
    desc: 'คุณภาพอากาศ / ฝุ่น PM2.5 ของเมือง',
    params: { city: 'string — ไม่ใส่ = กรุงเทพฯ' },
    async run({ city = 'Bangkok' }) {
      const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=th`).then((r) => r.json());
      const place = geo.results?.[0];
      if (!place) throw new Error(`ไม่พบเมือง "${city}"`);
      const a = await fetch(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&current=pm2_5,pm10,us_aqi&timezone=auto`
      ).then((r) => r.json());
      const pm = a.current?.pm2_5 ?? 0;
      const aqi = a.current?.us_aqi ?? 0;
      return {
        title: `ฝุ่น ${place.name}`,
        big: `PM2.5 ${Math.round(pm)} µg/m³`,
        lines: [`US AQI ${Math.round(aqi)} — ${aqiText(aqi)}`, `PM10 ${Math.round(a.current?.pm10 ?? 0)} µg/m³`],
        tone: aqi > 100 ? 'warn' : 'ok',
      };
    },
  },

  crypto: {
    emoji: '₿',
    label: 'คริปโต',
    desc: 'ราคา Bitcoin / Ethereum / อื่นๆ เป็นบาทและดอลลาร์',
    params: { coins: 'array ของ coin id เช่น ["bitcoin","ethereum"]' },
    async run({ coins = ['bitcoin', 'ethereum'] }) {
      const ids = Array.isArray(coins) ? coins.join(',') : 'bitcoin,ethereum';
      const d = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,thb&include_24hr_change=true`).then((r) => r.json());
      const lines = Object.entries(d).map(([k, v]) =>
        `${k}: $${fmt(v.usd)} (${fmt(v.thb)} บาท) ${v.usd_24h_change >= 0 ? '▲' : '▼'} ${Math.abs(v.usd_24h_change ?? 0).toFixed(2)}%`);
      return { title: 'ราคาคริปโต', big: `$${fmt(d.bitcoin?.usd)} BTC`, lines };
    },
  },

  fx: {
    emoji: '💱',
    label: 'อัตราแลกเปลี่ยน',
    desc: 'ค่าเงินบาทเทียบ USD/EUR/JPY/CNY',
    params: { base: 'สกุลฐาน (ค่าเริ่มต้น THB)' },
    async run({ base = 'THB' }) {
      const d = await fetch(`https://open.er-api.com/v6/latest/${base}`).then((r) => r.json());
      if (d.result !== 'success') throw new Error('ดึงอัตราแลกเปลี่ยนไม่สำเร็จ');
      const keep = ['USD', 'EUR', 'JPY', 'CNY', 'GBP', 'KRW'];
      return {
        title: `อัตราแลกเปลี่ยน (ฐาน ${base})`,
        big: `1 ${base} = ${d.rates.USD.toFixed(4)} USD`,
        lines: keep.filter((k) => k !== base).map((k) => `${k}: ${d.rates[k].toFixed(4)}`),
      };
    },
  },

  gold: {
    emoji: '🪙',
    label: 'ทองคำ',
    desc: 'ราคาทองคำสปอต (USD/oz)',
    params: {},
    async run() {
      const d = await fetch('https://api.gold-api.com/price/XAU').then((r) => r.json());
      return {
        title: 'ทองคำ (สปอต)',
        big: `$${fmt(d.price)} /oz`,
        lines: [`อัปเดต ${new Date(d.updatedAt || Date.now()).toLocaleString('th-TH')}`, 'ราคาทองไทยร้านทองอาจต่างจากสปอตโลก'],
      };
    },
  },

  wiki: {
    emoji: '📚',
    label: 'วิกิพีเดีย',
    desc: 'ค้นหาข้อมูลสรุปจากวิกิพีเดีย',
    params: { query: 'string หัวข้อที่ต้องการค้น' },
    async run({ query }) {
      if (!query) throw new Error('ต้องระบุคำค้น');
      const s = await fetch(`https://th.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`).then((r) => r.json());
      const hit = s.query?.search?.[0];
      if (!hit) throw new Error(`ไม่พบ "${query}" ในวิกิพีเดีย`);
      const sum = await fetch(`https://th.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title)}`).then((r) => r.json());
      return { title: sum.title, big: '', lines: [sum.extract || '(ไม่มีสรุป)'], url: sum.content_urls?.desktop?.page };
    },
  },

  news: {
    emoji: '📰',
    label: 'ข่าว',
    desc: 'ข่าวเทคโนโลยีล่าสุดจาก Hacker News (ไม่ต้องใช้คีย์)',
    params: { limit: 'number จำนวนข่าว (เริ่มต้น 5)' },
    async run({ limit = 5 }) {
      const ids = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json').then((r) => r.json());
      const items = await Promise.all(ids.slice(0, limit).map((id) =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then((r) => r.json())));
      return {
        title: 'ข่าวเทคโนโลยี',
        big: '',
        lines: items.map((it, i) => `${i + 1}. ${it.title} (${it.score} แต้ม)`),
        url: items[0]?.url,
      };
    },
  },

  timer: {
    emoji: '⏱️',
    label: 'ตั้งเวลา',
    desc: 'ตั้งนาฬิกาจับเวลา / เตือนเมื่อครบ',
    params: { seconds: 'number วินาที', label: 'string ชื่อของ timer' },
    local: true,
    run({ seconds = 60, label = 'Timer' }) {
      const s = Math.max(1, Number(seconds) || 60);
      setTimeout(() => {
        globalThis.dispatchEvent(new CustomEvent('no7:timer', { detail: { label } }));
      }, s * 1000);
      return { title: 'ตั้งเวลาแล้ว', big: fmtDuration(s), lines: [label, `จะแจ้งเตือนใน ${fmtDuration(s)}`] };
    },
  },

  todo: {
    emoji: '✅',
    label: 'สิ่งที่ต้องทำ',
    desc: 'เพิ่ม / ดูรายการสิ่งที่ต้องทำ',
    params: { action: '"add" | "list" | "clear"', text: 'string (เมื่อ add)' },
    local: true,
    run({ action = 'list', text }) {
      const KEY = 'no7.todos.v1';
      const list = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (action === 'add' && text) {
        list.push({ text, done: false, ts: Date.now() });
        localStorage.setItem(KEY, JSON.stringify(list));
      } else if (action === 'clear') {
        localStorage.setItem(KEY, '[]');
      }
      const cur = JSON.parse(localStorage.getItem(KEY) || '[]');
      return {
        title: 'สิ่งที่ต้องทำ',
        big: `${cur.length} รายการ`,
        lines: cur.length ? cur.map((t, i) => `${i + 1}. ${t.text}`) : ['ยังไม่มีรายการ'],
      };
    },
  },

  note: {
    emoji: '📝',
    label: 'โน้ต',
    desc: 'จดโน้ตด่วน (เก็บในเครื่อง)',
    params: { text: 'string ข้อความโน้ต' },
    local: true,
    run({ text = '' }) {
      const KEY = 'no7.notes.v1';
      const list = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (text) list.push({ text, ts: Date.now() });
      localStorage.setItem(KEY, JSON.stringify(list));
      return {
        title: 'โน้ต',
        big: `${list.length} โน้ต`,
        lines: list.slice(-5).reverse().map((n) => `• ${n.text}`),
      };
    },
  },

  calc: {
    emoji: '🧮',
    label: 'คำนวณ',
    desc: 'คำนวณเลขหรือสูตร เช่น 18*7+3, (1200-350)/4',
    params: { expression: 'string สูตรที่ต้องการคำนวณ (+, -, *, /, %, **, วงเล็บ)' },
    local: true,
    run({ expression = '' }) {
      const clean = String(expression).replace(/[,\s]/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/x/gi, '*');
      if (!/^[-+*/%().0-9eE*]+$/.test(clean)) throw new Error('สูตรนี้คำนวณไม่ได้ (รับเฉพาะตัวเลขและ + - * / % ** วงเล็บ)');
      // eslint-disable-next-line no-new-func
      const value = Function(`"use strict"; return (${clean});`)();
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('ผลลัพธ์ไม่ใช่ตัวเลข');
      return { title: 'ผลคำนวณ', big: String(Number(value.toFixed(8))), lines: [`${expression} = ${value}`] };
    },
  },

  memory_save: {
    emoji: '🧠',
    label: 'จำ',
    desc: 'บันทึกข้อเท็จจริงลงความจำระยะยาว',
    params: { text: 'string ข้อเท็จจริง', importance: 'number 1-5 (ยิ่งสูงยิ่งถูกหยิบมาใช้)' },
    local: true,
    run({ text = '', importance = 2 }, ctx) {
      if (!text) throw new Error('ต้องระบุข้อความที่จะจำ');
      const fact = ctx?.memory?.addFact(text, Math.min(5, Math.max(1, Number(importance) || 2)));
      return { title: 'จำไว้แล้ว', big: '', lines: [fact ? fact.text : text] };
    },
  },

  memory_search: {
    emoji: '🔎',
    label: 'ค้นความจำ',
    desc: 'ค้นสิ่งที่เคยจำไว้ (BM25)',
    params: { query: 'string คำค้น' },
    local: true,
    run({ query = '' }, ctx) {
      const hits = ctx?.memory?.search(query, 6) || [];
      return { title: 'ความจำที่เกี่ยวข้อง', big: `${hits.length} รายการ`, lines: hits.length ? hits.map((h) => `• ${h.text}`) : ['ไม่พบ'] };
    },
  },

  reminder: {
    emoji: '⏰',
    label: 'เตือนความจำ',
    desc: 'ตั้งเตือนตามเวลาจริง เช่น "อีก 20 นาที" หรือ "15:30"',
    params: { minutes: 'number นาทีจากนี้', at: 'string เวลา HH:MM (ใช้แทน minutes ได้)', label: 'string เรื่องที่จะเตือน' },
    local: true,
    run({ minutes, at, label = 'แจ้งเตือน' }) {
      const KEY = 'no7.reminders.v1';
      let when = Date.now() + (Number(minutes) || 0) * 60000;
      if (at && /^\d{1,2}:\d{2}$/.test(at)) {
        const [h, m] = at.split(':').map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
        when = d.getTime();
      }
      if (when <= Date.now()) when = Date.now() + 60000;
      const list = JSON.parse(localStorage.getItem(KEY) || '[]');
      list.push({ label, when });
      localStorage.setItem(KEY, JSON.stringify(list));
      scheduleReminder({ label, when });
      const mins = Math.max(1, Math.round((when - Date.now()) / 60000));
      return {
        title: 'ตั้งเตือนแล้ว',
        big: new Date(when).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        lines: [label, `อีก ${mins} นาที`],
      };
    },
  },

  open_url: {
    emoji: '🌐',
    label: 'เปิดเว็บ',
    desc: 'เปิดลิงก์ในเบราว์เซอร์',
    params: { url: 'string ต้องขึ้นต้นด้วย http' },
    run({ url = '' }) {
      if (!/^https?:\/\//i.test(url)) throw new Error('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://');
      const opened = openExternal(url);
      return { title: 'เปิดลิงก์', big: '', lines: [url, opened ? 'เปิดในแท็บใหม่แล้ว' : 'เบราว์เซอร์บล็อก — เปิดด้วยตัวเอง'], url };
    },
  },

  clipboard_copy: {
    emoji: '📋',
    label: 'คัดลอก',
    desc: 'คัดลอกข้อความไปยังคลิปบอร์ด',
    params: { text: 'string ข้อความ' },
    async run({ text = '' }) {
      if (!text) throw new Error('ต้องระบุข้อความ');
      await copyText(text);
      return { title: 'คัดลอกแล้ว', big: `${text.length} ตัวอักษร`, lines: [text.slice(0, 120)] };
    },
  },

  compose_message: {
    emoji: '✉️',
    label: 'ร่างข้อความ',
    desc: 'เปิดหน้าต่างเขียนอีเมล/SMS/LINE พร้อมข้อความที่ร่างไว้ (ผู้ใช้กดส่งเองเสมอ)',
    params: { to: 'string ผู้รับ (อีเมล/เบอร์)', subject: 'string หัวข้อ (อีเมล)', body: 'string เนื้อความ', channel: '"email" | "sms" | "line"' },
    async run({ to = '', subject = '', body = '', channel = 'email' }) {
      const enc = encodeURIComponent;
      let url;
      if (channel === 'sms') url = `sms:${to}?&body=${enc(body)}`;
      else if (channel === 'line') url = `https://line.me/R/msg/text/?${enc(body)}`;
      else url = `mailto:${to}?subject=${enc(subject)}&body=${enc(body)}`;
      const opened = openExternal(url);
      return {
        title: 'ร่างข้อความพร้อมส่ง',
        big: channel.toUpperCase(),
        lines: [to ? `ถึง: ${to}` : 'ยังไม่ได้ระบุผู้รับ', body.slice(0, 120), opened ? 'เปิดแอปให้แล้ว — กดส่งเองเมื่อพร้อม' : 'เปิดไม่สำเร็จ กรุณาคัดลอกเอง'],
        url: channel === 'line' ? url : undefined,
      };
    },
  },

  open_app: {
    emoji: '🖥️',
    label: 'เปิดโปรแกรม',
    desc: 'เปิดแอป/ไฟล์บนเครื่อง (เดสก์ท็อปเท่านั้น)',
    params: { target: 'string ชื่อแอปหรือ path' },
    async run({ target = '' }) {
      const bridge = globalThis.no7?.native;
      if (!bridge?.openApp) throw new Error('ต้องเปิดในเดสก์ท็อปแอป (Electron) เท่านั้น');
      await bridge.openApp(target);
      return { title: 'เปิดโปรแกรม', big: target, lines: ['ส่งคำสั่งไปยังระบบแล้ว'] };
    },
  },

  system_info: {
    emoji: '📊',
    label: 'ข้อมูลเครื่อง',
    desc: 'แบตเตอรี่ เครือข่าย หน่วยความจำ',
    params: {},
    async run() {
      const lines = [];
      if (navigator.getBattery) {
        const b = await navigator.getBattery();
        lines.push(`แบตเตอรี่ ${Math.round(b.level * 100)}%${b.charging ? ' (กำลังชาร์จ)' : ''}`);
      }
      const conn = navigator.connection;
      if (conn) lines.push(`เครือข่าย ${conn.effectiveType || '—'} ${conn.downlink ? `~${conn.downlink} Mbps` : ''}`);
      if (navigator.deviceMemory) lines.push(`RAM ~${navigator.deviceMemory} GB`);
      lines.push(`จอ ${window.innerWidth}×${window.innerHeight} · DPR ${window.devicePixelRatio}`);
      return { title: 'ข้อมูลเครื่อง', big: navigator.onLine ? 'ออนไลน์' : 'ออฟไลน์', lines };
    },
  },
};

export const TOOL_IDS = Object.keys(TOOLS);

/** category = what kind of access, risk = 0 read … 3 device control */
export const TOOL_META = {
  weather: { category: 'read', risk: 0 },
  air: { category: 'read', risk: 0 },
  crypto: { category: 'read', risk: 0 },
  fx: { category: 'read', risk: 0 },
  gold: { category: 'read', risk: 0 },
  wiki: { category: 'read', risk: 0 },
  news: { category: 'read', risk: 0 },
  calc: { category: 'read', risk: 0 },
  system_info: { category: 'read', risk: 0 },
  memory_search: { category: 'memory', risk: 0 },
  memory_save: { category: 'memory', risk: 0 },
  note: { category: 'memory', risk: 0 },
  todo: { category: 'memory', risk: 0 },
  timer: { category: 'act', risk: 1 },
  reminder: { category: 'act', risk: 1 },
  clipboard_copy: { category: 'act', risk: 1 },
  open_url: { category: 'act', risk: 1 },
  compose_message: { category: 'message', risk: 2 },
  open_app: { category: 'control', risk: 3 },
};

export function toolMeta(id) {
  return TOOL_META[id] || { category: 'read', risk: 0 };
}

/** Compact tool list for the system prompt. */
export function describeTools() {
  return TOOL_IDS.map((id) => {
    const t = TOOLS[id];
    const p = Object.keys(t.params || {}).join(', ') || 'ไม่มี';
    const m = toolMeta(id);
    return `- ${id} [${m.category}/risk${m.risk}]: ${t.desc} | params: ${p}`;
  }).join('\n');
}

/** Execute a tool and return { tool, data } or throw. */
export async function runTool(name, args = {}, ctx = {}) {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`ไม่มีเครื่องมือชื่อ "${name}"`);
  ctx.onStart?.(name);
  try {
    const data = await tool.run(args, ctx);
    return { tool: name, data };
  } finally {
    ctx.onEnd?.(name);
  }
}

/** Parse a ```tool {...}``` block out of an AI reply. */
export function extractToolCall(text) {
  const m = /```(?:tool|json)\s*([\s\S]*?)```/.exec(text || '');
  if (!m) return null;
  try {
    const obj = JSON.parse(m[1].trim());
    if (obj && obj.tool) return { name: obj.tool, args: obj.args || obj.arguments || {} };
  } catch {}
  return null;
}

export function stripToolCalls(text) {
  return String(text || '').replace(/```(?:tool|json)\s*[\s\S]*?```/g, '').trim();
}

/** Open a URL in both browser and native hosts. */
function openExternal(url) {
  const bridge = globalThis.no7?.native;
  if (bridge?.openExternal) { bridge.openExternal(url); return true; }
  const w = globalThis.open?.(url, '_blank', 'noopener');
  if (!w) globalThis.location?.assign(url);
  return true;
}

async function copyText(text) {
  const bridge = globalThis.no7?.native;
  if (bridge?.copy) return bridge.copy(text);
  if (globalThis.navigator?.clipboard?.writeText) return globalThis.navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

function scheduleReminder({ label, when }) {
  const delay = Math.max(0, when - Date.now());
  if (delay > 2 ** 31 - 1) return; // >24 days: ไม่ตั้งในรอบนี้
  setTimeout(() => {
    globalThis.dispatchEvent(new CustomEvent('no7:timer', { detail: { label } }));
    if (globalThis.Notification?.permission === 'granted') new Notification('No7 AI', { body: label });
  }, delay);
}

/** Re-arm reminders saved in a previous session. */
export function restoreReminders() {
  try {
    const list = JSON.parse(localStorage.getItem('no7.reminders.v1') || '[]');
    for (const r of list) if (r.when > Date.now()) scheduleReminder(r);
  } catch {}
}

function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}
function fmtDuration(s) {
  if (s < 60) return `${s} วินาที`;
  const m = Math.floor(s / 60);
  return `${m} นาที${s % 60 ? ` ${s % 60} วินาที` : ''}`;
}
function weatherText(code) {
  const map = { 0: 'ฟ้าใส', 1: 'แดดจัด', 2: 'มีเมฆบางส่วน', 3: 'เมฆมาก', 45: 'หมอก', 48: 'หมอกน้ำแข็ง', 51: 'ฝนปรอย', 53: 'ฝนปรอย', 55: 'ฝนปรอยหนัก', 61: 'ฝนเล็กน้อย', 63: 'ฝนปานกลาง', 65: 'ฝนหนัก', 71: 'หิมะ', 80: 'ฝนซู่', 81: 'ฝนซู่', 82: 'ฝนซู่หนัก', 95: 'พายุฝนฟ้าคะนอง', 96: 'พายุฝนฟ้าคะนอง', 99: 'พายุฝนฟ้าคะนอง' };
  return map[code] || 'ไม่ทราบสภาพอากาศ';
}
function aqiText(aqi) {
  if (aqi <= 50) return 'ดีมาก';
  if (aqi <= 100) return 'ปานกลาง';
  if (aqi <= 150) return 'เริ่มมีผลต่อสุขภาพ (ใส่หน้ากาก)';
  if (aqi <= 200) return ' unhealthy — ลดกิจกรรมกลางแจ้ง';
  return 'อันตราย — อยู่ในบ้าน';
}
