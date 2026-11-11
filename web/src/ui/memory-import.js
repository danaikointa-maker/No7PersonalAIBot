export function bindMemoryImport(input, {
  memory, maxBytes, collectionLimits, byteSize, confirm, getLang, setStatus, onImported,
} = {}) {
  if (!input || !memory || typeof setStatus !== 'function') return () => {};
  const handleChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > maxBytes) throw new Error('ไฟล์เกินขนาด 20 MiB');
      const text = await file.text();
      if (byteSize(text) > maxBytes) throw new Error('ไฟล์เกินขนาด 20 MiB');
      const payload = JSON.parse(text);
      for (const key of ['facts', 'log']) {
        if (Array.isArray(payload?.[key]) && payload[key].length > collectionLimits[key]) {
          throw new Error(`${key} เกินขีดจำกัด ${collectionLimits[key]} รายการ`);
        }
      }
      const plan = memory.planImport(payload, { merge: true });
      const { added, merged, skipped, logAdded, logSkipped } = plan.result;
      const english = String(getLang?.() || 'th').toLowerCase().startsWith('en');
      const preview = english
        ? `Import memory JSON? Facts: +${added} · merge ${merged} · skip ${skipped}; conversations: +${logAdded} · skipped ${logSkipped}. Existing history stays; nothing is removed.`
        : `นำเข้า memory JSON หรือไม่? ความจำ: เพิ่ม ${added} · รวม ${merged} · ข้าม ${skipped}; บทสนทนา: เพิ่ม ${logAdded} · ข้าม ${logSkipped} — ข้อมูลเดิมคงอยู่ ไม่มีการลบ`;
      if (!confirm?.(preview)) {
        setStatus(english ? 'Memory import cancelled' : 'ยกเลิกการนำเข้าแล้ว');
        return;
      }
      const result = memory.applyImportPlan(plan);
      if (!result) {
        setStatus(english ? 'Memory changed after preview; choose the file again to review a fresh plan' : 'ความจำเปลี่ยนหลังแสดงตัวอย่าง กรุณาเลือกไฟล์อีกครั้งเพื่อตรวจแผนใหม่');
        return;
      }
      setStatus(english
        ? `Imported: +${result.added} facts · merged ${result.merged} · skipped ${result.skipped} · +${result.logAdded} messages`
        : `นำเข้าแล้ว: เพิ่ม ${result.added} · รวม ${result.merged} · ข้าม ${result.skipped} · บทสนทนา +${result.logAdded}`);
      onImported?.();
    } catch (err) {
      const english = String(getLang?.() || 'th').toLowerCase().startsWith('en');
      setStatus(err.code === 'MEMORY_STORAGE_WRITE_FAILED'
        ? (english ? 'Import could not be saved; existing memory is unchanged. Free storage and try again.' : 'บันทึกการนำเข้าไม่สำเร็จ ความจำเดิมยังอยู่ กรุณาจัดการพื้นที่แล้วลองอีกครั้ง')
        : `${english ? 'Invalid file' : 'ไฟล์ไม่ถูกต้อง'}: ${err.message}`);
    } finally {
      event.target.value = '';
    }
  };
  input.addEventListener('change', handleChange);
  return () => input.removeEventListener('change', handleChange);
}
