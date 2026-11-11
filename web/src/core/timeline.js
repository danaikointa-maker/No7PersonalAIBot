// Timeline ของการทำงานหลายขั้น — ทำให้ผู้ใช้เห็นว่า No7 กำลังทำอะไร ถึงขั้นไหน และหยุดได้จริง
//
// คลาสนี้ไม่แตะ DOM และไม่เรียก AI → เทสต์ได้ตรง ๆ
// ลำดับ event ที่ Agent ส่งมา: thinking → tool → result/denied/error … → (จบ) หรือ cancelled
import { t as tr } from './i18n.js';

export const STEP_STATUSES = ['running', 'ok', 'error', 'denied', 'cancelled', 'skipped'];

const ICONS = { running: '⏳', ok: '✅', error: '⚠️', denied: '🚫', cancelled: '⏹', skipped: '⏭' };

export function statusIcon(status) {
  return ICONS[status] || '•';
}

export class AgentTimeline {
  /**
   * @param {object} [opts]
   * @param {number} [opts.maxSteps]  จำนวนขั้นสูงสุด (ใช้แสดง "ขั้น 2/4")
   * @param {string} [opts.lang]      th | en — ใช้กับข้อความสรุป
   * @param {() => number} [opts.clock]
   */
  constructor({ maxSteps = 4, lang = 'th', clock = () => Date.now() } = {}) {
    this.maxSteps = Math.max(1, Number(maxSteps) || 4);
    this.lang = lang;
    this.clock = clock;
    this.steps = [];
    this.cancelled = false;
    this.cancelReason = '';
    this.startedAt = null;
    this.finishedAt = null;
  }

  get running() {
    return this.steps.some((s) => s.status === 'running');
  }

  get active() {
    return this.startedAt !== null && this.finishedAt === null;
  }

  start() {
    this.steps = [];
    this.cancelled = false;
    this.cancelReason = '';
    this.startedAt = this.clock();
    this.finishedAt = null;
    return this;
  }

  /** ขั้นที่กำลังวิ่งอยู่ (ตัวสุดท้าย) */
  current() {
    for (let i = this.steps.length - 1; i >= 0; i--) {
      if (this.steps[i].status === 'running') return this.steps[i];
    }
    return null;
  }

  #push(step) {
    const item = { id: this.steps.length + 1, status: 'running', startedAt: this.clock(), ...step };
    this.steps.push(item);
    return item;
  }

  #close(status = 'ok') {
    const cur = this.current();
    if (cur) {
      cur.status = status;
      cur.endedAt = this.clock();
      cur.ms = Math.max(0, cur.endedAt - cur.startedAt);
    }
    return cur;
  }

  /**
   * ป้อน event จาก Agent
   * @param {{type: string, step?: number, tool?: string, label?: string, emoji?: string, message?: string, reason?: string, category?: string, data?: object}} event
   */
  push(event = {}) {
    const { type } = event;
    const label = (th, en) => (this.lang === 'en' ? en : th);

    if (type === 'thinking') {
      const step = event.step || 1;
      this.#close('ok');
      const counter = label(`ขั้น ${step}/${this.maxSteps}`, `step ${step}/${this.maxSteps}`);
      this.#push({ kind: 'thinking', label: `${label('กำลังคิด', 'thinking')} · ${counter}`, step });
      return this.steps.at(-1);
    }

    if (type === 'tool') {
      this.#close('ok');
      const name = event.label || event.tool || '';
      this.#push({
        kind: 'tool',
        tool: event.tool || '',
        label: `${event.emoji ? `${event.emoji} ` : ''}${name}`,
        step: event.step || null,
      });
      return this.steps.at(-1);
    }

    if (type === 'result') {
      const cur = this.current();
      const title = event.data?.title || event.data?.big || '';
      const target = cur?.kind === 'tool' ? cur : null;
      if (target) {
        target.title = String(title);
        target.status = 'ok';
        target.endedAt = this.clock();
        target.ms = Math.max(0, target.endedAt - target.startedAt);
      } else {
        this.#push({ kind: 'result', label: String(title) || label('ผลลัพธ์', 'result'), status: 'ok' });
      }
      return target || this.steps.at(-1);
    }

    if (type === 'denied') {
      const why = event.reason === 'user-declined'
        ? label('ผู้ใช้ไม่อนุญาต', 'declined by user')
        : label(`ถูกบล็อกสิทธิ์ ${event.category || ''}`.trim(), `blocked by permissions ${event.category || ''}`.trim());
      const cur = this.current();
      if (cur) {
        cur.status = 'denied';
        cur.endedAt = this.clock();
        cur.ms = Math.max(0, cur.endedAt - cur.startedAt);
        cur.label = `${cur.label} — ${why}`;
        return cur;
      }
      this.#push({ kind: 'denied', label: `${why}${event.tool ? ` ${event.tool}` : ''}`, status: 'denied' });
      return this.steps.at(-1);
    }

    if (type === 'error') {
      this.#close('error');
      this.#push({
        kind: 'error',
        label: `${label('ผิดพลาด', 'failed')}${event.tool ? ` · ${event.tool}` : ''}: ${event.message || ''}`.trim(),
        status: 'error',
      });
      return this.steps.at(-1);
    }

    if (type === 'cancelled') {
      return this.cancel(event.reason || '');
    }

    return null;
  }

  cancel(reason = '') {
    this.cancelled = true;
    this.cancelReason = String(reason || '');
    for (const s of this.steps) {
      if (s.status === 'running') {
        s.status = 'cancelled';
        s.endedAt = this.clock();
        s.ms = Math.max(0, s.endedAt - s.startedAt);
      }
    }
    this.finishedAt = this.clock();
    return this;
  }

  finish() {
    this.#close('ok');
    this.finishedAt = this.clock();
    return this;
  }

  get durationMs() {
    if (this.startedAt === null) return 0;
    return Math.max(0, (this.finishedAt ?? this.clock()) - this.startedAt);
  }

  summary() {
    const count = (status) => this.steps.filter((s) => s.status === status).length;
    return {
      total: this.steps.length,
      ok: count('ok'),
      running: count('running'),
      error: count('error'),
      denied: count('denied'),
      cancelledSteps: count('cancelled'),
      cancelled: this.cancelled,
      ms: this.durationMs,
      tools: this.steps.filter((s) => s.kind === 'tool' && s.tool).map((s) => s.tool),
    };
  }

  /** บรรทัดเดียวสำหรับ subtitle/status */
  headline() {
    const s = this.summary();
    const secs = s.ms ? ` · ${(s.ms / 1000).toFixed(1)}s` : '';
    if (s.cancelled) return this.lang === 'en' ? `Stopped after ${s.total} step(s)${secs}` : `หยุดแล้วหลัง ${s.total} ขั้น${secs}`;
    if (s.error) return this.lang === 'en' ? `Finished with ${s.error} error(s)${secs}` : `จบแล้ว มีข้อผิดพลาด ${s.error} จุด${secs}`;
    if (!s.total) return this.lang === 'en' ? 'No steps' : 'ยังไม่มีขั้นตอน';
    return this.lang === 'en' ? `Done in ${s.total} step(s)${secs}` : `เสร็จใน ${s.total} ขั้น${secs}`;
  }

  /** ข้อความหลายบรรทัด (ใช้ในการ์ด/รายงาน) */
  toMarkdown() {
    const head = `**${this.headline()}**`;
    const lines = this.steps.map((s) => {
      const extra = s.title ? ` — ${s.title}` : '';
      const ms = s.ms ? ` (${Math.round(s.ms)} ms)` : '';
      return `- ${statusIcon(s.status)} ${s.label}${extra}${ms}`;
    });
    return [head, ...lines].join('\n');
  }

  /** ข้อมูลสำหรับ render (ไม่ผูกกับ DOM) */
  toRows() {
    return this.steps.map((s) => ({
      id: s.id,
      icon: statusIcon(s.status),
      label: s.label,
      title: s.title || '',
      status: s.status,
      ms: s.ms || 0,
    }));
  }
}

/** ป้ายข้อความสำหรับหัวแผง timeline */
export function timelineTitle(lang = 'th') {
  return tr('agent.timeline', { lang });
}
