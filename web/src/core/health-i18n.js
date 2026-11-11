const COPY = {
  th: {
    title: 'สุขภาพข้อมูล', clean: '🧹 ล้างรายการซ้ำ/ว่าง', undo: '↶ ย้อนกลับการล้าง', noIssues: 'ข้อมูลอยู่ในสภาพดี — ไม่มีปัญหาที่พบ',
    suggestions: 'คำแนะนำ', cleanable: 'รายการที่ล้างได้อย่างปลอดภัย', dupFacts: 'ความจำซ้ำ', emptyNotes: 'โน้ตว่าง', todos: 'รายการซ้ำ/ว่าง',
    history: 'ประวัติสุขภาพ 30 วัน', clearHistory: 'ล้างประวัติ', confirmClearHistory: 'ล้างเฉพาะประวัติคะแนนสุขภาพในเครื่องหรือไม่? ข้อมูลรายการส่วนตัวไม่ได้ถูกเก็บในประวัติ',
    noHistory: 'สแกนสุขภาพข้อมูลเพื่อเริ่มบันทึกแนวโน้ม', historyChart: 'กราฟคะแนนสุขภาพย้อนหลัง', historyPrivacy: 'เก็บเฉพาะวันที่ คะแนน เกรด และจำนวนปัญหา — ไม่มีข้อความส่วนตัว',
    historySaveError: 'บันทึกประวัติไม่ได้ — พื้นที่เก็บข้อมูลอาจไม่พร้อมใช้งาน', historyClearError: 'ล้างประวัติไม่ได้ — พื้นที่เก็บข้อมูลอาจไม่พร้อมใช้งาน',
    exportMarkdown: '⬇️ Markdown', exportCsv: '⬇️ CSV', exportJson: '⬇️ JSON',
    range7: '7 วัน', range30: '30 วัน', rangeLabel: 'ช่วง', noRangeHistory: 'ไม่มีการสแกนในช่วงที่เลือก', daysWithData: 'วันมีข้อมูล', average: 'เฉลี่ย', highest: 'สูงสุด', lowest: 'ต่ำสุด', rangeDelta: 'เปลี่ยนต้น→ปลายช่วง',
    importJson: '⬆️ นำเข้า JSON', importInvalid: 'ไฟล์ประวัติสุขภาพไม่ถูกต้องหรือไม่รองรับ', importReadError: 'อ่านไฟล์ไม่สำเร็จ', importNothing: 'ประวัตินี้ไม่มีรายการใหม่ให้รวม',
    importConfirm: 'นำเข้าประวัติสุขภาพนี้หรือไม่? เพิ่ม {added} · แทนที่ {replaced} · เหมือนเดิม {unchanged} · ประวัติเก่าคงอยู่ · แถวไม่ถูกต้อง {dropped}', importDone: 'นำเข้าประวัติแล้ว',
    confirm: 'ลบเฉพาะรายการซ้ำ/ว่างที่ตรวจพบจำนวน {count} รายการหรือไม่?\nความจำ {facts} · โน้ต {notes} · สิ่งที่ต้องทำ {todos}\nรายการเก่า งาน และนัดหมายจะไม่ถูกลบ',
    cleanError: 'ล้างข้อมูลไม่สำเร็จ — พื้นที่จัดเก็บอาจไม่พร้อมใช้งาน', cleanDone: 'ล้างข้อมูลเรียบร้อย', undoDone: 'ย้อนกลับการล้างแล้ว',
    severity: { high: 'สูง', medium: 'กลาง', low: 'ต่ำ' }, grade: { A: 'ดีมาก', B: 'ดี', C: 'ควรตรวจสอบ', D: 'ต้องดูแล' },
    issues: { 'dup-facts': 'ความจำซ้ำ', 'dup-todos': 'สิ่งที่ต้องทำซ้ำ', 'empty-notes': 'โน้ตว่าง', 'empty-todos': 'สิ่งที่ต้องทำว่าง', 'stale-facts': 'ความจำเก่าที่ไม่ได้ใช้งาน', 'overdue-tasks': 'งานเกินกำหนด', 'undated-tasks': 'งานไม่มีกำหนดวัน', 'past-events': 'นัดหมายที่ผ่านมา' },
  },
  en: {
    title: 'Data health', clean: '🧹 Clean duplicates/empty items', undo: '↶ Undo cleanup', noIssues: 'Your data looks good — no issues found.',
    suggestions: 'Suggestions', cleanable: 'Safe to clean', dupFacts: 'Duplicate memories', emptyNotes: 'Empty notes', todos: 'Duplicate/empty to-dos',
    history: '30-day health history', clearHistory: 'Clear history', confirmClearHistory: 'Clear only the on-device health score history? No personal item text is stored in it.',
    noHistory: 'Run a health scan to start tracking a trend.', historyChart: 'Health score history chart', historyPrivacy: 'Only dates, scores, grades, and issue counts are stored — never personal item text.',
    historySaveError: 'Could not save history — local storage may be unavailable.', historyClearError: 'Could not clear history — local storage may be unavailable.',
    exportMarkdown: '⬇️ Markdown', exportCsv: '⬇️ CSV', exportJson: '⬇️ JSON',
    range7: '7 days', range30: '30 days', rangeLabel: 'Range', noRangeHistory: 'No scans in this range', daysWithData: 'Days with data', average: 'Average', highest: 'High', lowest: 'Low', rangeDelta: 'Change first→latest',
    importJson: '⬆️ Import JSON', importInvalid: 'Invalid or unsupported health-history file.', importReadError: 'Could not read the file.', importNothing: 'This backup contains no new history to merge.',
    importConfirm: 'Import this health history? Add {added} · replace {replaced} · unchanged {unchanged} · older history is kept · invalid rows {dropped}', importDone: 'Health history imported',
    confirm: 'Remove only the {count} duplicate/empty items found?\nMemories {facts} · Notes {notes} · To-dos {todos}\nOld memories, tasks, and events will not be removed.',
    cleanError: 'Cleanup failed — local storage may be unavailable.', cleanDone: 'Cleanup complete', undoDone: 'Cleanup undone',
    severity: { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' }, grade: { A: 'Excellent', B: 'Good', C: 'Needs review', D: 'Needs attention' },
    issues: { 'dup-facts': 'Duplicate memories', 'dup-todos': 'Duplicate to-dos', 'empty-notes': 'Empty notes', 'empty-todos': 'Empty to-dos', 'stale-facts': 'Old, unused memories', 'overdue-tasks': 'Overdue tasks', 'undated-tasks': 'Tasks without due dates', 'past-events': 'Past events' },
  },
};

const SUGGESTIONS_EN = {
  'ความจำเก่าที่ไม่ได้ใช้งานและไม่ได้ปักหมุด': 'Review old, unused, unpinned memories.',
  'งานที่เลยกำหนด (เกิน 14 วันจัดเป็นความสำคัญสูง)': 'Review overdue tasks; items overdue by more than 14 days are high severity.',
  'งานที่ยังไม่ได้กำหนดวันครบกำหนด': 'Add due dates to active tasks where useful.',
  'นัดหมายที่เริ่มไปแล้ว (ตรวจสอบว่าควรเก็บไว้หรือไม่)': 'Review past events and remove them if no longer needed.',
  'ข้อมูลอยู่ในสภาพดี — ไม่มีอะไรต้องแก้': 'Your data looks good — nothing to fix.',
};

export function healthUiCopy(lang = 'th') {
  return COPY[lang === 'en' ? 'en' : 'th'];
}

export function healthSuggestion(text, lang = 'th') {
  return (lang === 'en' ? SUGGESTIONS_EN[text] : null) || text;
}
