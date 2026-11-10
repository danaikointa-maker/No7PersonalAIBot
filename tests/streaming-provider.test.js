import test from 'node:test';
import assert from 'node:assert/strict';
import { AIProvider, ModelFallback, chatWithFallbackStream } from '../web/src/core/ai-providers.js';

const sseBody = (events) => new ReadableStream({
  start(controller) {
    const enc = new TextEncoder();
    for (const e of events) controller.enqueue(enc.encode(e));
    controller.close();
  },
});

function mockFetchOnce(res) {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return res; };
  return calls;
}

test('pollinations SSE streams deltas and returns full text', async () => {
  mockFetchOnce({
    ok: true,
    body: sseBody([
      'data: {"choices":[{"delta":{"content":"สวัสดี"}}]}\n',
      'data: {"choices":[{"delta":{"content":"ครับ"}}]}\n',
      'data: [DONE]\n',
    ]),
  });
  const p = new AIProvider({ provider: 'pollinations', model: 'openai' });
  const tokens = [];
  const text = await p.chatStream([{ role: 'user', content: 'hi' }], { onToken: (d) => tokens.push(d) });
  assert.equal(text, 'สวัสดีครับ');
  assert.deepEqual(tokens, ['สวัสดี', 'ครับ']);
});

test('ollama NDJSON streaming works', async () => {
  mockFetchOnce({
    ok: true,
    body: sseBody([
      '{"message":{"content":"หนึ่ง"},"done":false}\n',
      '{"message":{"content":" สอง"},"done":false}\n',
      '{"message":{"content":"","done":true}}\n',
    ]),
  });
  const p = new AIProvider({ provider: 'ollama', model: 'llama3.1', baseUrl: 'http://localhost:11434' });
  const tokens = [];
  const text = await p.chatStream([{ role: 'user', content: 'hi' }], { onToken: (d) => tokens.push(d) });
  assert.equal(text, 'หนึ่ง สอง');
  assert.deepEqual(tokens, ['หนึ่ง', ' สอง']);
});

test('gemini SSE extracts candidate parts', async () => {
  mockFetchOnce({
    ok: true,
    body: sseBody(['data: {"candidates":[{"content":{"parts":[{"text":"ทดสอบ"}]}}]}\n']),
  });
  const p = new AIProvider({ provider: 'gemini', model: 'gemini-2.0-flash', apiKey: 'k' });
  const tokens = [];
  const text = await p.chatStream([{ role: 'user', content: 'hi' }], { onToken: (d) => tokens.push(d) });
  assert.equal(text, 'ทดสอบ');
  assert.deepEqual(tokens, ['ทดสอบ']);
});

test('non-stream response falls back to the whole-message path', async () => {
  let call = 0;
  globalThis.fetch = async () => {
    call++;
    if (call === 1) return { ok: true, json: async () => ({ choices: [{ message: { content: '' } }] }) }; // no body
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'คำตอบก้อนเดียว' } }] }) };
  };
  const p = new AIProvider({ provider: 'pollinations', model: 'openai' });
  const tokens = [];
  const text = await p.chatStream([{ role: 'user', content: 'hi' }], { onToken: (d) => tokens.push(d) });
  assert.equal(text, 'คำตอบก้อนเดียว');
  assert.deepEqual(tokens, ['คำตอบก้อนเดียว']);
});

test('stream errors surface with status code', async () => {
  mockFetchOnce({ ok: false, status: 429, text: async () => 'rate limit' });
  const p = new AIProvider({ provider: 'pollinations', model: 'openai' });
  await assert.rejects(() => p.chatStream([{ role: 'user', content: 'hi' }]), /AI 429/);
});

test('fallback chain streams from the second provider when the first fails', async () => {
  const fallback = new ModelFallback();
  let n = 0;
  globalThis.fetch = async () => {
    n++;
    if (n === 1) return { ok: false, status: 503, text: async () => 'down' };
    return {
      ok: true,
      body: sseBody(['data: {"choices":[{"delta":{"content":"จากเจ้าที่สอง"}}]}\n']),
    };
  };
  const tokens = [];
  const text = await chatWithFallbackStream(
    [{ role: 'user', content: 'hi' }],
    [{ provider: 'pollinations', model: 'openai' }, { provider: 'pollinations', model: 'openai' }],
    { fallback, onToken: (d) => tokens.push(d) },
  );
  assert.equal(text, 'จากเจ้าที่สอง');
  assert.deepEqual(tokens, ['จากเจ้าที่สอง']);
});

test('401 stops the chain instead of trying the next brain', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 401, text: async () => 'bad key' }; };
  await assert.rejects(
    () => chatWithFallbackStream([{ role: 'user', content: 'hi' }], [
      { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'x' },
      { provider: 'pollinations', model: 'openai' },
    ], {}),
    /ไม่ถูกต้อง/,
  );
  assert.equal(calls, 1);
});
