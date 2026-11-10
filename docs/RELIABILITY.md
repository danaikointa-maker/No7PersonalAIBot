# Reliability & Performance

เป้าหมาย: **ไม่ทำให้ผู้ใช้ต้องเริ่มใหม่** เมื่อเน็ตสะดุด และ **เห็นได้ว่าเวลาหายไปไหน**
ทุกอย่างเก็บในเครื่อง ไม่มี telemetry ออกนอกเครื่อง

## 1) Retry / backoff — `web/src/core/retry.js`

```
withRetry(fn, { retries, baseMs, maxMs, jitter, isRetryable, onRetry })
```

| ชนิด error | ลองใหม่? | ตัวอย่าง |
|---|---|---|
| `429` | ✅ | ผู้ให้บริการคิดเงิน/quota ชั่วคราว |
| `408`, `504` | ✅ | timeout ที่ gateway |
| `5xx` | ✅ | ผู้ให้บริการล่ม |
| network (`Failed to fetch`, `ECONNREFUSED`, `ETIMEDOUT`) | ✅ | ออฟไลน์/สลับ Wi-Fi |
| `401`, `403` | ❌ | key ผิด — ลองกี่ครั้งก็ไม่ผ่าน |
| `4xx` อื่น | ❌ | คำขอผิดรูปแบบ |

- ดีเลย์แบบ exponential: `min(maxMs, baseMs × 2^attempt)` + jitter ±25% (กันเครื่องยิงพร้อมกัน)
- ค่าเริ่มต้นในแชท: `retries: 1, baseMs: 400` — ลองซ้ำ **เฉพาะเมื่อยังไม่มี token ไหลออกมา**
  (ถ้าเริ่มพูดไปแล้ว การลองใหม่จะทำให้ข้อความซ้ำ)
- `classifyError()` ใช้ร่วมกับ UI เพื่อบอกผู้ใช้ว่า "สะดุดเพราะอะไร"
- `sleep(ms, { signal })` ยกเลิกได้ด้วย `AbortController`

## 2) Offline outbox — `OfflineQueue`

- พิมพ์ข้อความตอนออฟไลน์ → เก็บลง `localStorage` key `no7.outbox.v1` พร้อมแสดง badge "📥 ค้างส่ง n"
- กลับมาออนไลน์ → `drain()` ส่งตามลำดับ, สำเร็จ = เอาออกจากคิว, ล้มเหลว = หยุดแล้วรอรอบหน้า
- จำกัด 20 รายการ, TTL 24 ชั่วโมง, ทิ้งรายการที่ลองเกิน 3 ครั้ง (กันคิวบวม)
- ส่งไม่เกินทีละข้อความ และไม่แทรกขณะ No7 กำลังตอบ (`busy`)

## 3) Metrics — `web/src/core/metrics.js`

เก็บตัวอย่างล่าสุด 300 รายการใน `no7.metrics.v1`

| kind | วัดอะไร |
|---|---|
| `chat` | token แรก (first token), เวลารวม, สำเร็จ/ไม่สำเร็จ, ผู้ให้บริการ |
| `tool` | เวลาต่อเครื่องมือ (จาก `Agent.onToolTiming`) + สำเร็จ |
| `tts` | เวลาสังเคราะห์เสียง (system/openai) |

สรุปที่แสดงในหน้าตั้งค่า: จำนวนครั้ง, เฉลี่ย, p50, p95, first-token เฉลี่ย, อัตราสำเร็จ + top label
(ปุ่ม "ล้างสถิติ" ลบได้ทันที)

## 4) Diagnostics — `web/src/core/diagnostics.js`

`buildDiagnosticsReport()` สร้าง markdown ที่ผู้ใช้ **คัดลอกหรือดาวน์โหลด** ส่งให้ผู้ดูแลได้

- **ปิดข้อมูลอ่อนไหวก่อนเสมอ**: `sk-…`, `AIza…`, `gh*_…`, `Bearer …`, hex ยาว ≥32, อีเมล, เบอร์โทร, `key=/token=/secret=`
- URL ถูกตัด query/hash และตัด username:password ออก (`redactUrl`)
- เนื้อหา: เวลา, แอป/แพลตฟอร์ม/UA, ตั้งค่าที่ไม่ลับ, capability, สถิติ, MCP server, พื้นที่เก็บข้อมูล, error ล่าสุด 8 รายการ
- ข้อความปิดท้ายเตือนให้ตรวจซ้ำก่อนแชร์
- ไฟล์: `no7-diagnostics-YYYYMMDD-HHmm.md`

## 5) ข้อจำกัด

- retry ครอบเฉพาะแชท (ผู้ให้บริการ AI) — เครื่องมือภายนอกมี retry ของตัวเองหรือไม่ก็รายงาน error ตรง ๆ
- offline outbox เก็บเฉพาะข้อความแชท ไม่รวมคำสั่งเครื่องมือ (กันการสั่งงานซ้ำโดยไม่ตั้งใจ)
- metrics เป็น sampling ในเครื่อง ไม่ใช่ APM — ไม่มี distributed tracing
- เวลาที่วัดเป็น `performance.now()` ฝั่งเบราว์เซอร์ รวมเวลา render ด้วย
