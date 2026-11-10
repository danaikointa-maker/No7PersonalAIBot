import test from 'node:test';
import assert from 'node:assert/strict';
import { StateMachine, STATES } from '../web/src/core/state.js';

test('no provider → SETUP', () => {
  const sm = new StateMachine();
  sm.recompute();
  assert.equal(sm.current, STATES.SETUP);
});

test('request in flight wins over idle', () => {
  const sm = new StateMachine();
  sm.set({ hasProvider: true });
  sm.set({ requestInFlight: true });
  assert.equal(sm.current, STATES.CONNECTING);
});

test('speaking > listening > thinking precedence', () => {
  const sm = new StateMachine();
  sm.set({ hasProvider: true, micActive: true, ttsPlaying: true, toolRunning: true });
  assert.equal(sm.current, STATES.SPEAKING);
  sm.set({ ttsPlaying: false });
  assert.equal(sm.current, STATES.LISTENING);
  sm.set({ micActive: false });
  assert.equal(sm.current, STATES.THINKING);
});

test('error is terminal until cleared', () => {
  const sm = new StateMachine();
  sm.set({ hasProvider: true });
  sm.set({ error: 'boom' });
  assert.equal(sm.current, STATES.ERROR);
  sm.set({ error: null });
  assert.equal(sm.current, STATES.IDLE);
});

test('onChange fires only on transitions', () => {
  const sm = new StateMachine();
  const seen = [];
  sm.onChange((s) => seen.push(s));
  sm.set({ hasProvider: true });
  sm.set({ hasProvider: true });
  sm.set({ micActive: true });
  assert.deepEqual(seen, [STATES.IDLE, STATES.LISTENING]);
});
