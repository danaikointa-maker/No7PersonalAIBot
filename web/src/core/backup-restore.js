const LIST_KEYS = ['no7.notes.v1', 'no7.todos.v1'];
const fieldForKey = (key) => key.replace(/^no7\./, '').replace(/\.v1$/, '');

/** Persist a related set of local lists before applying other stores; roll them back on failure. */
export function withBackupListsRestore(values, apply, storage = globalThis.localStorage, keys = LIST_KEYS) {
  const previous = keys.map((key) => storage.getItem(key));
  const candidates = keys.map((key) => values?.[fieldForKey(key)] || []);
  const rollback = () => {
    for (let i = 0; i < keys.length; i++) {
      try {
        if (previous[i] == null) storage.removeItem(keys[i]);
        else storage.setItem(keys[i], previous[i]);
      } catch { /* best-effort rollback; quota errors do not alter existing values */ }
    }
  };
  try {
    for (let i = 0; i < keys.length; i++) storage.setItem(keys[i], JSON.stringify(candidates[i]));
    return apply();
  } catch (error) {
    rollback();
    throw error;
  }
}
