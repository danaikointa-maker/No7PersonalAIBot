import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeBundle, SyncApplyError } from '../web/src/core/sync.js';
import { TaskStore } from '../web/src/core/tasks.js';

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
function fakes({ failCalendar = false } = {}) {
  const state = { facts: [], events: [], calendarWrites: 0, memoryWrites: 0, personas: [] };
  return {
    state,
    memory: {
      listFacts: () => state.facts,
      importData: ({ facts }) => { state.memoryWrites++; state.facts = [...facts]; return { added: facts.length }; },
    },
    calendar: {
      all: () => state.events,
      replaceAll: (events) => {
        state.calendarWrites++;
        if (failCalendar) throw new Error('calendar write failed');
        state.events = [...events];
      },
    },
    createPersona: (p) => { state.personas.push(p); return p; },
    listPersonas: () => [...state.personas],
  };
}
const blank = { memory: { facts: [] }, notes: [], todos: [], tasks: [], calendar: [], personas: [] };

test('sync list quota failure rolls back candidates before applying any other store', () => {
  const storage = makeStorage({
    'no7.notes.v1': '[{"text":"existing note","ts":1}]',
    'no7.todos.v1': '[{"text":"existing todo","ts":1}]',
  });
  globalThis.localStorage = storage;
  const tasks = new TaskStore({ storage, now: () => 5000 });
  const existing = tasks.add({ title: 'keep task' });
  const oldNotes = storage.getItem('no7.notes.v1');
  const oldTodos = storage.getItem('no7.todos.v1');
  const set = storage.setItem;
  storage.setItem = (key, value) => {
    if (key === 'no7.todos.v1') throw new Error('QuotaExceededError');
    set(key, value);
  };
  const services = fakes();
  const incoming = {
    memory: { facts: [{ id: 'f-remote', text: 'remote fact', ts: 2 }] },
    notes: [{ text: 'incoming note', ts: 2 }],
    todos: [{ text: 'incoming todo', ts: 2 }],
    tasks: [{ id: 'remote-task', title: 'remote task', createdAt: 2000, updatedAt: 2000 }],
    calendar: [{ uid: 'remote-event', title: 'remote event', start: 2000 }],
    personas: [{ id: 'p-remote', name: 'Remote', system: 'test' }],
  };
  assert.throws(() => mergeBundle(incoming, { ...services, tasks }), (error) => {
    assert.ok(error instanceof SyncApplyError);
    assert.deepEqual(error.applied, []);
    assert.match(error.message, /เดิมยังคงอยู่/);
    return true;
  });
  assert.equal(storage.getItem('no7.notes.v1'), oldNotes);
  assert.equal(storage.getItem('no7.todos.v1'), oldTodos);
  assert.equal(tasks.get(existing.id).title, 'keep task');
  assert.equal(tasks.get('remote-task'), null);
  assert.equal(services.state.memoryWrites, 0);
  assert.equal(services.state.calendarWrites, 0);
  assert.deepEqual(services.state.personas, []);
});

test('merge uses live TaskStore, retains deleted task tombstones, and updates cache', () => {
  const storage = makeStorage();
  globalThis.localStorage = storage;
  const tasks = new TaskStore({ storage, now: () => 5000 });
  tasks.merge([{ id: 'gone', title: 'old', deleted: true, createdAt: 1000, updatedAt: 3000 }]);
  const services = fakes();
  const result = mergeBundle({
    ...blank,
    tasks: [
      { id: 'gone', title: 'restored remotely', deleted: false, createdAt: 1000, updatedAt: 2000 },
      { id: 'new', title: 'new task', createdAt: 2500, updatedAt: 2500 },
    ],
  }, { ...services, tasks });
  assert.equal(result.tasks, 1);
  assert.equal(tasks.get('gone'), null);
  assert.equal(tasks.get('new').title, 'new task');
  const loaded = new TaskStore({ storage, now: () => 5000 });
  assert.equal(loaded.get('gone'), null);
  assert.equal(loaded.get('new').title, 'new task');
});

test('sync apply failure reports partial commits and rolls back the prepared lists', () => {
  const oldNotes = '[{"text":"old note","ts":1}]';
  const oldTodos = '[{"text":"old todo","ts":1}]';
  const storage = makeStorage({ 'no7.notes.v1': oldNotes, 'no7.todos.v1': oldTodos });
  globalThis.localStorage = storage;
  const tasks = new TaskStore({ storage, now: () => 5000 });
  const services = fakes({ failCalendar: true });
  assert.throws(() => mergeBundle({
    memory: { facts: [{ id: 'fact-1', text: 'new fact', ts: 1000 }] },
    notes: [{ text: 'new note', ts: 2000 }],
    todos: [{ text: 'new todo', ts: 2000 }],
    tasks: [{ id: 'task-1', title: 'task', createdAt: 1000, updatedAt: 1000 }],
    calendar: [{ uid: 'event-1', title: 'event', start: 1000 }],
    personas: [],
  }, { ...services, tasks }), (error) => {
    assert.ok(error instanceof SyncApplyError);
    assert.deepEqual(error.applied, ['ความจำ', 'งาน']);
    assert.ok(error.report?.totals);
    assert.match(error.message, /หยุดกลางทาง/);
    return true;
  });
  assert.equal(storage.getItem('no7.notes.v1'), oldNotes);
  assert.equal(storage.getItem('no7.todos.v1'), oldTodos);
  assert.equal(tasks.get('task-1').title, 'task');
  assert.equal(services.state.facts[0].text, 'new fact');
});
