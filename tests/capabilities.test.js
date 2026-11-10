import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectCapabilities, summarizeCapabilities, featureFlags,
  requestMicrophone, requestNotifications,
} from '../web/src/core/capabilities.js';

function fakeEnv(overrides = {}) {
  return {
    isSecureContext: true,
    crypto: { subtle: {} },
    navigator: { onLine: true },
    window: {},
    ...overrides,
  };
}

test('reports STT/TTS missing when the browser has none', async () => {
  const caps = await detectCapabilities(fakeEnv());
  const by = Object.fromEntries(caps.map((c) => [c.id, c]));
  assert.equal(by.speechRecognition.ok, false);
  assert.equal(by.speechSynthesis.ok, false);
  assert.equal(by.wakeWord.ok, false);
  assert.ok(by.wakeWord.hint);
});

test('reports capabilities when APIs exist', async () => {
  const env = fakeEnv({
    window: { SpeechRecognition: class {}, speechSynthesis: {}, Notification: class { static permission = 'granted' } },
    navigator: {
      onLine: true,
      mediaDevices: { getUserMedia: () => {} },
      clipboard: { writeText: () => {} },
      share: () => {},
      vibrate: () => {},
      connection: { effectiveType: '4g', downlink: 10 },
      storage: { persisted: async () => true },
    },
  });
  const caps = await detectCapabilities(env);
  const by = Object.fromEntries(caps.map((c) => [c.id, c]));
  assert.equal(by.speechRecognition.ok, true);
  assert.equal(by.speechSynthesis.ok, true);
  assert.equal(by.wakeWord.ok, true);
  assert.equal(by.clipboard.ok, true);
  assert.equal(by.share.ok, true);
  assert.equal(by.persistentStorage.ok, true);
  assert.match(by.network.value, /4g/);
});

test('insecure context disables mic-dependent features', async () => {
  const env = fakeEnv({ isSecureContext: false, window: { SpeechRecognition: class {} }, navigator: { onLine: true } });
  const caps = await detectCapabilities(env);
  const by = Object.fromEntries(caps.map((c) => [c.id, c]));
  assert.equal(by.secureContext.ok, false);
  assert.equal(by.wakeWord.ok, false, 'wake word ต้องมี secure context');
  assert.ok(by.microphone.hint.includes('https'));
});

test('battery and network values are surfaced', async () => {
  const env = fakeEnv({
    navigator: { onLine: true, getBattery: async () => ({ level: 0.42, charging: false }) },
  });
  const caps = await detectCapabilities(env);
  const by = Object.fromEntries(caps.map((c) => [c.id, c]));
  assert.equal(by.battery.ok, true);
  assert.equal(by.battery.value, '42%');
});

test('summarize counts and lists what is missing', async () => {
  const caps = await detectCapabilities(fakeEnv());
  const sum = summarizeCapabilities(caps);
  assert.equal(sum.total, caps.length);
  assert.ok(sum.ok < sum.total);
  assert.ok(sum.missing.length > 0);
  assert.ok(sum.score >= 0 && sum.score <= 100);
});

test('featureFlags maps capabilities to product features', async () => {
  const f = await featureFlags(fakeEnv({
    window: { SpeechRecognition: class {}, speechSynthesis: {} },
    navigator: { onLine: true, mediaDevices: { getUserMedia: () => {} } },
  }));
  assert.equal(f.canListen, true);
  assert.equal(f.canSpeak, true);
  assert.equal(f.canHMAC, true);
  assert.equal(f.canNotify, false);
});

test('requestMicrophone stops tracks after permission', async () => {
  let stopped = 0;
  const env = { navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] }) } } };
  assert.equal(await requestMicrophone(env), true);
  assert.equal(stopped, 2);
});

test('requestMicrophone throws when unsupported', async () => {
  await assert.rejects(() => requestMicrophone({ navigator: {} }), /ไม่รองรับ/);
});

test('requestNotifications resolves permission', async () => {
  const env = { Notification: { permission: 'default', requestPermission: async () => 'granted' } };
  assert.equal(await requestNotifications(env), 'granted');
  const granted = { Notification: { permission: 'granted', requestPermission: async () => 'denied' } };
  assert.equal(await requestNotifications(granted), 'granted');
});
