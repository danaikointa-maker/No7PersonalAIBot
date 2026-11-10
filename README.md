# No7 Personal AI Bot

> ผู้ช่วย AI ส่วนตัวที่ **โค้ดชุดเดียวกันรันได้ทั้งมือถือและ PC** — พูดไทยก่อน ใช้เสียงได้ มีความจำระยะยาว และเรียกเครื่องมือจริงได้

สร้างจากการหลอมหลักการทำงานของสองโปรเจคเดิม:

| ต้นทาง | สิ่งที่เอามา |
|---|---|
| [PersonalAIBot-ESP32](https://github.com/danaikointa-maker/PersonalAIBot-ESP32) | สถาปัตยกรรมเสียงเรียลไทม์, ความจำ GraphRAG-lite (BM25), tool registry + การ์ดผลลัพธ์บนจอ, personas/เสียง, fallback แบบ quota-aware, state machine, phone-link HMAC |
| [uncle-desktop](https://github.com/danaikointa-maker/uncle-desktop) | multi-brain (Ollama/OpenAI/Gemini/ฟรี), TTS/STT หลายเจ้าพร้อม fallback, เพื่อนลอยบนเดสก์ท็อป, ตัวละครแสดงอารมณ์, 7-tab settings, hotkey, ตัวติดตั้ง/อัปเดต |

โปรเจคเดิมฝั่ง ESP32 เหลือแค่ docs/wiki (โค้ดถูกล้างใน v4.9.1) จึง **เขียนหลักการใหม่ทั้งหมดให้เป็นเว็บเทคโนโลยี** แทนการพอร์ตโค้ด

---

## เริ่มใช้ใน 60 วินาที

```bash
npm install
npm run dev          # → http://localhost:5173  (เปิดในมือถือผ่าน Wi-Fi ก็ได้)
```

เปิดมาใช้งานได้ทันที: ค่าเริ่มต้นใช้ **Pollinations** (AI ฟรี ไม่ต้องใช้คีย์)
ถ้าต้องการสมองอื่น → ⚙️ ตั้งค่า → เลือกผู้ให้บริการ (Gemini / OpenAI / Ollama / OpenAI-compatible)

```bash
npm run build        # สร้าง dist/ (ใช้ร่วมกันทั้ง 3 แพลตฟอร์ม)
npm run server       # เสิร์ฟ dist/ + AI proxy + /api/tools  (http://localhost:8787)
npm run desktop      # เปิดเป็นแอปเดสก์ท็อป (Electron)
npm run mobile:sync  # ซิงก์ dist/ เข้าโปรเจค Android/iOS (Capacitor)
npm test             # 23 unit tests
npm run test:browser # 19 end-to-end checks (รันแอปจริงใน jsdom)
npm run check        # ตรวจ syntax + ไฟล์สำคัญ
```

---

## ทำอะไรได้แล้ว (v0.1)

**คุยและฟัง**
- แชทข้อความ + **พูดคุยด้วยเสียงไทย** (Web Speech API: STT `th-TH`, TTS `th-TH`) — ใช้ได้ทั้ง Chrome/Edge/Safari มือถือและ PC
- คำบรรยายใต้หน้าจอ (subtitle) แบบเรียลไทม์ + อวาตาร์ตาสไตล์ Cozmo 14 อารมณ์ ที่ขยับตามสถานะจริง
- 8 personas (No7, Jarvis, Mira, ลุง, Luna, Blacky, Pinky, Mochi) พร้อมกฎภาษา ค่ะ/ครับ อัตโนมัติตามเพศผู้ช่วย

**จำ**
- ความจำระยะยาวในเครื่อง (localStorage) — ข้อเท็จจริง + บันทึกบทสนทนา
- ค้นคืนด้วย **BM25 (k1=1.2, b=0.5)** ตัดคำไทยเป็น bigram + ตัด tone mark ก่อน (หลักการเดียวกับ TextFeatures ของ ESP32)
- เรียนรู้เองแบบ heuristic: "ฉันชื่อ…", "จำไว้ว่า…", "ฉันชอบ…"

**ลงมือทำ (Tools)**
| tool | ทำอะไร | ต้องใช้คีย์ |
|---|---|---|
| `weather` | อากาศ 3 วัน + อุณหภูมิที่รู้สึกได้ | ไม่ |
| `air` | PM2.5 / US AQI + คำแนะนำสุขภาพ | ไม่ |
| `crypto` | BTC/ETH เป็น USD + THB | ไม่ |
| `fx` | อัตราแลกเปลี่ยนบาท | ไม่ |
| `gold` | ราคาทองคำสปอต | ไม่ |
| `wiki` | สรุปจากวิกิพีเดียไทย | ไม่ |
| `news` | ข่าวเทคโนล่าสุด (Hacker News) | ไม่ |
| `timer` / `todo` / `note` | ตั้งเวลา, รายการงาน, โน้ตด่วน | ไม่ (ในเครื่อง) |

AI เรียกเครื่องมือเองได้ผ่านบล็อก ` ```tool {...} ``` ` แล้วระบบจะรันจริงและสรุปผลเป็นภาษาพูด
ทุกผลลัพธ์มี **การ์ดบนจอ** ตามหลัก "42 tools with on-screen cards" ของ ESP32

**ทำงานข้ามอุปกรณ์**
- PWA ติดตั้งได้ (มือถือ + PC) ใช้ไฟล์ชุดเดียวกับ Electron และ Capacitor
- **Companion mode** — อวาตาร์ลอยบนจอ ลากย้ายได้ (Electron = always-on-top จริงพร้อม system tray)
- **Hotkey ระดับระบบ** `Ctrl/Cmd + Shift + Space` = push-to-talk เหมือนปุ่ม BOOT บน ESP32
- **Phone-Link HMAC** — สร้างรหัสจับคู่ + ลายเซ็น HMAC-SHA256 เพื่อให้บอร์ด/มือถืออีกเครื่องเรียกใช้เครื่องมือผ่าน server ได้ (ดู [docs/PHONE_LINK.md](docs/PHONE_LINK.md))
- Fallback แบบ quota-aware: 429 → พัก 30 นาที, 503 → 5 นาที, 404 → 24 ชม., คีย์ผิด (401/403) → ไม่สลับให้เด็ดขาด

---

## โครงสร้างโปรเจค

```
web/                 ← โค้ด UI + core ทั้งหมด (ชุดเดียวที่ทุกแพลตฟอร์มใช้)
  index.html         หน้าหลัก (responsive: sidebar บน PC / drawer บนมือถือ)
  overlay.html       หน้าอวาตาร์โปร่งใส (เดสก์ท็อปคอมแพเนียน)
  src/core/          state machine · memory(BM25) · tools · ai-providers · voice · personas · prompt · settings
  src/ui/            avatar (14 emotions) · cards
desktop/             Electron host: tray, global hotkey, always-on-top overlay, preload bridge
mobile/              ที่สำหรับ native project (สร้างด้วย `npx cap add android|ios`)
server/              optional companion server: static + AI proxy + /api/tools + /api/pair (zero deps)
docs/                ARCHITECTURE · PRINCIPLES · BUILD · PHONE_LINK · CONCEPT · ROADMAP
tests/               node:test unit tests (memory, state, tools, prompt)
```

## เอกสาร

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — โครงสร้าง, state machine, data flow, เหตุผลการออกแบบ
- [docs/PRINCIPLES.md](docs/PRINCIPLES.md) — ตาราง "หลักการจาก repo เดิม → implement ที่ไหนในโค้ดนี้"
- [docs/BUILD.md](docs/BUILD.md) — วิธี build/แพ็กทั้ง web, Windows/macOS/Linux, Android, iOS
- [docs/PHONE_LINK.md](docs/PHONE_LINK.md) — โปรโตคอลจับคู่ HMAC + วิธีต่อ ESP32 เข้ากับแอปนี้
- [docs/CONCEPT.md](docs/CONCEPT.md) — **ช่องว่างที่รอคอนเซ็บของคุณ** (เฟสถัดไป)
- [docs/ROADMAP.md](docs/ROADMAP.md) — สิ่งที่ทำแล้ว / ถัดไป

## ความเป็นส่วนตัว

ค่าเริ่มต้นเก็บทุกอย่างไว้ในเครื่อง (ความจำ, ตั้งค่า, โน้ต) — ไม่มีบัญชี ไม่มีคลาวด์
ข้อความจะถูกส่งไปยังผู้ให้บริการ AI ที่คุณเลือกเท่านั้น และ API key ไม่เคยถูกส่งไปที่อื่นนอกจาก provider นั้น

## License

MIT — ดู [LICENSE](LICENSE)
