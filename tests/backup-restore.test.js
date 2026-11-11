import test from 'node:test';
import assert from 'node:assert/strict';
import { withBackupListsRestore } from '../web/src/core/backup-restore.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('backup list restore writes candidates before running memory commit', () => {
  const store = createStorage({ 'no7.notes.v1': '["old note"]', 'no7.todos.v1': '["old todo"]' });
  const result = withBackupListsRestore({ notes: ['new note'], todos: ['new todo'] }, () => {
    assert.equal(store.getItem('no7.notes.v1'), '["new note"]');
    assert.equal(store.getItem('no7.todos.v1'), '["new todo"]');
    return { committed: true };
  }, store);
  assert.deepEqual(result, { committed: true });
});

test('partial backup list write failure rolls back earlier keys and skips memory commit', () => {
  const store = createStorage({ 'no7.notes.v1': '["old note"]', 'no7.todos.v1': '["old todo"]' });
  const originalSetItem = store.setItem;
  store.setItem = (key, value) => {
    if (key === 'no7.todos.v1') throw new Error('QuotaExceededError');
    originalSetItem(key, value);
  };
  let commitCalled = false;
  assert.throws(() => withBackupListsRestore({ notes: ['new note'], todos: ['new todo'] }, () => { commitCalled = true; }, store), /QuotaExceededError/);
  assert.equal(commitCalled, false);
  assert.equal(store.getItem('no7.notes.v1'), '["old note"]');
  assert.equal(store.getItem('no7.todos.v1'), '["old todo"]');
});

test('memory commit failure restores both backup list keys', () => {
  const store = createStorage({ 'no7.notes.v1': '["old note"]', 'no7.todos.v1': '["old todo"]' });
  assert.throws(() => withBackupListsRestore({ notes: ['new note'], todos: ['new todo'] }, () => { throw new Error('memory commit failed'); }, store), /memory commit failed/);
  assert.equal(store.getItem('no7.notes.v1'), '["old note"]');
  assert.equal(store.getItem('no7.todos.v1'), '["old todo"]');
});
