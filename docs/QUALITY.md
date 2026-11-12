# 🧪 คุณภาพ — Performance budget + E2E

No7 ใช้ด่านตรวจอัตโนมัติใน CI (ทุก PR):

```
npm run check        → syntax + required files + relative Markdown links
npm test             → unit + integration (node --test)
npm run test:browser → flow tests ใน jsdom (รัน bundle จริง)
npm run test:e2e     → Chromium E2E บน browser จริง
npm run build        → ต้อง build ผ่าน + PWA manifest
npm run perf         → performance budget (ต้องอยู่ในเพดาน)
```

## 1) Performance budget

`perf-budget.json` = เพดานที่ตกลงไว้, `tools/perf.js` = ตัววัด

```bash
npm run perf
```

```
📦 Performance budget
| รายการ | วัดได้ | เพดาน | ผล |
| source: ไฟล์ใหญ่สุด | 151.8 KB | 152 KB | ✅ |
| source: รวมทุกโมดูล | 610.2 KB | 800 KB | ✅ |
| dist: bundle หลัก (gzip) | 115.3 KB | 160 KB | ✅ |
...
✅ อยู่ใน budget ทั้งหมด
```

| กลุ่ม | วัดอะไร |
|---|---|
| `source` | ขนาด `web/src/**/*.js` (ไฟล์ใหญ่สุด/รวม/จำนวนโมดูล) + `web/index.html` |
| `dist` | `dist/assets/*.js` และ `.css` — **gzip** (ใกล้เคียงของที่ผู้ใช้โหลดจริง) |

- ถ้า `dist/` ยังไม่มี (เช่นเพิ่ง clone) จะวัดเฉพาะ source และบอก "ข้ามการวัด bundle"
- เกินเพดาน → `exit 1` พร้อมตารางว่าอะไรเกินเท่าไร
- ปรับเพดานได้ที่ `perf-budget.json` (numeric เท่านั้น, ไม่มี glob)

### ทำไม gzip

ผู้ใช้โหลดไฟล์ที่บีบแล้ว (Vite + CDN/เบราว์เซอร์ทำ gzip/brotli ให้อัตโนมัติ) — วัด raw อย่างเดียวจะหลอกตัวเอง
ว่าแอปหนัก ทั้งที่ payload จริงเล็กกว่าหลายเท่า

## 2) E2E (jsdom)

`tests/smoke.browser.mjs` build bundle จริงด้วย esbuild แล้วรันใน jsdom — ตรวจ **206 จุด** ครอบ:

- บูตแอป, persona, โหมด, จำนวนเครื่องมือ (28), settings
- แชท: ส่งข้อความ → mock AI → tool call (`gold`), streaming, mic (mock SpeechRecognition)
- งาน: เพิ่ม/เสร็จ/ตัวกรอง/**งานซ้ำเลื่อนรอบ** (journey), แจ้งเตือนผ่าน server
- ความจำ/ปฏิทิน/อุปกรณ์/เดสก์ท็อป (recipes + dry-run)/MCP (proxy + stdio + device flow)
- i18n: สลับอังกฤษ ↔ ไทย, `<html lang>`
- backup/health: restore ที่ยกเลิกไม่เขียน storage, health-history JSON import ที่ยกเลิกไม่เขียน storage และนำเข้าเฉพาะ summary fields หลังยืนยัน
- ออฟไลน์: คิวข้อความ + flush, diagnostics ที่ปิดข้อมูลอ่อนไหว

> หมายเหตุ: `crypto.subtle` และ `SpeechRecognition` ถูก stub เพราะ jsdom ไม่มี — การทดสอบของจริง
> (เสียง, คลิปบอร์ด, Electron bridge) ต้องรันในเบราว์เซอร์/เดสก์ท็อปแอป

## 3) Real-browser E2E (Playwright + Chromium)

`tests/e2e/chat.spec.js` เปิดแอปผ่าน Vite ใน Chromium จริง ตรวจ boot/navigation และแชทด้วย mock provider; ครอบ permission ทั้งปฏิเสธและอนุญาต/จำสิทธิ์ตลอด session (timer อยู่ใน browser context ทดสอบ), capability report เมื่อ API เสียงไม่มีและเมื่อการขอไมค์ถูกปฏิเสธ, outbox offline ที่ลบได้เมื่อยืนยันและ flush เพียงครั้งเดียวเมื่อกลับมาออนไลน์ รวมถึง backup restore ที่ยกเลิกแล้ว storage ต้องไม่เปลี่ยน และกู้คืนได้หลังผู้ใช้ยืนยัน พร้อมตรวจว่า credentials ในเครื่องยังอยู่และ health history มีเฉพาะ summary metrics ไม่มีการส่งข้อมูลออก

`tests/e2e/capabilities.spec.js` ตรวจ capability report ใน Chromium, Firefox และ WebKit ว่าตรงกับ Web APIs ที่เบราว์เซอร์เปิดเผยจริง และแสดงเหตุผลเมื่อจำลองสภาพแวดล้อมที่ไม่มี API ไมโครโฟน/STT/TTS; เป็นการทดสอบ compatibility ของ browser APIs ไม่ใช่การทดสอบสิทธิ์หรือ hardware จริง ซึ่งยังต้องตรวจบนอุปกรณ์

```bash
npx playwright install chromium # ครั้งแรก
npm run test:e2e
npx playwright install firefox webkit # ครั้งแรก หากจะรัน cross-browser suite
PLAYWRIGHT_BROWSER=firefox npx playwright test tests/e2e/capabilities.spec.js
PLAYWRIGHT_BROWSER=webkit npx playwright test tests/e2e/capabilities.spec.js
```

CI ติดตั้ง Chromium และรัน test ชุดเต็มทุก PR; capability report เพิ่มเติมทดสอบ Chromium/Firefox/WebKit ด้วย ส่วน microphone, wake word และการอนุญาต native ยังต้องทดสอบบนอุปกรณ์จริง

## 4) Integration tests ที่ spawn server จริง

| ไฟล์ | ทดสอบ |
|---|---|
| `tests/server.reminders.test.js` | คิวเตือน + Telegram + งานซ้ำเลื่อนรอบ |
| `tests/server.link.test.js` | hello/eyes/voice + HMAC |
| `tests/server.oauth.test.js` | device flow + DCR proxies |
| `tests/server.tts.test.js` | OpenAI-compatible + ElevenLabs |
| `tests/server.local-models.test.js` | probe/warm + SSRF guard |
| `tests/server.bots.test.js` | Telegram/LINE webhook |

ทุกตัวใช้ `NO7_DATA_DIR` ชี้ไป tmpdir → ไม่ทับข้อมูลจริง

## 5) ข้อจำกัด

- Playwright ครอบ Chromium boot/chat, permission denial/approval/session, offline enqueue/remove/online flush และ backup restore; capability report เทียบ API จริงและกรณีไม่มี API ใน Chromium/Firefox/WebKit; ยังไม่ครอบการจับไมค์/wake word หรือ native APIs บนอุปกรณ์จริง
- ยังไม่มี performance timing (LCP/INP) — มีแค่ขนาดไฟล์; วัด runtime ผ่าน `core/metrics.js` แทน
- budget ตั้งจากค่าจริง + margin ~30–100% — ต้องปรับเมื่อเพิ่มฟีเจอร์ใหญ่
- ค่าตัวอย่างอ้างอิงจากการตรวจล่าสุด; ใช้ `npm run perf` เพื่อวัดค่าปัจจุบันจริงก่อนเปลี่ยน `perf-budget.json`
