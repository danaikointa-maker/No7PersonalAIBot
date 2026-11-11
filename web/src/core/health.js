const DAY = 24 * 60 * 60 * 1000;

export function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
}

function timeOf(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value == null || value === '') return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textOf(item) {
  return String(item?.text ?? item?.title ?? item?.content ?? '').trim();
}

function issue(id, severity, count, detail, fixable = false) {
  return { id, severity, count, detail, fixable };
}

const PENALTY = { high: 18, medium: 10, low: 4 };

export function analyzeHealth({
  facts = [], notes = [], todos = [], tasks = [], events = [], now = Date.now(),
  staleDays = 90, unusedDays = 30,
} = {}) {
  const issues = [];
  const cleanup = { facts: [], notes: [], todos: [] };
  const add = (item) => { if (item.count > 0) issues.push(item); };

  const duplicateIndices = (items, keyFor, keepNewest = false) => {
    const groups = new Map();
    items.forEach((item, index) => {
      const key = keyFor(item);
      if (!key) return;
      const list = groups.get(key) || [];
      list.push(index);
      groups.set(key, list);
    });
    const marked = [];
    for (const indexes of groups.values()) {
      if (indexes.length < 2) continue;
      let keep = indexes[0];
      if (keepNewest) {
        keep = indexes.reduce((best, index) => timeOf(items[index]?.ts ?? items[index]?.updatedAt ?? items[index]?.createdAt) > timeOf(items[best]?.ts ?? items[best]?.updatedAt ?? items[best]?.createdAt) ? index : best);
      }
      marked.push(...indexes.filter((index) => index !== keep));
    }
    return marked.sort((a, b) => a - b);
  };

  const dupFacts = duplicateIndices(facts, (item) => normalizeText(textOf(item)), true);
  cleanup.facts.push(...dupFacts.map((i) => facts[i]?.id).filter((id) => id != null));
  add(issue('dup-facts', 'medium', dupFacts.length, 'ความจำที่มีข้อความซ้ำกัน', true));

  const dupTodos = duplicateIndices(todos, (item) => normalizeText(textOf(item)), true);
  cleanup.todos.push(...dupTodos);
  add(issue('dup-todos', 'medium', dupTodos.length, 'รายการที่ต้องทำซ้ำกัน', true));

  const emptyNotes = [];
  notes.forEach((item, i) => { if (!textOf(item)) emptyNotes.push(i); });
  cleanup.notes.push(...emptyNotes);
  add(issue('empty-notes', 'high', emptyNotes.length, 'โน้ตว่างหรือไม่มีข้อความ', true));

  const emptyTodos = [];
  todos.forEach((item, i) => { if (!textOf(item)) emptyTodos.push(i); });
  cleanup.todos.push(...emptyTodos);
  add(issue('empty-todos', 'high', emptyTodos.length, 'รายการที่ต้องทำว่างหรือไม่มีข้อความ', true));
  cleanup.todos = [...new Set(cleanup.todos)].sort((a, b) => a - b);

  const stale = facts.filter((fact) => {
    if (fact?.pinned) return false;
    const lastSeen = Math.max(timeOf(fact?.ts ?? fact?.createdAt), timeOf(fact?.usedAt), timeOf(fact?.lastUsedAt));
    const unused = Number(fact?.used ?? 0) === 0 && (now - lastSeen) >= unusedDays * DAY;
    return lastSeen > 0 && now - lastSeen >= staleDays * DAY && unused;
  });
  add(issue('stale-facts', 'low', stale.length, 'ความจำเก่าที่ไม่ได้ใช้งานและไม่ได้ปักหมุด'));

  const activeTasks = tasks.filter((task) => !(task?.done || task?.completed || task?.status === 'done'));
  const overdue = activeTasks.filter((task) => {
    const due = timeOf(task?.dueMs ?? task?.due ?? task?.dueAt);
    return due > 0 && due < now;
  });
  const oldestOverdue = overdue.reduce((max, task) => Math.max(max, now - timeOf(task?.dueMs ?? task?.due ?? task?.dueAt)), 0);
  add(issue('overdue-tasks', oldestOverdue >= 14 * DAY ? 'high' : 'medium', overdue.length, 'งานที่เลยกำหนด (เกิน 14 วันจัดเป็นความสำคัญสูง)'));
  const undated = activeTasks.filter((task) => !timeOf(task?.dueMs ?? task?.due ?? task?.dueAt));
  add(issue('undated-tasks', 'low', undated.length, 'งานที่ยังไม่ได้กำหนดวันครบกำหนด'));

  const pastEvents = events.filter((event) => {
    const start = timeOf(event?.start ?? event?.startMs ?? event?.startAt);
    return start > 0 && start < now;
  });
  add(issue('past-events', 'low', pastEvents.length, 'นัดหมายที่เริ่มไปแล้ว (ตรวจสอบว่าควรเก็บไว้หรือไม่)'));

  const deductions = issues.reduce((sum, entry) => sum + Math.min(PENALTY[entry.severity] * Math.max(1, Math.ceil(entry.count / 3)), 30), 0);
  const score = Math.max(0, Math.min(100, 100 - deductions));
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D';
  const counts = { facts: facts.length, notes: notes.length, todos: todos.length, tasks: tasks.length, events: events.length };
  const suggestions = issues.length
    ? issues.filter((entry) => !entry.fixable).map((entry) => entry.detail)
    : ['ข้อมูลอยู่ในสภาพดี — ไม่มีอะไรต้องแก้'];
  const report = { now, score, grade, gradeLabel: { A: 'ดีมาก', B: 'ดี', C: 'ควรตรวจสอบ', D: 'ต้องดูแล' }[grade], counts, issues, cleanup, suggestions };
  report.markdown = healthMarkdown(report);
  return report;
}

const LABELS = {
  th: { title: 'สุขภาพข้อมูล', counts: 'รายการข้อมูล', issues: 'ปัญหาที่พบ', suggestions: 'คำแนะนำ', kind: 'ประเภท', count: 'จำนวน', facts: 'ความจำ', notes: 'โน้ต', todos: 'สิ่งที่ต้องทำ', tasks: 'งาน', events: 'นัดหมาย', none: 'ไม่พบปัญหา', cleanup: ' — ล้างได้อย่างปลอดภัย', grade: { A: 'ดีมาก', B: 'ดี', C: 'ควรตรวจสอบ', D: 'ต้องดูแล' } },
  en: { title: 'Data health', counts: 'Data counts', issues: 'Issues found', suggestions: 'Suggestions', kind: 'Collection', count: 'Count', facts: 'Memories', notes: 'Notes', todos: 'To-dos', tasks: 'Tasks', events: 'Events', none: 'No issues found', cleanup: ' — safe to clean', grade: { A: 'Excellent', B: 'Good', C: 'Needs review', D: 'Needs attention' } },
};
const ISSUE_EN = {
  'dup-facts': 'Duplicate memories', 'dup-todos': 'Duplicate to-dos',
  'empty-notes': 'Empty notes', 'empty-todos': 'Empty to-dos',
  'stale-facts': 'Old, unused memories', 'overdue-tasks': 'Overdue tasks',
  'undated-tasks': 'Tasks without a due date', 'past-events': 'Past events',
};
const SUGGESTION_EN = {
  'ความจำเก่าที่ไม่ได้ใช้งานและไม่ได้ปักหมุด': 'Review old, unused, unpinned memories.',
  'งานที่เลยกำหนด (เกิน 14 วันจัดเป็นความสำคัญสูง)': 'Review overdue tasks; items overdue by more than 14 days are high severity.',
  'งานที่ยังไม่ได้กำหนดวันครบกำหนด': 'Add due dates to active tasks where useful.',
  'นัดหมายที่เริ่มไปแล้ว (ตรวจสอบว่าควรเก็บไว้หรือไม่)': 'Review past events and remove them if no longer needed.',
};

export function healthMarkdown(report, lang = 'th') {
  const english = lang === 'en';
  const l = LABELS[english ? 'en' : 'th'];
  const counts = Object.entries(report.counts || {}).map(([key, value]) => `| ${l[key] || key} | ${value} |`).join('\n');
  const issues = (report.issues || []).map((entry) => {
    const label = english ? (ISSUE_EN[entry.id] || entry.detail) : entry.detail;
    return `- **${entry.severity.toUpperCase()}** ${label} (${entry.count})${entry.fixable ? l.cleanup : ''}`;
  }).join('\n') || `- ${l.none}`;
  const suggestions = (report.suggestions || []).map((text) => `- ${english ? (SUGGESTION_EN[text] || text) : text}`).join('\n') || `- ${l.none}`;
  return `# ${l.title} — ${report.score}/100 (${report.grade}: ${l.grade[report.grade] || report.grade})\n\n## ${l.counts}\n| ${l.kind} | ${l.count} |\n|---|---:|\n${counts}\n\n## ${l.issues}\n${issues}\n\n## ${l.suggestions}\n${suggestions}`;
}

export function applyCleanup(cleanup = {}, data = {}) {
  const removeFacts = new Set(cleanup.facts || []);
  const removeNotes = new Set(cleanup.notes || []);
  const removeTodos = new Set(cleanup.todos || []);
  const facts = (data.facts || []).filter((item) => !removeFacts.has(item?.id));
  const notes = (data.notes || []).filter((_, index) => !removeNotes.has(index));
  const todos = (data.todos || []).filter((_, index) => !removeTodos.has(index));
  return {
    facts, notes, todos,
    removed: { facts: (data.facts || []).length - facts.length, notes: (data.notes || []).length - notes.length, todos: (data.todos || []).length - todos.length },
  };
}
