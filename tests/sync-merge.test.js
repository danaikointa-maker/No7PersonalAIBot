import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYNC_STRATEGIES, DEVICE_KEY, deviceId, recordTime,
  mergeRecordSets, mergeSyncBundle, summarizeSync, describeConflicts, COLLECTION_META,
} from '../web/src/core/sync-merge.js';

const fact = (id, text, ts) => ({ id, text, ts });

test('SYNC_STRATEGIES lists the four supported strategies', () => {
  assert.deepEqual(SYNC_STRATEGIES, ['newest', 'prefer-local', 'prefer-remote', 'keep-both']);
});

test('deviceId is stable and persisted', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const first = deviceId(storage);
  assert.match(first, /^dev-[a-z0-9]{8}$/);
  assert.equal(deviceId(storage), first, 'ค่าคงที่');
  assert.equal(store.get(DEVICE_KEY), first);
});

test('deviceId falls back when storage throws', () => {
  const storage = { getItem: () => { throw new Error('nope'); }, setItem: () => { throw new Error('nope'); } };
  assert.equal(deviceId(storage), 'dev-unknown');
});

test('recordTime picks the newest known timestamp', () => {
  assert.equal(recordTime({ ts: 5, updatedAt: '1970-01-01T00:00:00.010Z' }), 10);
  assert.equal(recordTime({}), 0);
  assert.equal(recordTime({ createdAt: '2026-01-01T00:00:00.000Z' }), Date.parse('2026-01-01T00:00:00.000Z'));
});

test('newest takes the remote version when it is fresher', () => {
  const local = [fact('a', 'ของเดิม', 1000)];
  const remote = [fact('a', 'ของใหม่', 2000)];
  const res = mergeRecordSets(local, remote, { key: (f) => f.id, strategy: 'newest' });
  assert.equal(res.list.length, 1);
  assert.equal(res.list[0].text, 'ของใหม่');
  assert.deepEqual(res.stats, { added: 0, updated: 1, kept: 0, conflicts: 1 });
  assert.equal(res.conflicts[0].winner, 'remote');
});

test('newest keeps the local version when it is fresher', () => {
  const res = mergeRecordSets([fact('a', 'ของเดิม', 3000)], [fact('a', 'ของเก่า', 2000)], { key: (f) => f.id });
  assert.equal(res.list[0].text, 'ของเดิม');
  assert.equal(res.stats.kept, 1);
  assert.equal(res.stats.conflicts, 1);
});

test('prefer-local never overwrites the local copy', () => {
  const res = mergeRecordSets([fact('a', 'เครื่องนี้', 1000)], [fact('a', 'อีกเครื่อง', 9000)], { key: (f) => f.id, strategy: 'prefer-local' });
  assert.equal(res.list[0].text, 'เครื่องนี้');
  assert.equal(res.stats.kept, 1);
  assert.equal(res.conflicts[0].winner, 'local');
});

test('prefer-remote always takes the remote copy', () => {
  const res = mergeRecordSets([fact('a', 'เครื่องนี้', 9000)], [fact('a', 'อีกเครื่อง', 1000)], { key: (f) => f.id, strategy: 'prefer-remote' });
  assert.equal(res.list[0].text, 'อีกเครื่อง');
  assert.equal(res.stats.updated, 1);
});

test('keep-both stores a labelled copy', () => {
  const res = mergeRecordSets([fact('a', 'เดิม', 1000)], [fact('a', 'ใหม่', 2000)], {
    key: (f) => f.id, strategy: 'keep-both', makeId: () => 'copy1',
  });
  assert.equal(res.list.length, 2);
  const original = res.list.find((f) => f.id === 'a');
  assert.equal(original.text, 'เดิม', 'ของเดิมยังอยู่');
  const copy = res.list.find((f) => f.id === 'copy1');
  assert.ok(copy, 'มีสำเนา');
  assert.match(copy.text, /จากอีกเครื่อง/);
  assert.equal(copy.mergedFrom, 'a');
  assert.equal(res.stats.added, 1);
  assert.equal(res.conflicts[0].winner, 'both');
});

test('identical timestamps are treated as unchanged, not conflicts', () => {
  const res = mergeRecordSets([fact('a', 'เหมือนกัน', 1000)], [fact('a', 'เหมือนกัน', 1000)], { key: (f) => f.id });
  assert.equal(res.stats.kept, 1);
  assert.equal(res.stats.conflicts, 0);
  assert.equal(res.conflicts.length, 0);
});

test('records without timestamps never count as conflicts', () => {
  const res = mergeRecordSets([{ id: 'a', text: 'x' }], [{ id: 'a', text: 'y' }], { key: (f) => f.id });
  assert.equal(res.stats.conflicts, 0);
  assert.equal(res.list[0].text, 'x', 'ไม่รู้ว่าใครใหม่ → เก็บของเดิม');
});

test('mergeRecordSets does not mutate its inputs', () => {
  const local = [fact('a', 'เดิม', 1000)];
  const remote = [fact('a', 'ใหม่', 2000)];
  const snapshot = JSON.stringify([local, remote]);
  mergeRecordSets(local, remote, { key: (f) => f.id });
  assert.equal(JSON.stringify([local, remote]), snapshot);
});

test('events compare on start time', () => {
  const local = [{ uid: 'e1', title: 'นัดเดิม', start: 1000 }];
  const remote = [{ uid: 'e1', title: 'นัดใหม่', start: 5000 }];
  const res = mergeRecordSets(local, remote, { key: COLLECTION_META.events.key, time: COLLECTION_META.events.time });
  assert.equal(res.list[0].title, 'นัดใหม่');
  assert.equal(res.stats.conflicts, 1);
});

test('mergeSyncBundle merges every collection and totals the report', () => {
  const local = {
    facts: [{ ...fact('f1', 'ความจำเดิม', 1000), importance: 1 }],
    notes: [{ text: 'โน้ตเครื่องนี้', ts: 1000 }],
    todos: [{ text: 'รายการเครื่องนี้', ts: 1000 }],
    tasks: [{ id: 't1', title: 'งานเครื่องนี้', updatedAt: new Date(1000).toISOString() }],
    events: [{ uid: 'e1', title: 'นัดเครื่องนี้', start: 1000 }],
  };
  const remote = {
    facts: [{ ...fact('f1', 'ความจำเดิม', 9000), importance: 3 }, fact('f2', 'ใหม่จากอีกเครื่อง', 100)],
    notes: [{ text: 'โน้ตอีกเครื่อง', ts: 9000 }],
    todos: [{ text: 'รายการอีกเครื่อง', ts: 9000 }],
    tasks: [{ id: 't1', title: 'งานอีกเครื่อง', updatedAt: new Date(9000).toISOString() }],
    events: [{ uid: 'e1', title: 'นัดอีกเครื่อง', start: 9000 }],
  };

  const res = mergeSyncBundle(local, remote, { strategy: 'newest' });
  assert.equal(res.strategy, 'newest');
  assert.equal(res.data.facts.length, 2);
  assert.equal(res.data.facts.find((f) => f.id === 'f1').importance, 3, 'ใช้เวอร์ชันล่าสุด');
  assert.equal(res.data.notes.length, 2);
  assert.equal(res.data.tasks.find((t) => t.id === 't1').title, 'งานอีกเครื่อง');
  assert.equal(res.collections.facts.label, 'ความจำ');
  // facts/tasks/events ชนกัน (คีย์ไม่รวมเวลา) — notes/todos คีย์มี ts จึงถือเป็นรายการใหม่
  assert.equal(res.totals.conflicts, 3);
  assert.equal(res.conflicts.length, 3);
  assert.deepEqual(res.conflicts.map((c) => c.collection).sort(), ['events', 'facts', 'tasks']);
  assert.ok(res.conflicts.every((c) => c.collection && c.label));
  assert.equal(res.totals.added, 3, 'fact ใหม่ + note + todo');
  assert.equal(res.totals.updated, 3);
});

test('mergeSyncBundle handles empty and missing sides', () => {
  const res = mergeSyncBundle({ facts: [fact('a', 'x', 1)] }, {});
  assert.deepEqual(res.totals, { added: 0, updated: 0, kept: 0, conflicts: 0 });
  assert.equal(res.data.facts.length, 1, 'ของเดิมยังอยู่');
  assert.deepEqual(res.data.notes, []);
  assert.equal(res.data.notes.length, 0);
  const empty = mergeSyncBundle();
  assert.equal(empty.strategy, 'newest');
  assert.equal(empty.conflicts.length, 0);
});

test('mergeSyncBundle normalises an unknown strategy to newest', () => {
  assert.equal(mergeSyncBundle({}, {}, { strategy: 'chaos' }).strategy, 'newest');
});

test('summarizeSync speaks Thai and English', () => {
  const report = { strategy: 'keep-both', totals: { added: 2, updated: 1, kept: 3, conflicts: 1 } };
  assert.equal(summarizeSync(report, 'th'), 'เพิ่ม 2 · อัปเดต 1 · คงเดิม 3 · ชนกัน 1 (เก็บทั้งสอง)');
  const en = summarizeSync(report, 'en');
  assert.match(en, /\+2 new/);
  assert.match(en, /conflict/);
  assert.match(en, /keep both/);
});

test('describeConflicts shapes rows for the table', () => {
  const rows = describeConflicts([{
    key: 't1', collection: 'tasks', label: 'งาน', local: 'ของเดิม', remote: 'ของใหม่', winner: 'remote', localAt: 1000, remoteAt: 2000,
  }]);
  assert.equal(rows[0].label, 'งาน');
  assert.equal(rows[0].local, 'ของเดิม');
  assert.equal(rows[0].winner, 'remote');
  assert.match(rows[0].note, /↔/);
});
