// Auto-update: config จาก env, การแปลง event เป็นข้อความ, และการต่อสายกับ electron-updater
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  updaterConfig, describeUpdateEvent, setupAutoUpdater,
  DEFAULT_CHECK_DELAY_MS, MIN_CHECK_DELAY_MS, MAX_CHECK_DELAY_MS,
} from '../desktop/updater.js';

function fakeUpdater() {
  const handlers = new Map();
  const calls = [];
  return {
    calls,
    handlers,
    autoDownload: true,
    autoInstallOnAppQuit: false,
    channel: 'latest',
    on(event, fn) { handlers.set(event, fn); return this; },
    setFeedURL(url) { calls.push(['feed', url]); },
    checkForUpdates() { calls.push(['check']); return Promise.resolve({}); },
    quitAndInstall() { calls.push(['install']); },
    emit(event, info) { handlers.get(event)?.(info); },
  };
}

test('updaterConfig is off by default and requires a packaged app', () => {
  assert.deepEqual(updaterConfig({}, { isPackaged: true }), {
    enabled: false, feedUrl: '', channel: 'latest', autoDownload: true, checkDelayMs: DEFAULT_CHECK_DELAY_MS,
  });
  assert.equal(updaterConfig({ NO7_AUTO_UPDATE: '1' }, { isPackaged: false }).enabled, false, 'dev mode = ปิด');
  assert.equal(updaterConfig({ NO7_AUTO_UPDATE: '1' }, { isPackaged: true }).enabled, true);
  assert.equal(updaterConfig({ NO7_AUTO_UPDATE: 'yes' }, { isPackaged: true }).enabled, false, 'ต้องเป็น 1 เท่านั้น');
});

test('updaterConfig reads feed/channel/download/delay with clamping', () => {
  const cfg = updaterConfig({
    NO7_AUTO_UPDATE: '1',
    NO7_UPDATE_FEED: ' https://updates.example.com/no7 ',
    NO7_UPDATE_CHANNEL: 'beta',
    NO7_UPDATE_AUTO_DOWNLOAD: '0',
    NO7_UPDATE_CHECK_MS: '1000',
  }, { isPackaged: true });
  assert.equal(cfg.feedUrl, 'https://updates.example.com/no7');
  assert.equal(cfg.channel, 'beta');
  assert.equal(cfg.autoDownload, false);
  assert.equal(cfg.checkDelayMs, MIN_CHECK_DELAY_MS);

  assert.equal(updaterConfig({ NO7_UPDATE_CHECK_MS: '99999999' }, { isPackaged: true }).checkDelayMs, MAX_CHECK_DELAY_MS);
  assert.equal(updaterConfig({ NO7_UPDATE_CHECK_MS: 'abc' }, { isPackaged: true }).checkDelayMs, DEFAULT_CHECK_DELAY_MS);
  assert.equal(updaterConfig({ NO7_UPDATE_CHANNEL: '' }, { isPackaged: true }).channel, 'latest');
});

test('describeUpdateEvent covers every lifecycle event', () => {
  assert.match(describeUpdateEvent('checking-for-update').title, /ตรวจอัปเดต/);
  const available = describeUpdateEvent('update-available', { version: '2.0.1' });
  assert.equal(available.version, '2.0.1');
  assert.match(available.body, /2\.0\.1/);
  assert.match(describeUpdateEvent('update-not-available', { currentVersion: '2.0.0' }).body, /2\.0\.0/);
  assert.match(describeUpdateEvent('download-progress', { percent: 42.4 }).body, /42%/);
  const done = describeUpdateEvent('update-downloaded', { version: '2.0.1' });
  assert.match(done.body, /ติดตั้งเมื่อปิดแอป/);
  assert.match(describeUpdateEvent('error', { message: 'boom' }).body, /boom/);
  assert.equal(describeUpdateEvent('unknown-event').title, 'unknown-event');
});

test('setupAutoUpdater does nothing when disabled', () => {
  const fake = fakeUpdater();
  const disabled = setupAutoUpdater({ autoUpdater: fake, config: { enabled: false } });
  assert.equal(disabled.enabled, false);
  assert.match(disabled.reason, /ปิดอยู่/);
  assert.equal(fake.handlers.size, 0);

  const none = setupAutoUpdater({ autoUpdater: null, config: { enabled: true } });
  assert.equal(none.enabled, false);
  assert.match(none.reason, /electron-updater/);
});

test('setupAutoUpdater wires events, feed, channel and scheduling', async () => {
  const fake = fakeUpdater();
  const notified = [];
  const logs = [];
  let scheduled = null;
  const handle = setupAutoUpdater({
    autoUpdater: fake,
    config: { enabled: true, feedUrl: 'https://u.example.com', channel: 'beta', autoDownload: false, checkDelayMs: 3000 },
    notify: (msg) => notified.push(msg),
    log: (m) => logs.push(m),
    setTimeoutImpl: (fn, ms) => { scheduled = { fn, ms }; return 1; },
  });

  assert.equal(handle.enabled, true);
  assert.equal(fake.autoDownload, false);
  assert.equal(fake.autoInstallOnAppQuit, true);
  assert.equal(fake.channel, 'beta');
  assert.deepEqual(fake.calls[0], ['feed', { provider: 'generic', url: 'https://u.example.com' }]);
  assert.deepEqual(scheduled.ms, 3000);
  assert.equal(fake.handlers.size, 6);

  scheduled.fn();
  assert.deepEqual(fake.calls.at(-1), ['check']);

  fake.emit('update-available', { version: '2.0.1' });
  fake.emit('update-downloaded', { version: '2.0.1' });
  assert.equal(notified.length, 2);
  assert.match(notified[0].body, /2\.0\.1/);
  assert.equal(logs.length, 2);

  handle.install();
  assert.deepEqual(fake.calls.at(-1), ['install']);
});

test('check() reports failures as error notifications instead of throwing', async () => {
  const fake = fakeUpdater();
  fake.checkForUpdates = () => Promise.reject(new Error('no network'));
  const notified = [];
  const handle = setupAutoUpdater({
    autoUpdater: fake,
    config: { enabled: true, channel: 'latest', autoDownload: true, checkDelayMs: 3000 },
    notify: (m) => notified.push(m),
    setTimeoutImpl: () => 1,
  });
  await handle.check();
  assert.equal(notified.length, 1);
  assert.match(notified[0].body, /no network/);
});
