// Derived state machine — merged from ESP32 (AgentController) + Uncle (listening states).
// State is DERIVED from facts every tick, never stored as events (avoids drift).

export const STATES = {
  SETUP: 'SETUP',           // no provider / no key yet
  CONNECTING: 'CONNECTING', // AI request in flight
  LISTENING: 'LISTENING',   // mic active
  THINKING: 'THINKING',     // tool running / waiting for AI
  SPEAKING: 'SPEAKING',     // TTS playing
  IDLE: 'IDLE',
  ERROR: 'ERROR',
  SLEEP: 'SLEEP',           // idle long → dim / sleep
};

export class StateMachine {
  constructor() {
    this.facts = {
      hasProvider: false,
      requestInFlight: false,
      micActive: false,
      toolRunning: false,
      ttsPlaying: false,
      error: null,
      lastActivity: Date.now(),
      sleepAfterMs: 5 * 60 * 1000,
    };
    this.current = STATES.SETUP;
    this.listeners = new Set();
  }

  set(patch) {
    Object.assign(this.facts, patch);
    if (patch.micActive || patch.requestInFlight) this.facts.lastActivity = Date.now();
    this.recompute();
  }

  touch() { this.facts.lastActivity = Date.now(); this.recompute(); }

  recompute() {
    const f = this.facts;
    let next;
    if (f.error) next = STATES.ERROR;
    else if (!f.hasProvider) next = STATES.SETUP;
    else if (f.requestInFlight) next = STATES.CONNECTING;
    else if (f.ttsPlaying) next = STATES.SPEAKING;
    else if (f.micActive) next = STATES.LISTENING;
    else if (f.toolRunning) next = STATES.THINKING;
    else if (Date.now() - f.lastActivity > f.sleepAfterMs) next = STATES.SLEEP;
    else next = STATES.IDLE;

    if (next !== this.current) {
      this.current = next;
      for (const fn of this.listeners) fn(next);
    }
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}
