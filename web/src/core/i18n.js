// i18n — UI สองภาษา (ไทย / อังกฤษ) โดยไม่ต้องโหลดไฟล์ภายนอก
// หลักการ: ข้อความไทยอยู่ใน HTML อยู่แล้ว (ใช้ได้แม้ JS ปิด) แล้ว i18n จะทับด้วย data-i18n
// เมื่อผู้ใช้เลือกภาษาอังกฤษ — ไม่ต้องรีโหลดหน้า และไม่กระทบภาษาที่ AI ใช้ตอบ

export const LANGS = {
  th: { label: 'ไทย', htmlLang: 'th' },
  en: { label: 'English', htmlLang: 'en' },
};

export const DEFAULT_LANG = 'th';

/** คีย์ที่ใช้ใน UI — th/en ต้องมีครบเท่ากัน (มี test บังคับ) */
export const DICT = {
  th: {
    'nav.chat': '💬 แชท',
    'nav.tools': '🧰 เครื่องมือ',
    'nav.memory': '🧠 ความจำ',
    'nav.calendar': '📅 ตารางนัด',
    'nav.devices': '🔗 อุปกรณ์',
    'nav.desktop': '🖥️ เดสก์ท็อป',
    'nav.settings': '⚙️ ตั้งค่า',
    'view.chat': 'แชทกับ No7',
    'view.tools': 'เครื่องมือ',
    'view.memory': 'ความจำ',
    'view.calendar': 'ตารางนัด',
    'view.devices': 'อุปกรณ์',
    'view.desktop': 'เดสก์ท็อป',
    'view.settings': 'ตั้งค่า',
    'title.tools': '🧰 เครื่องมือ',
    'title.memory': '🧠 ความจำ',
    'title.calendar': '📅 ตารางนัด',
    'title.devices': '🔗 อุปกรณ์ (Phone-Link)',
    'title.desktop': '🖥️ เดสก์ท็อป',
    'title.settings': '⚙️ ตั้งค่า',
    'chat.placeholder': 'พิมพ์หรือพูดกับ No7…',
    'chat.send': 'ส่ง',
    'chat.stop': 'หยุดพูด',
    'chat.mic': 'พูด (Push to talk)',
    'chat.companion': 'โหมดเพื่อนบนจอ (Desktop)',
    'tasks.title': '✅ งานที่ต้องทำ',
    'tasks.add': '＋ เพิ่มงาน',
    'tasks.clearDone': 'ล้างงานที่เสร็จ',
    'tasks.titlePlaceholder': 'งาน เช่น ส่งรายงาน',
    'memory.search': 'ค้นหา',
    'memory.save': 'จำไว้',
    'memory.newPlaceholder': 'สอนความจำใหม่ เช่น: ชื่อฉันคือ…',
    'memory.queryPlaceholder': 'ค้นหาความจำ…',
    'calendar.add': 'เพิ่ม',
    'calendar.titlePlaceholder': 'หัวข้อ เช่น ประชุมทีม',
    'devices.add': '＋ อุปกรณ์',
    'devices.pair': '🎲 ขอรหัสจาก server',
    'devices.test': '🔌 ทดสอบ',
    'desktop.refresh': '🔄 อ่านรายการ',
    'desktop.windows': '🪟 หน้าต่างที่เปิดอยู่',
    'desktop.recipes': '🧩 สูตรอัตโนมัติ',
    'desktop.recipeSave': '💾 บันทึกสูตร',
    'desktop.recipeTry': '🔍 ลองก่อน (dry-run)',
    'desktop.recipeRun': '▶️ รันสูตร',
    'desktop.recipeDelete': '🗑 ลบสูตร',
    'desktop.recipeNamePlaceholder': 'ชื่อสูตร เช่น โหมดทำงานเช้า',
    'settings.save': 'บันทึก',
    'settings.testAI': 'ทดสอบ AI',
    'settings.testVoice': '🔊 ทดสอบเสียง',
    'settings.stopVoice': '⏹ หยุด',
    'settings.persona': 'ผู้ช่วย (Persona)',
    'settings.voice': 'เสียงและการตอบ',
    'settings.brain': '🧠 สมองในเครื่อง (Ollama / LM Studio)',
    'settings.localScan': '🔍 ตรวจโมเดลในเครื่อง',
    'settings.localWarm': '🔥 อุ่นเครื่อง',
    'settings.localOffline': 'ใช้เมื่อออฟไลน์',
    'settings.uiLang': 'ภาษาของหน้าจอ',
    'settings.aiLang': 'ภาษาที่ AI พูด',
    'tools.auto': 'ทั้งหมด',
    'chat.greetingFallback': 'สวัสดีครับ ผม No7 พร้อมช่วยแล้ว',
    'status.offline': '⚠️ ออฟไลน์อยู่ — ความจำ/โน้ต/ปฏิทินยังใช้ได้ แต่การคุยกับ AI ต้องรอเน็ต',
    'notify.task': 'ถึงเวลางาน',
    'notify.taskPrefix': '⏰ ถึงเวลา:',
  },
  en: {
    'nav.chat': '💬 Chat',
    'nav.tools': '🧰 Tools',
    'nav.memory': '🧠 Memory',
    'nav.calendar': '📅 Calendar',
    'nav.devices': '🔗 Devices',
    'nav.desktop': '🖥️ Desktop',
    'nav.settings': '⚙️ Settings',
    'view.chat': 'Chat with No7',
    'view.tools': 'Tools',
    'view.memory': 'Memory',
    'view.calendar': 'Calendar',
    'view.devices': 'Devices',
    'view.desktop': 'Desktop',
    'view.settings': 'Settings',
    'title.tools': '🧰 Tools',
    'title.memory': '🧠 Memory',
    'title.calendar': '📅 Calendar',
    'title.devices': '🔗 Devices (Phone-Link)',
    'title.desktop': '🖥️ Desktop',
    'title.settings': '⚙️ Settings',
    'chat.placeholder': 'Type or talk to No7…',
    'chat.send': 'Send',
    'chat.stop': 'Stop speaking',
    'chat.mic': 'Talk (push to talk)',
    'chat.companion': 'Desktop companion mode',
    'tasks.title': '✅ Things to do',
    'tasks.add': '＋ Add task',
    'tasks.clearDone': 'Clear completed',
    'tasks.titlePlaceholder': 'Task, e.g. send the report',
    'memory.search': 'Search',
    'memory.save': 'Remember',
    'memory.newPlaceholder': 'Teach a new memory, e.g. my name is…',
    'memory.queryPlaceholder': 'Search memories…',
    'calendar.add': 'Add',
    'calendar.titlePlaceholder': 'Title, e.g. team meeting',
    'devices.add': '＋ Device',
    'devices.pair': '🎲 Get pairing code',
    'devices.test': '🔌 Test',
    'desktop.refresh': '🔄 Refresh',
    'desktop.windows': '🪟 Open windows',
    'desktop.recipes': '🧩 Automation recipes',
    'desktop.recipeSave': '💾 Save recipe',
    'desktop.recipeTry': '🔍 Dry-run',
    'desktop.recipeRun': '▶️ Run recipe',
    'desktop.recipeDelete': '🗑 Delete recipe',
    'desktop.recipeNamePlaceholder': 'Recipe name, e.g. morning routine',
    'settings.save': 'Save',
    'settings.testAI': 'Test AI',
    'settings.testVoice': '🔊 Test voice',
    'settings.stopVoice': '⏹ Stop',
    'settings.persona': 'Assistant (persona)',
    'settings.voice': 'Voice & replies',
    'settings.brain': '🧠 On-device brain (Ollama / LM Studio)',
    'settings.localScan': '🔍 Scan local models',
    'settings.localWarm': '🔥 Warm up',
    'settings.localOffline': 'Use when offline',
    'settings.uiLang': 'Interface language',
    'settings.aiLang': 'Language the AI speaks',
    'tools.auto': 'All',
    'chat.greetingFallback': 'Hi, I am No7 — ready to help.',
    'status.offline': '⚠️ Offline — memory/notes/calendar still work, AI replies need the network',
    'notify.task': 'Task reminder',
    'notify.taskPrefix': '⏰ Time for:',
  },
};

export function isSupportedLang(lang) {
  return !!LANGS[lang];
}

/** เลือกภาษาจากค่าที่บันทึก → ถ้าไม่รองรับ ใช้ค่าเริ่มต้น */
export function langOf(value) {
  return isSupportedLang(value) ? value : DEFAULT_LANG;
}

/** เดาจากเบราว์เซอร์ (ใช้ตอนผู้ใช้ยังไม่เคยเลือก) */
export function detectLang(navLang = '') {
  return /^en\b/i.test(String(navLang || '')) ? 'en' : DEFAULT_LANG;
}

/** แปลคีย์ → ข้อความ (คืน key ถ้าไม่พบ, แทน {var} ได้) */
export function t(key, { lang = DEFAULT_LANG, vars = {}, fallback = '' } = {}) {
  const table = DICT[langOf(lang)] || DICT[DEFAULT_LANG];
  const text = table[key] ?? DICT[DEFAULT_LANG][key] ?? (fallback || key);
  return String(text).replace(/\{(\w+)\}/g, (m, name) => (vars[name] != null ? String(vars[name]) : m));
}

/**
 * ทับข้อความใน DOM ตาม data-i18n / data-i18n-placeholder / data-i18n-title
 * @returns {number} จำนวน element ที่ถูกแก้
 */
export function applyI18n(root = null, lang = DEFAULT_LANG) {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope?.querySelectorAll) return 0;
  const target = langOf(lang);
  let count = 0;
  for (const el of scope.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n, { lang: target });
    count++;
  }
  for (const el of scope.querySelectorAll('[data-i18n-placeholder]')) {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder, { lang: target }));
    count++;
  }
  for (const el of scope.querySelectorAll('[data-i18n-title]')) {
    el.setAttribute('title', t(el.dataset.i18nTitle, { lang: target }));
    count++;
  }
  if (typeof document !== 'undefined' && scope === document) {
    document.documentElement.setAttribute('lang', LANGS[target].htmlLang);
  }
  return count;
}

/** ข้อความสำหรับ view title (ใช้ใน showView) */
export function viewTitle(view, lang = DEFAULT_LANG) {
  return t(`view.${view}`, { lang, fallback: view });
}
