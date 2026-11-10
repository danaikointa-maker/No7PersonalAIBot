import test from 'node:test';
import assert from 'node:assert/strict';
import { TTSRouter, TTS_PROVIDERS } from '../web/src/core/tts.js';

function fakeVoice() {
  const calls = [];
  return { calls, speak: async (t) => calls.push(t), stopSpeaking: () => calls.push('__stop') };
}
function fakeAudio() {
  const audio = {
    played: 0, paused: 0,
    play() { this.played++; setTimeout(() => this.onended?.(), 0); },
    pause() { this.paused++; },
  };
  return audio;
}

test('off provider speaks nothing', async () => {
  const voice = fakeVoice();
  const r = new TTSRouter({ settings: () => ({ ttsProvider: 'off' }), voice });
  const res = await r.speak('สวัสดี');
  assert.deepEqual(res, { engine: 'off' });
  assert.equal(voice.calls.length, 0);
});

test('system provider delegates to the device voice', async () => {
  const voice = fakeVoice();
  const r = new TTSRouter({ settings: () => ({ ttsProvider: 'system' }), voice });
  const res = await r.speak('สวัสดีครับ', { rate: 1.1 });
  assert.deepEqual(res, { engine: 'system' });
  assert.deepEqual(voice.calls, ['สวัสดีครับ']);
});

test('openai provider posts to /api/tts and plays the audio', async () => {
  const voice = fakeVoice();
  let called = null;
  const audio = fakeAudio();
  const r = new TTSRouter({
    settings: () => ({ ttsProvider: 'openai', ttsVoice: 'nova', ttsModel: 'tts-1', serverUrl: 'http://srv' }),
    voice,
    serverUrl: () => 'http://srv',
    fetchImpl: async (url, init) => {
      called = { url, body: JSON.parse(init.body) };
      return { ok: true, blob: async () => ({ size: 10 }) };
    },
    audioFactory: () => audio,
  });
  globalThis.URL.createObjectURL = () => 'blob:x';
  globalThis.URL.revokeObjectURL = () => {};
  const res = await r.speak('ทดสอบเสียง');
  assert.deepEqual(res, { engine: 'openai' });
  assert.equal(called.url, 'http://srv/api/tts');
  assert.equal(called.body.text, 'ทดสอบเสียง');
  assert.equal(called.body.voice, 'nova');
  assert.equal(audio.played, 1);
  assert.equal(voice.calls.length, 0, 'ต้องไม่พูดซ้ำด้วยเสียงระบบ');
});

test('openai failure falls back to system voice and reports it', async () => {
  const voice = fakeVoice();
  let reported = null;
  const r = new TTSRouter({
    settings: () => ({ ttsProvider: 'openai' }),
    voice,
    fetchImpl: async () => ({ ok: false, status: 502, text: async () => 'upstream down' }),
  });
  r.onFallback = (e) => { reported = e; };
  const res = await r.speak('สวัสดี');
  assert.deepEqual(res, { engine: 'system' });
  assert.deepEqual(voice.calls, ['สวัสดี']);
  assert.match(reported.message, /502/);
});

test('empty text is a no-op', async () => {
  const r = new TTSRouter({ settings: () => ({ ttsProvider: 'system' }), voice: fakeVoice() });
  assert.deepEqual(await r.speak('   '), { engine: 'none' });
});

test('stop pauses audio and stops device speech', () => {
  const voice = fakeVoice();
  const audio = fakeAudio();
  const r = new TTSRouter({ settings: () => ({ ttsProvider: 'openai' }), voice });
  r.currentAudio = audio;
  r.stop();
  assert.equal(audio.paused, 1);
  assert.ok(voice.calls.includes('__stop'));
  assert.equal(r.currentAudio, null);
});

test('providers table has system/openai/off', () => {
  assert.deepEqual(Object.keys(TTS_PROVIDERS), ['system', 'openai', 'off']);
  assert.equal(TTS_PROVIDERS.openai.needsServer, true);
});
