function localDateKey(date) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function conversationDatePresetRange(preset, now = new Date()) {
  if (preset === 'all' || preset === 'custom') return { dateFrom: '', dateTo: '' };
  const daysBack = preset === 'today' ? 0 : preset === '7days' ? 6 : preset === '30days' ? 29 : null;
  const current = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (daysBack === null || !Number.isFinite(current.getTime())) return { dateFrom: '', dateTo: '' };
  const end = new Date(current.getFullYear(), current.getMonth(), current.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - daysBack);
  return { dateFrom: localDateKey(start), dateTo: localDateKey(end) };
}

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

export function filterConversationLog(log, { query = '', role = 'all', dateFrom = '', dateTo = '', offset = 0, limit = 50 } = {}) {
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
  const size = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 50)));
  const start = Math.max(0, Math.trunc(Number(offset) || 0));
  const items = rows.slice(start, start + size);
  return { items, total: rows.length, offset: start, hasPrevious: start > 0, hasMore: start + items.length < rows.length };
}

export function mountConversationArchive(root, getLog, getLang = () => 'th') {
  if (!root) return () => {};
  root.innerHTML = '<h3 data-archive-title></h3><p class="hint" data-archive-privacy></p>'
    + '<div class="row"><input type="search" data-archive-query autocomplete="off" />'
    + '<select data-archive-role><option value="all"></option><option value="user"></option><option value="assistant"></option></select></div>'
    + '<div class="row archive-date-filter"><label data-archive-preset-label><span></span><select data-archive-preset>'
    + '<option value="all"></option><option value="today"></option><option value="7days"></option><option value="30days"></option><option value="custom"></option></select></label>'
    + '<label data-archive-from-label><span></span><input type="date" data-archive-from /></label>'
    + '<label data-archive-to-label><span></span><input type="date" data-archive-to /></label></div>'
    + '<p class="hint" data-archive-status role="status"></p><div data-archive-list></div>'
    + '<div class="row archive-pagination"><button type="button" data-archive-newer hidden></button>'
    + '<button type="button" data-archive-older hidden></button></div>';
  const query = root.querySelector('[data-archive-query]');
  const role = root.querySelector('[data-archive-role]');
  const dateFrom = root.querySelector('[data-archive-from]');
  const dateTo = root.querySelector('[data-archive-to]');
  const preset = root.querySelector('[data-archive-preset]');
  const status = root.querySelector('[data-archive-status]');
  const list = root.querySelector('[data-archive-list]');
  const newer = root.querySelector('[data-archive-newer]');
  const older = root.querySelector('[data-archive-older]');
  const pageSize = 50;
  let offset = 0;

  function render() {
    const english = String(getLang()).toLowerCase().startsWith('en');
    const text = english
      ? { title: '💬 Conversation archive', privacy: 'Stored on this device only. Search does not send messages to AI or the network.', search: 'Search saved messages…', from: 'From date', to: 'Through date', preset: 'Quick date range', presets: ['Any date', 'Today', 'Last 7 days', 'Last 30 days', 'Custom range'], all: 'All speakers', user: 'You', assistant: 'No7', empty: 'No matching saved messages.', shown: (start, end, total) => `Showing ${start}–${end} of ${total}`, newer: 'Newer 50', older: 'Older 50' }
      : { title: '💬 ประวัติบทสนทนา', privacy: 'เก็บในเครื่องนี้เท่านั้น การค้นหาไม่ส่งข้อความให้ AI หรือเครือข่าย', search: 'ค้นหาข้อความที่บันทึก…', from: 'ตั้งแต่วันที่', to: 'ถึงวันที่', preset: 'ช่วงวันที่ด่วน', presets: ['ทุกช่วง', 'วันนี้', '7 วันล่าสุด', '30 วันล่าสุด', 'กำหนดเอง'], all: 'ทุกคน', user: 'ผู้ใช้', assistant: 'No7', empty: 'ไม่พบข้อความที่ตรงกัน', shown: (start, end, total) => `แสดง ${start}–${end} จาก ${total} ข้อความ`, newer: 'ใหม่กว่า 50 ข้อความ', older: 'เก่ากว่า 50 ข้อความ' };
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
    root.querySelector('[data-archive-preset-label] span').textContent = text.preset;
    preset.setAttribute('aria-label', text.preset);
    [...preset.options].forEach((option, index) => { option.textContent = text.presets[index]; });
    dateFrom.setAttribute('aria-label', text.from);
    dateTo.setAttribute('aria-label', text.to);
    const filters = { query: query.value, role: role.value, dateFrom: dateFrom.value, dateTo: dateTo.value, limit: pageSize };
    let result = filterConversationLog(getLog(), { ...filters, offset });
    if (result.total && offset >= result.total) {
      offset = Math.floor((result.total - 1) / pageSize) * pageSize;
      result = filterConversationLog(getLog(), { ...filters, offset });
    } else if (!result.total) offset = 0;
    status.textContent = result.total
      ? text.shown(result.offset + 1, result.offset + result.items.length, result.total)
      : text.empty;
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
    newer.hidden = !result.hasPrevious;
    older.hidden = !result.hasMore;
    newer.textContent = text.newer;
    older.textContent = text.older;
  }
  query.addEventListener('input', () => { offset = 0; render(); });
  role.addEventListener('change', () => { offset = 0; render(); });
  dateFrom.addEventListener('change', () => { preset.value = 'custom'; offset = 0; render(); });
  dateTo.addEventListener('change', () => { preset.value = 'custom'; offset = 0; render(); });
  preset.addEventListener('change', () => {
    const range = conversationDatePresetRange(preset.value);
    if (preset.value !== 'custom') {
      dateFrom.value = range.dateFrom;
      dateTo.value = range.dateTo;
    }
    offset = 0;
    render();
  });
  newer.addEventListener('click', () => { offset = Math.max(0, offset - pageSize); render(); });
  older.addEventListener('click', () => { offset += pageSize; render(); });
  render();
  return render;
}
