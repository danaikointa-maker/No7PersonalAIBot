import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
})();
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.dispatchEvent = globalThis.dispatchEvent || (() => true);

const {
  TaskStore, TaskScheduler, parseDue, normalizeTask, mergeTaskLists, formatTaskTime,
  isOverdue, PRIORITIES, TASKS_KEY, normalizeRecurrence, nextOccurrence, describeRecurrence,
  RECURRENCE_FREQS, WEEKDAYS_TH,
} = await import('../web/src/core/tasks.js');
const { runTool } = await import('../web/src/core/tools.js');

const NOW = new Date('2026-11-10T10:00:00+07:00').getTime();

test('parseDue understands ISO, relative and Thai keywords', () => {
  assert.equal(parseDue('2026-11-11T09:00:00', NOW), new Date('2026-11-11T09:00:00').toISOString());
  assert.equal(parseDue('+30m', NOW), new Date(NOW + 30 * 60_000).toISOString());
  assert.equal(parseDue('+2h', NOW), new Date(NOW + 2 * 3600_000).toISOString());
  assert.equal(parseDue('+3d', NOW), new Date(NOW + 3 * 86400_000).toISOString());
  assert.equal(parseDue('+45 นาที', NOW), new Date(NOW + 45 * 60_000).toISOString());
  assert.equal(parseDue('วันนี้ 18:00', NOW), new Date(new Date(NOW).setHours(18, 0, 0, 0)).toISOString());
  const tomorrow = new Date(NOW);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 30, 0, 0);
  assert.equal(parseDue('พรุ่งนี้ 09:30', NOW), tomorrow.toISOString());
  assert.equal(parseDue('', NOW), null);
  assert.equal(parseDue('ไม่รู้', NOW), null);
  assert.equal(parseDue(new Date(NOW), NOW), new Date(NOW).toISOString());
});

test('parseDue with time-only rolls to tomorrow when past', () => {
  const at = parseDue('09:00', NOW);
  const d = new Date(at);
  assert.equal(d.getHours(), 9);
  assert.ok(d.getTime() > NOW);
});

test('normalizeTask clamps fields and keeps ids', () => {
  const t = normalizeTask({ id: 'abc', title: '  ส่งรายงาน ', priority: 9, tags: Array(20).fill('x'), due: '+1h', createdAt: NOW }, NOW);
  assert.equal(t.id, 'abc');
  assert.equal(t.title, 'ส่งรายงาน');
  assert.equal(t.priority, 3);
  assert.equal(t.tags.length, 8);
  assert.equal(t.due, new Date(NOW + 3600_000).toISOString());
  assert.equal(t.createdAt, NOW);
  assert.equal(normalizeTask({ title: '   ' }), null);
});

test('TaskStore add/list/update/complete/remove', () => {
  localStorage.clear();
  let now = NOW;
  const store = new TaskStore({ now: () => now });
  const a = store.add({ title: 'งาน A', due: '+1h', priority: 2 });
  const b = store.add({ title: 'งาน B', due: '+2d' });
  assert.equal(store.list({ done: false }).length, 2);
  assert.equal(store.list()[0].title, 'งาน A', 'เรียงตามเวลาที่ใกล้ที่สุด');
  assert.equal(store.get(a.id).priority, 2);
  assert.equal(store.update(a.id, { title: 'งาน A2', due: '+3h' }).title, 'งาน A2');
  assert.equal(store.update('missing', { title: 'x' }), null);
  assert.equal(store.remove('missing'), false);

  now += 1000;
  store.complete(b.id);
  assert.equal(store.list({ done: true }).length, 1);
  const stats = store.stats();
  assert.equal(stats.total, 2);
  assert.equal(stats.open, 1);
  assert.equal(stats.done, 1);
  assert.ok(localStorage.getItem(TASKS_KEY).includes('งาน A2'));
  assert.equal(store.remove(a.id), true);
  assert.equal(store.list().length, 1, 'tombstone ไม่ถูกนับ');
  assert.equal(store.exportData().tasks.find((t) => t.id === a.id).deleted, true, 'ต้องส่ง tombstone ไปซิงก์');
});

test('TaskStore dueNow + markNotified fires once', () => {
  localStorage.clear();
  let now = NOW;
  const store = new TaskStore({ now: () => now });
  const soon = store.add({ title: 'ด่วน', due: '+1m' });
  store.add({ title: 'อีกนาน', due: '+2d' });
  assert.deepEqual(store.dueNow(now).map((t) => t.id), []);
  now += 2 * 60_000;
  const due = store.dueNow(now);
  assert.deepEqual(due.map((t) => t.id), [soon.id]);
  store.markNotified(soon.id, now);
  assert.deepEqual(store.dueNow(now), []);
});

test('isOverdue and formatTaskTime read naturally', () => {
  const overdue = { due: new Date(NOW - 3600_000).toISOString(), done: false };
  assert.equal(isOverdue(overdue, NOW), true);
  assert.equal(isOverdue({ ...overdue, done: true }, NOW), false);
  assert.equal(formatTaskTime(new Date(NOW).toISOString(), NOW), `วันนี้ ${String(new Date(NOW).getHours()).padStart(2, '0')}:${String(new Date(NOW).getMinutes()).padStart(2, '0')}`);
  assert.match(formatTaskTime(new Date(NOW + 86400_000).toISOString(), NOW), /^พรุ่งนี้/);
  assert.equal(formatTaskTime(null), 'ไม่กำหนดเวลา');
  assert.match(formatTaskTime('2027-01-05T08:00:00', NOW), /5 ม.ค./);
});

test('mergeTaskLists is last-write-wins and honours tombstones', () => {
  const mine = [{ id: 'a', title: 'ของฉัน', updatedAt: 100, createdAt: 10 }];
  const remote = [
    { id: 'a', title: 'ของเครื่องโน้น', updatedAt: 200, createdAt: 10 },
    { id: 'b', title: 'ใหม่', updatedAt: 150, createdAt: 150 },
    { id: 'c', title: 'ลบแล้ว', updatedAt: 300, createdAt: 20, deleted: true },
  ];
  const res = mergeTaskLists(mine, remote);
  assert.equal(res.tasks.find((t) => t.id === 'a').title, 'ของเครื่องโน้น');
  assert.equal(res.added, 2);
  assert.equal(res.updated, 1);
  assert.ok(res.tasks.find((t) => t.id === 'c').deleted);

  const stale = mergeTaskLists([{ id: 'a', title: 'ใหม่กว่า', updatedAt: 500, createdAt: 1 }], [{ id: 'a', title: 'เก่า', updatedAt: 100 }]);
  assert.equal(stale.tasks[0].title, 'ใหม่กว่า');
  assert.equal(stale.updated, 0);
});

test('TaskStore.merge imports remote work and reports changes', () => {
  localStorage.clear();
  const store = new TaskStore({ now: () => NOW });
  store.add({ title: 'งานเดิม' });
  const res = store.merge([
    { id: 'r1', title: 'งานจากมือถือ', createdAt: NOW, updatedAt: NOW },
    { id: 'r2', title: 'งานที่ถูกลบ', createdAt: NOW, updatedAt: NOW, deleted: true },
  ]);
  assert.equal(res.added, 2);
  assert.equal(res.changed, 2);
  assert.equal(store.list().length, 2, 'งานเดิม + งานใหม่ (tombstone ไม่แสดง)');
});

test('TaskScheduler fires once per due task and can stop', () => {
  localStorage.clear();
  let now = NOW;
  const store = new TaskStore({ now: () => now });
  store.add({ title: 'ถึงเวลาแล้ว', due: '+1m' });
  const seen = [];
  const timers = [];
  const scheduler = new TaskScheduler({
    store,
    now: () => now,
    onDue: (t) => seen.push(t.title),
    setIntervalFn: (fn, ms) => { timers.push({ fn, ms }); return 1; },
    clearIntervalFn: () => { timers.length = 0; },
  });
  scheduler.start();
  assert.equal(scheduler.running, true);
  assert.deepEqual(seen, []);
  now += 120_000;
  timers[0].fn();
  assert.deepEqual(seen, ['ถึงเวลาแล้ว']);
  timers[0].fn();
  assert.deepEqual(seen, ['ถึงเวลาแล้ว'], 'ต้องไม่เตือนซ้ำ');
  scheduler.stop();
  assert.equal(scheduler.running, false);
  assert.equal(timers.length, 0);
  assert.equal(PRIORITIES[3].label, 'ด่วนมาก');
});

test('task tool adds, lists, completes and removes', async () => {
  localStorage.clear();
  const before = Date.now();
  const added = await runTool('task', { action: 'add', title: 'ประชุมทีม', when: '+30m', priority: 2 }, {});
  assert.equal(added.tool, 'task');
  assert.equal(added.data.title, 'เพิ่มงานแล้ว');
  const idLine = added.data.lines.find((l) => l.startsWith('id: '));
  const id = idLine.replace('id: ', '');

  const list = await runTool('task', { action: 'list', filter: 'open' }, {});
  assert.equal(list.data.big, '1 งาน');
  assert.ok(list.data.lines.some((l) => l.includes('ประชุมทีม')));

  const done = await runTool('task', { action: 'done', id }, {});
  assert.equal(done.data.title, 'ปิดงานแล้ว');

  const empty = await runTool('task', { action: 'list' }, {});
  assert.equal(empty.data.big, 'ไม่มีงานค้าง 🎉');

  const removed = await runTool('task', { action: 'remove', id }, {});
  assert.equal(removed.data.title, 'ลบงานแล้ว');

  await assert.rejects(() => runTool('task', { action: 'add', title: '' }, {}), /ต้องบอกว่า/);
  await assert.rejects(() => runTool('task', { action: 'add', title: 'x', when: 'เมื่อไหร่ก็ไม่รู้' }, {}), /อ่านเวลา/);
  await assert.rejects(() => runTool('task', { action: 'done', id: 'nope' }, {}), /ไม่พบงาน/);
  assert.ok(Date.now() - before < 5000);
});

test('sync bundle carries tasks both ways', async () => {
  const { collectBundle, mergeBundle } = await import('../web/src/core/sync.js');
  localStorage.clear();
  const store = new TaskStore({ now: () => NOW });
  store.add({ title: 'งานซิงก์' });
  const bundle = collectBundle({ memory: null, calendar: [], settings: {} });
  assert.equal(bundle.tasks.length, 1);
  assert.equal(bundle.tasks[0].title, 'งานซิงก์');

  localStorage.clear();
  const merged = mergeBundle(bundle, { memory: null, calendar: null });
  assert.equal(merged.tasks, 1);
  assert.equal(new TaskStore().list()[0].title, 'งานซิงก์');
});

test('normalizeRecurrence validates input', () => {
  assert.equal(normalizeRecurrence(null), null);
  assert.deepEqual(normalizeRecurrence('daily'), { freq: 'daily', interval: 1, weekday: null, at: '' });
  assert.deepEqual(normalizeRecurrence({ freq: 'weekly', weekday: 1, interval: 2 }), { freq: 'weekly', interval: 2, weekday: 1, at: '' });
  assert.equal(normalizeRecurrence({ freq: 'nope' }), null);
  assert.equal(normalizeRecurrence({ freq: 'daily', interval: -5 }).interval, 1);
  assert.equal(normalizeRecurrence({ freq: 'daily', interval: 999 }).interval, 90);
  assert.equal(normalizeRecurrence({ freq: 'weekly', weekday: 9 }).weekday, null);
});

test('nextOccurrence covers daily, weekdays, weekly, hourly, monthly', () => {
  const tue = Date.parse('2026-11-10T10:00:00+07:00');
  assert.equal(nextOccurrence(tue, 'daily', tue), new Date(new Date(tue).setDate(new Date(tue).getDate() + 1)).toISOString().replace(/T.*/, 'T03:00:00.000Z'));
  const sat = Date.parse('2026-11-14T10:00:00+07:00');
  const fromSat = nextOccurrence(sat, 'weekdays', sat);
  assert.equal(new Date(fromSat).getDay(), 1, 'ศุกร์→จันทร์');
  const monday = Date.parse('2026-11-16T09:00:00+07:00');
  assert.equal(new Date(nextOccurrence(monday, { freq: 'weekly', weekday: 1 }, monday)).getDay(), 1);
  assert.equal(nextOccurrence(monday, { freq: 'weekly', weekday: 1 }, monday), new Date(monday + 7 * 86400_000).toISOString());
  assert.equal(nextOccurrence(tue, { freq: 'hourly', interval: 3 }, tue), new Date(tue + 3 * 3600_000).toISOString());
  assert.match(nextOccurrence(tue, 'monthly', tue), /^2026-12-10/);
  assert.equal(nextOccurrence(tue, { freq: 'nope' }), null);
});

test('describeRecurrence reads in Thai', () => {
  assert.equal(describeRecurrence('weekdays'), 'วันจันทร์–ศุกร์');
  assert.equal(describeRecurrence({ freq: 'weekly', weekday: 1 }), 'ทุกสัปดาห์ (จันทร์)');
  assert.match(describeRecurrence({ freq: 'hourly', interval: 4 }), /ทุก 4 ชั่วโมง/);
  assert.equal(describeRecurrence(null), '');
  assert.equal(WEEKDAYS_TH[1], 'จันทร์');
  assert.ok(RECURRENCE_FREQS.monthly);
});

test('recurring task add + complete advances instead of closing', () => {
  localStorage.clear();
  let now = Date.parse('2026-11-10T10:00:00+07:00');
  const store = new TaskStore({ now: () => now });
  const task = store.add({ title: 'ออกกำลังกาย', recurrence: 'daily' });
  assert.equal(task.done, false);
  assert.equal(task.recurrence.freq, 'daily');
  assert.ok(Date.parse(task.due) > now, 'ต้องมีเวลารอบแรกอัตโนมัติ');

  const firstDue = task.due;
  now += 3600_000;
  const res = store.complete(task.id);
  assert.equal(res.advanced, true);
  assert.equal(res.task.done, false, 'งานซ้ำไม่ถูกปิด');
  assert.notEqual(res.task.due, firstDue);
  assert.equal(res.task.repeatCount, 1);
  assert.equal(res.task.notifiedAt, null, 'ต้องเตือนรอบใหม่ได้');
  assert.equal(store.list({ done: true }).length, 0);

  const plain = store.add({ title: 'งานครั้งเดียว' });
  const closed = store.complete(plain.id);
  assert.equal(closed.advanced, false);
  assert.equal(closed.task.done, true);
  assert.equal(store.complete('missing').task, null);
});

test('task tool accepts repeat and reports the next round', async () => {
  localStorage.clear();
  const added = await runTool('task', { action: 'add', title: 'จ่ายบิล', when: '+1h', repeat: 'monthly' }, {});
  assert.ok(added.data.lines.some((l) => l.includes('🔁')));
  const id = added.data.lines.find((l) => l.startsWith('id: ')).replace('id: ', '');
  const done = await runTool('task', { action: 'done', id }, {});
  assert.match(done.data.title, /งานซ้ำ/);
  await assert.rejects(() => runTool('task', { action: 'add', title: 'x', repeat: 'ทุกเมื่อ' }, {}), /ไม่รู้จักการทำซ้ำ/);
});
