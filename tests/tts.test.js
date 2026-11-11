import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TTSRouter, TTS_PROVIDERS, TTS_VOICES, voicesFor, resolveTTSConfig, AudioCache,
} from '../web/src/core/tts.js';

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
  assert.deepEqual(res, { engine: 'openai', cached: false });
  assert.equal(called.url, 'http://srv/api/tts');
  assert.equal(called.body.text, 'ทดสอบเสียง');
  assert.equal(called.body.voice, 'nova');
  assert.equal(audio.played, 1);
  assert.equal(voice.calls.length, 0, 'ต้องไม่พูดซ้ำด้วยเสียงระบบ');
  assert.equal(res.cached, false);
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

test('providers table has system/openai/elevenlabs/off', () => {
  assert.deepEqual(Object.keys(TTS_PROVIDERS), ['system', 'openai', 'elevenlabs', 'off']);
  assert.equal(TTS_PROVIDERS.openai.needsServer, true);
  assert.equal(TTS_PROVIDERS.elevenlabs.needsServer, true);
  assert.equal(TTS_PROVIDERS.system.needsServer, false);
});

test('resolveTTSConfig fills provider defaults and escapes cross-provider voices', () => {
  assert.deepEqual(resolveTTSConfig({ ttsProvider: 'openai' }), {
    provider: 'openai', needsServer: true, voice: 'alloy', model: 'tts-1', baseUrl: '', apiKey: '', cache: true,
  });
  const el = resolveTTSConfig({ ttsProvider: 'elevenlabs', ttsVoice: 'nova', ttsCache: false });
  assert.equal(el.voice, '21m00Tcm4TlvDq8ikWAM', 'voice ของ openai ต้องถูกแทนด้วยค่าเริ่มต้น');
  assert.equal(el.model, 'eleven_multilingual_v2');
  assert.equal(el.cache, false);
  assert.equal(resolveTTSConfig({ ttsProvider: 'nope' }).provider, 'system');
  assert.equal(voicesFor('elevenlabs').length, 5);
  assert.deepEqual(voicesFor('off'), []);
  assert.ok(TTS_VOICES.openai.every((v) => v.id && v.label));
});

test('elevenlabs provider posts provider/voice/model and plays the audio', async () => {
  let sent = null;
  const audio = fakeAudio();
  const r = new TTSRouter({
    settings: () => ({ ttsProvider: 'elevenlabs', ttsVoice: 'TxGEqnHWrfWFTfGW9XjX', serverUrl: 'http://srv' }),
    voice: fakeVoice(),
    serverUrl: () => 'http://srv',
    fetchImpl: async (url, init) => {
      sent = { url, body: JSON.parse(init.body) };
      return { ok: true, blob: async () => ({ size: 12 }) };
    },
    audioFactory: () => audio,
  });
  globalThis.URL.createObjectURL = () => 'blob:x';
  globalThis.URL.revokeObjectURL = () => {};
  const res = await r.speak('ทดสอบเสียงพรีเมียม');
  assert.equal(res.engine, 'elevenlabs');
  assert.equal(res.cached, false);
  assert.equal(sent.url, 'http://srv/api/tts');
  assert.equal(sent.body.provider, 'elevenlabs');
  assert.equal(sent.body.voice, 'TxGEqnHWrfWFTfGW9XjX');
  assert.equal(sent.body.model, 'eleven_multilingual_v2');
});

test('AudioCache is an LRU bounded by entries and bytes', () => {
  const cache = new AudioCache({ maxEntries: 3, maxBytes: 1000 });
  cache.set('a', { size: 100 }, 100);
  cache.set('b', { size: 100 }, 100);
  cache.set('c', { size: 100 }, 100);
  cache.get('a');                       // a กลายเป็น recent
  cache.set('d', { size: 100 }, 100);   // ต้องไล่ b ออก
  assert.equal(cache.get('b'), null);
  assert.ok(cache.get('a'));
  assert.equal(cache.stats().entries, 3);
  assert.equal(cache.stats().bytes, 300);
  assert.equal(cache.stats().hits, 2, 'a + d');
  assert.equal(cache.stats().misses, 1, 'b ถูกไล่ออก');

  cache.set('big', { size: 5000 }, 5000);
  assert.equal(cache.get('big'), null, 'ก้อนใหญ่เกินเพดานต้องไม่ถูกแคช');
  assert.equal(cache.stats().misses, 2);

  cache.clear();
  assert.deepEqual(cache.stats(), { entries: 0, bytes: 0, hits: 0, misses: 0, maxEntries: 3, maxBytes: 1000 });
  assert.equal(AudioCache.key({ provider: 'x', voice: 'v', model: 'm', lang: 'th', text: ' hi ' }), 'x|v|m|th|hi');
});

test('router caches audio per text and skips the second fetch', async () => {
  const audio = fakeAudio();
  let fetches = 0;
  const r = new TTSRouter({
    settings: () => ({ ttsProvider: 'openai', ttsCache: true }),
    voice: fakeVoice(),
    serverUrl: () => 'http://srv',
    fetchImpl: async () => { fetches++; return { ok: true, blob: async () => ({ size: 8 }) }; },
    audioFactory: () => audio,
  });
  globalThis.URL.createObjectURL = () => 'blob:y';
  globalThis.URL.revokeObjectURL = () => {};

  const first = await r.speak('ข้อความเดิม');
  const second = await r.speak('ข้อความเดิม');
  assert.equal(fetches, 1);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(r.cacheStats().hits, 1);
  assert.equal(audio.played, 2, 'ยังต้องเล่นเสียงทั้งสองครั้ง');

  await r.speak('เปลี่ยนข้อความ');
  assert.equal(fetches, 2);

  r.clearCache();
  assert.equal(r.cacheStats().entries, 0);
  await r.speak('ข้อความเดิม');
  assert.equal(fetches, 3, 'หลังล้างแคชต้องดึงใหม่');
});

test('ttsCache=false disables caching', async () => {
  let fetches = 0;
  const r = new TTSRouter({
    settings: () => ({ ttsProvider: 'openai', ttsCache: false }),
    voice: fakeVoice(),
    serverUrl: () => 'http://srv',
    fetchImpl: async () => { fetches++; return { ok: true, blob: async () => ({ size: 8 }) }; },
    audioFactory: () => fakeAudio(),
  });
  globalThis.URL.createObjectURL = () => 'blob:z';
  globalThis.URL.revokeObjectURL = () => {};
  await r.speak('ซ้ำ');
  await r.speak('ซ้ำ');
  assert.equal(fetches, 2);
  assert.equal(r.cacheStats().entries, 0);
});
