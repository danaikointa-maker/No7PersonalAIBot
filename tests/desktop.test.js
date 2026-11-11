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
  parseWindowList, matchWindows, normalizeRecipe, validateRecipe, parseRecipeText,
  stringifyRecipeSteps, planRecipe, runRecipe, describeRecipe, RecipeStore, RecipeStorageError, listWindows,
  focusWindow, MAX_RECIPE_STEPS, RECIPE_STORE_KEY,
} = await import('../web/src/core/desktop.js');
const { runTool } = await import('../web/src/core/tools.js');
const { DEFAULT_CONTROL_POLICY } = await import('../web/src/core/control.js');

const OPEN_POLICY = { ...DEFAULT_CONTROL_POLICY, enabled: true, allowApps: ['notepad', 'code'], allowCommands: ['git'] };

function fakeBridge({ windows = ['Chrome — Gmail', 'Visual Studio Code', 'Terminal'], failFocus = false } = {}) {
  const calls = [];
  return {
    calls,
    listWindows: async () => ({ platform: 'win32', stdout: windows.join('\n') }),
    focusWindow: async (title) => {
      calls.push(['focus', title]);
      if (failFocus) throw new Error('ไม่พบหน้าต่าง');
      return true;
    },
    openApp: async (target) => { calls.push(['openApp', target]); return true; },
    openExternal: async (url) => { calls.push(['open', url]); return true; },
    notify: async (title, body) => { calls.push(['notify', `${title}: ${body}`]); return true; },
  };
}

/* --------------------------------------------------------------- windows */

test('parseWindowList handles win32 / wmctrl / osascript output', () => {
  assert.deepEqual(
    parseWindowList('Chrome — Gmail\nNotepad\n\nN/A\nMainWindowTitle\nChrome — Gmail', 'win32'),
    ['Chrome — Gmail', 'Notepad'],
  );
  assert.deepEqual(
    parseWindowList('0x0340000a  0 host Chromium\n0x02a00007 -1 host Terminal', 'linux'),
    ['Chromium', 'Terminal'],
  );
  assert.deepEqual(
    parseWindowList('Finder, Safari, Terminal\n', 'darwin'),
    ['Finder', 'Safari', 'Terminal'],
  );
  assert.deepEqual(parseWindowList('', 'win32'), []);
});

test('matchWindows ranks exact > prefix > contains and tolerates globs', () => {
  const list = ['Chrome — Gmail', 'Terminal', 'Chrome — Docs'];
  assert.deepEqual(matchWindows(list, 'terminal'), ['Terminal']);
  const chrome = matchWindows(list, 'chrome');
  assert.equal(chrome.length, 2);
  assert.deepEqual(matchWindows(list, ''), list);
  assert.deepEqual(matchWindows(list, '*docs'), ['Chrome — Docs']);
  assert.deepEqual(matchWindows(list, 'firefox'), []);
});

test('listWindows/focusWindow explain what is missing without a bridge', async () => {
  const none = await listWindows({ bridge: null });
  assert.equal(none.ok, false);
  assert.match(none.reason, /เดสก์ท็อป/);
  await assert.rejects(() => focusWindow({ target: 'Chrome', bridge: null }), /เดสก์ท็อป/);
});

test('listWindows parses the bridge output and focusWindow picks the best match', async () => {
  const bridge = fakeBridge();
  const res = await listWindows({ bridge });
  assert.equal(res.ok, true);
  assert.equal(res.windows.length, 3);

  const card = await focusWindow({ target: 'code', bridge, windows: res.windows });
  assert.equal(card.big, 'Visual Studio Code');
  assert.deepEqual(bridge.calls.at(-1), ['focus', 'Visual Studio Code']);

  await assert.rejects(() => focusWindow({ target: 'msedge', bridge, windows: res.windows }), /ไม่พบหน้าต่าง/);
});

/* --------------------------------------------------------------- recipes */

test('normalizeRecipe drops unknown steps and clamps limits', () => {
  const rec = normalizeRecipe({
    name: '  เช้า  ',
    steps: [
      { action: 'open_app', target: 'notepad' },
      { action: 'wait', ms: 99_999 },
      { action: 'notify', text: 'พร้อม' },
      { action: 'hack', target: 'rm -rf /' },
      { action: 'open_url' },
    ],
  });
  assert.equal(rec.name, 'เช้า');
  assert.deepEqual(rec.steps, [
    { action: 'open_app', target: 'notepad' },
    { action: 'wait', ms: 5000 },
    { action: 'notify', text: 'พร้อม' },
  ]);
});

test('validateRecipe enforces name, steps, count and total wait', () => {
  assert.equal(validateRecipe({ name: '', steps: [{ action: 'wait', ms: 10 }] }).ok, false);
  assert.match(validateRecipe({ name: 'x', steps: [] }).errors[0], /อย่างน้อย 1 ขั้น/);
  const many = Array.from({ length: MAX_RECIPE_STEPS + 1 }, () => ({ action: 'notify', text: 'hi' }));
  assert.match(validateRecipe({ name: 'x', steps: many }).errors[0], new RegExp(`${MAX_RECIPE_STEPS}`));
  const longWait = Array.from({ length: 4 }, () => ({ action: 'wait', ms: 5000 }));
  assert.match(validateRecipe({ name: 'x', steps: longWait }).errors[0], /15 วินาที/);
  assert.equal(validateRecipe({ name: 'x', steps: [{ action: 'wait', ms: 500 }] }).ok, true);
});

test('parseRecipeText reads one step per line and reports bad lines', () => {
  const { steps, errors } = parseRecipeText([
    '# คอมเมนต์',
    'open_url https://calendar.google.com',
    'wait 800',
    'notify เริ่มงานได้เลย',
    'focus_window Chrome',
    'explode ที่นี่',
    'wait',
  ].join('\n'));
  assert.deepEqual(errors, ['บรรทัด 6: ไม่รู้จักขั้น "explode"', 'บรรทัด 7: ขั้น "wait" ต้องมีค่าให้ทำ']);
  assert.deepEqual(steps, [
    { action: 'open_url', target: 'https://calendar.google.com' },
    { action: 'wait', ms: 800 },
    { action: 'notify', text: 'เริ่มงานได้เลย' },
    { action: 'focus_window', target: 'Chrome' },
  ]);
  assert.equal(stringifyRecipeSteps(steps).split('\n').length, 4);
  assert.match(describeRecipe({ name: 'x', steps }), /1\. 🌐 เปิดลิงก์/);
});

test('planRecipe is a dry-run that honours the control allowlist', () => {
  const recipe = {
    name: 'ทำงาน',
    steps: [
      { action: 'open_app', target: 'notepad' },
      { action: 'open_app', target: 'steam' },
      { action: 'focus_window', target: 'Chrome' },
      { action: 'notify', text: 'ok' },
    ],
  };

  const closed = planRecipe(recipe, { policy: DEFAULT_CONTROL_POLICY });
  assert.equal(closed.ok, false);
  assert.equal(closed.steps[0].allowed, false, 'open_app ต้องถูกบล็อกเมื่อยังไม่เปิด control');
  assert.match(closed.steps[0].reason, /ยังไม่เปิด/);

  const open = planRecipe(recipe, { policy: OPEN_POLICY, windows: ['Chrome — Gmail'] });
  assert.equal(open.steps[0].allowed, true);
  assert.equal(open.steps[1].allowed, false);
  assert.match(open.steps[1].reason, /allowlist/);
  assert.equal(open.steps[2].allowed, true);
  assert.match(open.steps[2].label, /Chrome — Gmail/);
  assert.equal(open.ok, false);

  const onlyGood = planRecipe({ name: 'ok', steps: [{ action: 'notify', text: 'hi' }] }, { policy: OPEN_POLICY });
  assert.equal(onlyGood.ok, true);
});

test('runRecipe executes through the bridge and records each step', async () => {
  const bridge = fakeBridge();
  const waits = [];
  const results = await runRecipe(
    { name: 'เช้า', steps: [
      { action: 'open_app', target: 'notepad' },
      { action: 'open_url', target: 'https://calendar.google.com' },
      { action: 'wait', ms: 300 },
      { action: 'focus_window', target: 'chrome' },
      { action: 'notify', text: 'พร้อมแล้ว' },
    ] },
    { bridge, policy: OPEN_POLICY, windows: ['Chrome — Gmail'], sleep: async (ms) => waits.push(ms) },
  );

  assert.equal(results.ok, true, results.error);
  assert.equal(results.steps.length, 5);
  assert.ok(results.steps.every((s) => s.status === 'done'));
  assert.deepEqual(waits, [300]);
  assert.deepEqual(bridge.calls, [
    ['openApp', 'notepad'],
    ['open', 'https://calendar.google.com'],
    ['focus', 'Chrome — Gmail'],
    ['notify', 'No7: พร้อมแล้ว'],
  ]);
});

test('runRecipe stops on the first blocked or failing step', async () => {
  const blocked = await runRecipe(
    { name: 'x', steps: [{ action: 'open_app', target: 'steam' }] },
    { bridge: fakeBridge(), policy: OPEN_POLICY },
  );
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /allowlist/);

  const noBridge = await runRecipe({ name: 'x', steps: [{ action: 'notify', text: 'hi' }] }, { policy: OPEN_POLICY, bridge: null });
  assert.equal(noBridge.ok, false);
  assert.match(noBridge.error, /เดสก์ท็อป/);

  const failing = fakeBridge({ failFocus: true });
  const res = await runRecipe(
    { name: 'x', steps: [{ action: 'focus_window', target: 'Chrome' }, { action: 'notify', text: 'หลังโฟกัส' }] },
    { bridge: failing, policy: OPEN_POLICY, windows: ['Chrome — Gmail'] },
  );
  assert.equal(res.ok, false);
  assert.equal(res.steps.length, 1);
  assert.equal(res.steps[0].status, 'failed');
  assert.ok(!failing.calls.some(([kind]) => kind === 'notify'));
});

test('runRecipe dryRun never touches the bridge', async () => {
  const bridge = fakeBridge();
  const res = await runRecipe(
    { name: 'x', steps: [{ action: 'open_app', target: 'notepad' }] },
    { bridge, policy: OPEN_POLICY, dryRun: true },
  );
  assert.equal(res.dryRun, true);
  assert.equal(res.steps[0].status, 'planned');
  assert.deepEqual(bridge.calls, []);
});

/* ----------------------------------------------------------------- store */

test('RecipeStore saves, overwrites by name, lists and removes', () => {
  localStorage.clear();
  const store = new RecipeStore({ now: () => 1_700_000_000_000 });
  const saved = store.save({ name: 'โหมดทำงาน', steps: [{ action: 'notify', text: 'สวัสดี' }] });
  assert.ok(saved.id);
  assert.equal(store.list().length, 1);

  const again = store.save({ name: 'โหมดทำงาน', steps: [{ action: 'wait', ms: 200 }] });
  assert.equal(again.id, saved.id, 'ชื่อเดียวกันต้องทับของเดิม');
  assert.equal(store.list().length, 1);
  assert.equal(store.get(saved.id).steps[0].action, 'wait');
  assert.equal(store.find('โหมด').id, saved.id);

  assert.throws(() => store.save({ name: '', steps: [] }), /ชื่อสูตร/);
  assert.equal(store.remove(saved.id), true);
  assert.equal(store.list().length, 0);
  assert.equal(localStorage.getItem(RECIPE_STORE_KEY), '[]');
});

test('RecipeStore persists between instances and can seed samples', () => {
  localStorage.clear();
  const a = new RecipeStore();
  a.seedSamples();
  a.seedSamples();                       // ต้องไม่ซ้ำ
  const b = new RecipeStore();
  assert.equal(b.list().length, 2);
  assert.ok(b.find('โหมดทำงานเช้า'));
});

test('RecipeStore quota failures preserve memory and persisted recipes for every mutation', () => {
  const values = new Map();
  let failWrites = false;
  let writes = 0;
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      writes += 1;
      if (failWrites) throw new Error('QuotaExceededError');
      values.set(key, String(value));
    },
  };
  const store = new RecipeStore({ storage, now: () => 1234 });
  const saved = store.save({ name: 'คงไว้', steps: [{ action: 'notify', text: 'เดิม' }] });
  const persisted = values.get(RECIPE_STORE_KEY);
  const originalWrites = writes;
  assert.equal(store.remove('missing'), false);
  assert.equal(writes, originalWrites, 'ลบสูตรที่ไม่มีไม่เขียนซ้ำ');

  failWrites = true;
  assert.throws(() => store.save({ name: 'คงไว้', steps: [{ action: 'wait', ms: 200 }] }), RecipeStorageError);
  assert.throws(() => store.remove(saved.id), RecipeStorageError);
  assert.throws(() => store.clear(), RecipeStorageError);
  assert.equal(store.get(saved.id).steps[0].text, 'เดิม');
  assert.equal(values.get(RECIPE_STORE_KEY), persisted);

  const emptyValues = new Map();
  let seedWrites = 0;
  const empty = new RecipeStore({ storage: {
    getItem: (key) => emptyValues.get(key) ?? null,
    setItem: (key, value) => {
      seedWrites += 1;
      throw new Error('QuotaExceededError');
    },
  } });
  assert.throws(() => empty.seedSamples(), RecipeStorageError);
  assert.deepEqual(empty.list(), []);
  assert.equal(seedWrites, 1);
  assert.equal(emptyValues.get(RECIPE_STORE_KEY), undefined);
  assert.equal(values.get(RECIPE_STORE_KEY), persisted);
});

/* ----------------------------------------------------------------- tools */

test('tool desktop:list reports windows and desktop:focus focuses one', async () => {
  localStorage.clear();
  const bridge = fakeBridge();
  globalThis.no7 = { native: bridge };
  try {
    const listed = await runTool('desktop', { action: 'list', query: 'chrome' }, {});
    assert.match(listed.data.big, /1 หน้าต่าง/);
    assert.equal(listed.data.lines.length, 1);

    const focused = await runTool('desktop', { action: 'focus', query: 'terminal' }, {});
    assert.equal(focused.data.big, 'Terminal');
  } finally {
    delete globalThis.no7;
  }
});

test('tool run_recipe dry-runs, runs and can create a recipe from steps', async () => {
  localStorage.clear();
  const bridge = fakeBridge();
  globalThis.no7 = { native: bridge };
  try {
    const plan = await runTool('run_recipe', {
      name: 'เช้า', steps: 'notify พร้อม', dryRun: true,
    }, { settings: { controlPolicy: OPEN_POLICY } });
    assert.match(plan.data.lines[0], /✅/);

    const run = await runTool('run_recipe', {
      name: 'เริ่มงาน', steps: 'open_app notepad\nnotify เริ่มงาน',
    }, { settings: { controlPolicy: OPEN_POLICY } });
    assert.equal(run.data.big, 'เริ่มงาน');
    assert.equal(run.data.lines.length, 2);
    assert.ok(bridge.calls.some(([kind, v]) => kind === 'openApp' && v === 'notepad'));

    // สูตรถูกบันทึกไว้ เรียกซ้ำด้วยชื่อได้ (steps ไม่ต้องพิมพ์ใหม่)
    const again = await runTool('run_recipe', { name: 'เริ่มงาน' }, { settings: { controlPolicy: OPEN_POLICY } });
    assert.equal(again.data.lines.length, 2);

    await assert.rejects(() => runTool('run_recipe', { name: 'ไม่มีสูตรนี้' }, {}), /ไม่พบสูตร/);
  } finally {
    delete globalThis.no7;
  }
});

test('tool run_recipe does not report success or execute when a new recipe cannot be stored', async () => {
  const originalStorage = globalThis.localStorage;
  const writes = [];
  globalThis.localStorage = {
    getItem: () => null,
    setItem: (key) => { writes.push(key); throw new Error('QuotaExceededError'); },
  };
  const bridge = fakeBridge();
  globalThis.no7 = { native: bridge };
  try {
    await assert.rejects(
      () => runTool('run_recipe', { name: 'เก็บไม่ได้', steps: 'notify ห้ามรัน' }, { settings: { controlPolicy: OPEN_POLICY } }),
      RecipeStorageError,
    );
    assert.deepEqual(writes, [RECIPE_STORE_KEY]);
    assert.deepEqual(bridge.calls, [], 'ต้องไม่เริ่มรันสูตรก่อนบันทึกสำเร็จ');
  } finally {
    globalThis.localStorage = originalStorage;
    delete globalThis.no7;
  }
});

test('tool run_recipe refuses to run when the allowlist is closed', async () => {
  localStorage.clear();
  const bridge = fakeBridge();
  globalThis.no7 = { native: bridge };
  try {
    await assert.rejects(
      () => runTool('run_recipe', { name: 'ปิด', steps: 'open_app notepad' }, { settings: { controlPolicy: DEFAULT_CONTROL_POLICY } }),
      /allowlist|ยังไม่เปิด/,
    );
  } finally {
    delete globalThis.no7;
  }
});
