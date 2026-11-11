import { parseHealthHistoryBackup, planHealthHistoryImport, applyHealthHistoryImport } from '../core/health-history-import.js';

function readText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('file-read-failed'));
    reader.readAsText(file);
  });
}

export function bindHealthHistoryImport(card, { copy, readHistory, confirm, render, notify }) {
  const button = card.querySelector('#health-history-import-btn');
  const input = card.querySelector('#health-history-import');
  if (!button || !input) return;
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 65_536) {
      notify(copy.importInvalid);
      input.value = '';
      return;
    }
    try {
      const parsed = parseHealthHistoryBackup(await readText(file));
      if (!parsed.ok) {
        notify(copy.importInvalid);
        return;
      }
      const plan = planHealthHistoryImport(readHistory(), parsed);
      const changed = plan.added + plan.replaced;
      if (!changed && !plan.trimmed) {
        notify(copy.importNothing);
        return;
      }
      const message = copy.importConfirm
        .replace('{added}', plan.added).replace('{replaced}', plan.replaced)
        .replace('{unchanged}', plan.unchanged).replace('{trimmed}', plan.trimmed)
        .replace('{dropped}', plan.dropped);
      if (!confirm(message)) return;
      if (!applyHealthHistoryImport(plan)) {
        notify(copy.historySaveError);
        return;
      }
      render();
      notify(`${copy.importDone}: +${plan.added} · ↻${plan.replaced} · =${plan.unchanged}`);
    } catch {
      notify(copy.importReadError);
    } finally {
      input.value = '';
    }
  });
}
