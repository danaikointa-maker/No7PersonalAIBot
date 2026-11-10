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
};

export const TOOL_IDS = Object.keys(TOOLS);

/** Compact tool list for the system prompt. */
export function describeTools() {
  return TOOL_IDS.map((id) => {
    const t = TOOLS[id];
    const p = Object.keys(t.params || {}).join(', ') || 'ไม่มี';
    return `- ${id}: ${t.desc} | params: ${p}`;
  }).join('\n');
}

/** Execute a tool and return { tool, data } or throw. */
export async function runTool(name, args = {}, ctx = {}) {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`ไม่มีเครื่องมือชื่อ "${name}"`);
  ctx.onStart?.(name);
  try {
    const data = await tool.run(args);
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
