// Agent loop — หลายก้าวในคำสั่งเดียว พร้อมประตูอนุญาต (permission gate)
// และ callback ยืนยันจากผู้ใช้ก่อนทำงานเสี่ยง
import { extractToolCall, stripToolCalls, runTool, TOOLS, toolMeta } from './tools.js';
import { buildSystemPrompt } from './prompt.js';
import { getMode, detectMode } from './modes.js';
import { isAllowed, needsConfirm, permissionSummary } from './permissions.js';

/**
 * @param {object} deps
 * @param {(messages: object[]) => Promise<string>} deps.chat   AI call (มี fallback อยู่ข้างนอก)
 * @param {object} deps.memory
 * @param {object} deps.settings
 * @param {(evt: object) => void} [deps.onEvent]                thinking / tool / result / denied / error
 * @param {(req: object) => Promise<boolean>} [deps.confirm]    UI ยืนยัน (default = ไม่อนุญาต)
 */
export class Agent {
  constructor({ chat, memory, settings, onEvent = () => {}, confirm = async () => false, maxSteps = 4 }) {
    this.chat = chat;
    this.memory = memory;
    this.settings = settings;
    this.onEvent = onEvent;
    this.confirm = confirm;
    this.maxSteps = maxSteps;
  }

  /** @returns {Promise<{text: string, trace: object[], steps: number, blocked?: string[]}>} */
  async run(userText, { history = [], platform = 'web', persona, modeId } = {}) {
    const mode = getMode(modeId || this.settings.mode || 'auto');
    const hint = (modeId || this.settings.mode) === 'auto' || !modeId ? detectMode(userText) : mode.id;
    const perms = this.settings.permissions;
    const allowedTools = permissionSummary(perms).allowed;

    const system = buildSystemPrompt({
      persona,
      memory: this.retrieve(userText),
      language: this.settings.language,
      polite: this.settings.polite,
      platform,
      mode,
      roleHint: hint,
      permissions: perms,
      allowedCategories: allowedTools,
      maxSteps: this.maxSteps,
    });

    const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: userText }];
    const trace = [];
    const blocked = [];
    let steps = 0;
    let finalText = '';

    while (steps < this.maxSteps) {
      steps++;
      this.onEvent({ type: 'thinking', step: steps, maxSteps: this.maxSteps });
      const reply = await this.chat(messages, {
        onToken: (delta) => this.onEvent({ type: 'token', step: steps, delta }),
      });
      const call = extractToolCall(reply);

      if (!call) {
        finalText = stripToolCalls(reply).trim();
        break;
      }

      const tool = TOOLS[call.name];
      if (!tool) {
        messages.push({ role: 'assistant', content: reply });
        messages.push({ role: 'user', content: `ไม่มีเครื่องมือชื่อ "${call.name}" — เลือกจากรายการที่มีเท่านั้น` });
        this.onEvent({ type: 'error', step: steps, message: `ไม่มีเครื่องมือ ${call.name}` });
        continue;
      }

      // ---- permission gate ----
      if (!isAllowed(call.name, perms)) {
        const cat = toolMeta(call.name).category;
        blocked.push(cat);
        messages.push({ role: 'assistant', content: reply });
        messages.push({
          role: 'user',
          content: `ผู้ใช้ปิดสิทธิ์หมวด "${cat}" อยู่ จึงเรียก ${call.name} ไม่ได้ — บอกผู้ใช้ว่าต้องเปิดสิทธิ์ที่หน้าตั้งค่า > สิทธิ์ แล้วตอบด้วยข้อมูลเท่าที่มี`,
        });
        this.onEvent({ type: 'denied', step: steps, tool: call.name, category: cat });
        continue;
      }

      if (needsConfirm(call.name, perms)) {
        const approved = await this.confirm({
          tool: call.name,
          label: tool.label,
          emoji: tool.emoji,
          args: call.args,
          meta: toolMeta(call.name),
        });
        if (!approved) {
          messages.push({ role: 'assistant', content: reply });
          messages.push({ role: 'user', content: `ผู้ใช้ไม่อนุญาตให้เรียก ${call.name} — หยุดแล้วถามว่าต้องการให้ทำอะไรต่อ` });
          this.onEvent({ type: 'denied', step: steps, tool: call.name, reason: 'user-declined' });
          finalText = 'ไม่เป็นไรครับ ไม่ได้ทำอะไรต่อ — บอกได้เลยถ้าอยากให้ช่วยแบบอื่น';
          break;
        }
      }

      // ---- run ----
      this.onEvent({ type: 'tool', step: steps, tool: call.name, label: tool.label, emoji: tool.emoji, args: call.args });
      try {
        const res = await runTool(call.name, call.args, { memory: this.memory });
        trace.push({ step: steps, ...res });
        this.onEvent({ type: 'result', step: steps, tool: res.tool, data: res.data });
        messages.push({ role: 'assistant', content: reply });
        messages.push({
          role: 'user',
          content: `ผลลัพธ์จากเครื่องมือ ${call.name}: ${JSON.stringify(res.data)}\n\n`
            + 'ถ้าต้องใช้เครื่องมืออื่นต่อเพื่อให้งานสำเร็จ ให้เรียกได้เลย '
            + 'ถ้าเพียงพอแล้วให้สรุปเป็นคำตอบสุดท้ายสำหรับผู้ใช้ (ภาษาไทย ไม่มี JSON)',
        });
      } catch (err) {
        this.onEvent({ type: 'error', step: steps, tool: call.name, message: err.message });
        messages.push({ role: 'assistant', content: reply });
        messages.push({ role: 'user', content: `เครื่องมือ ${call.name} ผิดพลาด: ${err.message}\nบอกผู้ใช้ตรงๆ แล้วเสนอทางเลือกอื่น` });
      }
    }

    if (!finalText) {
      finalText = trace.length
        ? this.summarize(trace)
        : 'ขอโทษครับ ผมยังทำงานนี้ไม่สำเร็จในจำนวนขั้นที่กำหนด — ลองแบ่งคำขอเป็นส่วนเล็กลงได้ไหมครับ';
    }

    return { text: finalText, trace, steps, blocked: [...new Set(blocked)] };
  }

  retrieve(query) {
    const limit = 6;
    return (this.memory?.search(query, limit) || []).map((f) => ({ text: f.text }));
  }

  summarize(trace) {
    const last = trace[trace.length - 1].data;
    const head = [last.title, last.big].filter(Boolean).join(' ');
    const lines = (last.lines || []).slice(0, 3).join(' · ');
    return `${head} ${lines}`.trim();
  }
}
