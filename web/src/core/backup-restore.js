const LIST_KEYS = ['no7.notes.v1', 'no7.todos.v1'];

/** Persist notes/todos as one guarded restore step; roll them back if later memory work fails. */
export function withBackupListsRestore(values, apply, storage = globalThis.localStorage) {
  const previous = LIST_KEYS.map((key) => storage.getItem(key));
  const candidates = [values?.notes || [], values?.todos || []];
  const rollback = () => {
    for (let i = 0; i < LIST_KEYS.length; i++) {
      try {
        if (previous[i] == null) storage.removeItem(LIST_KEYS[i]);
        else storage.setItem(LIST_KEYS[i], previous[i]);
      } catch { /* best-effort rollback; quota errors do not alter existing values */ }
    }
  };
  try {
    for (let i = 0; i < LIST_KEYS.length; i++) storage.setItem(LIST_KEYS[i], JSON.stringify(candidates[i]));
    return apply();
  } catch (error) {
    rollback();
    throw error;
  }
}
