function localDateBoundary(value, inclusiveEnd = false) {
  if (value === '' || value === undefined || value === null) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  if (inclusiveEnd) date.setDate(date.getDate() + 1);
  return date.getTime();
}

export function filterConversationLog(log, { query = '', role = 'all', dateFrom = '', dateTo = '', limit = 50 } = {}) {
  const normalizedQuery = String(query).trim().toLocaleLowerCase();
  const from = localDateBoundary(dateFrom);
  const toExclusive = localDateBoundary(dateTo, true);
  const invalidRange = from === null || toExclusive === null || (from !== undefined && toExclusive !== undefined && from >= toExclusive);
  const rows = (Array.isArray(log) ? log : [])
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item)
      && ['user', 'assistant'].includes(item.role) && typeof item.text === 'string'
      && item.text.trim() && Number.isFinite(Number(item.ts)) && Number(item.ts) > 0 && Number(item.ts) <= 8.64e15)
    .map(({ role: itemRole, text, ts }) => ({ role: itemRole, text: text.slice(0, 2000), ts: Math.trunc(Number(ts)) }))
    .filter((item) => !invalidRange && (role === 'all' || item.role === role)
      && (from === undefined || item.ts >= from)
      && (toExclusive === undefined || item.ts < toExclusive)
      && (!normalizedQuery || item.text.toLocaleLowerCase().includes(normalizedQuery)))
    .sort((a, b) => b.ts - a.ts);
  const size = Math.max(1, Math.min(800, Math.trunc(Number(limit) || 50)));
  return { items: rows.slice(0, size), total: rows.length, hasMore: rows.length > size };
}

export function mountConversationArchive(root, getLog, getLang = () => 'th') {
  if (!root) return () => {};
  root.innerHTML = '<h3 data-archive-title></h3><p class="hint" data-archive-privacy></p>'
    + '<div class="row"><input type="search" data-archive-query autocomplete="off" />'
    + '<select data-archive-role><option value="all"></option><option value="user"></option><option value="assistant"></option></select></div>'
    + '<div class="row archive-date-filter"><label data-archive-from-label><span></span><input type="date" data-archive-from /></label>'
    + '<label data-archive-to-label><span></span><input type="date" data-archive-to /></label></div>'
    + '<p class="hint" data-archive-status role="status"></p><div data-archive-list></div>'
    + '<button type="button" data-archive-more hidden></button>';
  const query = root.querySelector('[data-archive-query]');
  const role = root.querySelector('[data-archive-role]');
  const dateFrom = root.querySelector('[data-archive-from]');
  const dateTo = root.querySelector('[data-archive-to]');
  const status = root.querySelector('[data-archive-status]');
  const list = root.querySelector('[data-archive-list]');
  const more = root.querySelector('[data-archive-more]');
  let limit = 50;

  function render() {
    const english = String(getLang()).toLowerCase().startsWith('en');
    const text = english
      ? { title: '💬 Conversation archive', privacy: 'Stored on this device only. Search does not send messages to AI or the network.', search: 'Search saved messages…', from: 'From date', to: 'Through date', all: 'All speakers', user: 'You', assistant: 'No7', empty: 'No matching saved messages.', shown: (count, total) => `Showing ${count} of ${total}`, capped: (count, total) => `Showing latest ${count} of ${total}; memory stores up to 800 messages.`, more: 'Load 50 more' }
      : { title: '💬 ประวัติบทสนทนา', privacy: 'เก็บในเครื่องนี้เท่านั้น การค้นหาไม่ส่งข้อความให้ AI หรือเครือข่าย', search: 'ค้นหาข้อความที่บันทึก…', from: 'ตั้งแต่วันที่', to: 'ถึงวันที่', all: 'ทุกคน', user: 'ผู้ใช้', assistant: 'No7', empty: 'ไม่พบข้อความที่ตรงกัน', shown: (count, total) => `แสดง ${count} จาก ${total} ข้อความ`, capped: (count, total) => `แสดง ${count} จาก ${total} ข้อความ (ความจำเก็บได้สูงสุด 800 ข้อความ)`, more: 'โหลดเพิ่ม 50 ข้อความ' };
    root.setAttribute('aria-label', text.title);
    root.querySelector('[data-archive-title]').textContent = text.title;
    root.querySelector('[data-archive-privacy]').textContent = text.privacy;
    query.placeholder = text.search;
    query.setAttribute('aria-label', text.search);
    role.setAttribute('aria-label', text.all);
    role.options[0].textContent = text.all;
    role.options[1].textContent = text.user;
    role.options[2].textContent = text.assistant;
    root.querySelector('[data-archive-from-label] span').textContent = text.from;
    root.querySelector('[data-archive-to-label] span').textContent = text.to;
    dateFrom.setAttribute('aria-label', text.from);
    dateTo.setAttribute('aria-label', text.to);
    const result = filterConversationLog(getLog(), { query: query.value, role: role.value, dateFrom: dateFrom.value, dateTo: dateTo.value, limit });
    const capped = result.hasMore && limit >= 800;
    status.textContent = result.total ? (capped ? text.capped(result.items.length, result.total) : text.shown(result.items.length, result.total)) : text.empty;
    list.replaceChildren();
    for (const item of result.items) {
      const row = document.createElement('article');
      row.className = `chat-archive-entry ${item.role}`;
      const header = document.createElement('div');
      header.className = 'chat-archive-meta';
      const speaker = document.createElement('strong');
      speaker.textContent = item.role === 'user' ? text.user : text.assistant;
      const time = document.createElement('time');
      time.dateTime = new Date(item.ts).toISOString();
      time.textContent = new Date(item.ts).toLocaleString();
      header.append(speaker, time);
      const body = document.createElement('p');
      body.className = 'chat-archive-text';
      body.textContent = item.text;
      row.append(header, body);
      list.appendChild(row);
    }
    more.hidden = !result.hasMore || limit >= 800;
    more.textContent = text.more;
  }
  query.addEventListener('input', () => { limit = 50; render(); });
  role.addEventListener('change', () => { limit = 50; render(); });
  dateFrom.addEventListener('change', () => { limit = 50; render(); });
  dateTo.addEventListener('change', () => { limit = 50; render(); });
  more.addEventListener('click', () => { limit = Math.min(800, limit + 50); render(); });
  render();
  return render;
}
