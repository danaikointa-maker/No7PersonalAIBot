import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = (() => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
})();

const { parseIcs, toIcs, CalendarStore, formatWhen } = await import('../web/src/core/calendar.js');
const { parseWhen } = await import('../web/src/core/tools.js');

const ICS = `BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:abc-123\r
SUMMARY:ประชุมทีม\r
DTSTART:20261112T070000Z\r
DTEND:20261112T080000Z\r
LOCATION:ห้อง 3\r
DESCRIPTION:คุยเรื่อง roadmap\\nและงบประมาณ\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:abc-124\r
SUMMARY:วันเกิดแม่\r
DTSTART;VALUE=DATE:20261120\r
END:VEVENT\r
END:VCALENDAR\r
`;

const fresh = () => { localStorage.clear(); return new CalendarStore(); };

test('parseIcs reads two events with dates, location and notes', () => {
  const events = parseIcs(ICS);
  assert.equal(events.length, 2);
  assert.equal(events[0].title, 'ประชุมทีม');
  assert.equal(events[0].uid, 'abc-123');
  assert.equal(events[0].location, 'ห้อง 3');
  assert.ok(events[0].notes.includes('roadmap'));
  assert.equal(events[0].allDay, false);
  assert.equal(events[1].allDay, true);
  assert.ok(events[1].start > 0);
});

test('toIcs round-trips through parseIcs', () => {
  const events = parseIcs(ICS);
  const again = parseIcs(toIcs(events));
  assert.equal(again.length, 2);
  assert.equal(again[0].title, 'ประชุมทีม');
  assert.equal(again[0].start, events[0].start);
});

test('add keeps events sorted and de-duplicates by title+start', () => {
  const cal = fresh();
  const now = Date.now();
  cal.add({ title: 'B', start: now + 7200000 });
  cal.add({ title: 'A', start: now + 3600000 });
  cal.add({ title: 'A', start: now + 3600000 });
  const all = cal.all();
  assert.equal(all.length, 2);
  assert.equal(all[0].title, 'A');
});

test('add rejects invalid time', () => {
  const cal = fresh();
  assert.throws(() => cal.add({ title: 'x', start: 'not-a-date' }), /เวลาเริ่มไม่ถูกต้อง/);
});

test('importIcs skips duplicates on second import', () => {
  const cal = fresh();
  const first = cal.importIcs(ICS);
  const second = cal.importIcs(ICS);
  assert.equal(first.added, 2);
  assert.equal(second.added, 0);
  assert.equal(cal.all().length, 2);
});

test('upcoming filters by window and limit', () => {
  const cal = fresh();
  const now = Date.now();
  cal.add({ title: 'soon', start: now + 60000 });
  cal.add({ title: 'later', start: now + 10 * 86400000 });
  const up = cal.upcoming({ days: 7, now });
  assert.deepEqual(up.map((e) => e.title), ['soon']);
  assert.equal(cal.upcoming({ days: 30, now }).length, 2);
});

test('remove deletes by uid', () => {
  const cal = fresh();
  const ev = cal.add({ title: 'x', start: Date.now() + 60000 });
  assert.equal(cal.remove(ev.uid), true);
  assert.equal(cal.remove('nope'), false);
  assert.equal(cal.all().length, 0);
});

test('replaceAll persists a merged list', () => {
  const cal = fresh();
  cal.replaceAll([{ uid: 'u1', title: 'z', start: Date.now() }, { bad: true }]);
  assert.equal(cal.all().length, 1);
  const reloaded = new CalendarStore();
  assert.equal(reloaded.all().length, 1);
});

test('parseWhen understands relative, ISO, date-time and HH:mm', () => {
  const rel = parseWhen('+30');
  assert.ok(rel > Date.now() + 29 * 60000 && rel < Date.now() + 31 * 60000);
  assert.ok(parseWhen('+2h') > Date.now() + 119 * 60000);
  assert.equal(new Date(parseWhen('2026-11-12 14:30')).getHours(), 14);
  assert.ok(parseWhen('2026-11-12T14:30:00Z') > 0);
  const hm = new Date(parseWhen('09:15'));
  assert.equal(hm.getHours(), 9);
  assert.equal(parseWhen('ไม่ใช่เวลา'), null);
});

test('formatWhen labels today and tomorrow', () => {
  assert.match(formatWhen(Date.now()), /วันนี้/);
  assert.match(formatWhen(Date.now() + 86400000), /พรุ่งนี้/);
  assert.equal(formatWhen(null), '');
});
