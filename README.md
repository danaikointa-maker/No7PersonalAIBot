# No7 Personal AI Bot

> ผู้ช่วย AI ส่วนตัวที่ **โค้ดชุดเดียวกันรันได้ทั้งมือถือและ PC** — พูดไทยก่อน ใช้เสียงได้ มีความจำระยะยาว เรียกเครื่องมือจริงได้
> และ **ทำงานได้ทุกบทบาทในที่เดียว**: เพื่อนคุย · ผู้ช่วยงาน · ชีวิตประจำวัน · ศูนย์ควบคุมอุปกรณ์

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
npm test             # 34 unit tests
npm run test:browser # 26 end-to-end checks (รันแอปจริงใน jsdom)
npm run check        # ตรวจ syntax + ไฟล์สำคัญ
```

---

## ทำอะไรได้แล้ว (v0.2)

**เลือกได้ทั้งหมด — 5 บทบาทในที่เดียว**

แถบโหมดใต้หน้าจอ: `✨ ทั้งหมด` · `💛 เพื่อนคุย` · `💼 งาน` · `📅 ชีวิตประจำวัน` · `🏠 อุปกรณ์`
โหมด "ทั้งหมด" จะอ่านเจตนาแล้วสลับบทบาทเอง (ไม่ต้องเลือกก่อนพูด) และกรองเครื่องมือให้เหมาะกับบทบาท

**ทำงานหลายก้าว + มีประตูอนุญาต**

No7 เรียกเครื่องมือต่อเนื่องได้ถึง 4 ขั้นต่อคำสั่ง (ปรับได้ 1–8) และทุกการกระทำที่ "เสี่ยง" จะขึ้นกล่องยืนยันก่อน:
`อนุญาต` · `อนุญาตตลอด session` · `ไม่อนุญาต` — เลือกระดับอิสระได้ที่ตั้งค่า (`ถามก่อนทุกครั้ง` / `ถามเมื่อเสี่ยง` / `ทำได้เลย`)

**โหมดค่าใช้จ่าย 4 แบบ** (เลือกได้ตามใจ หรือใช้ "ผสม" เป็นค่าเริ่มต้น)

| โหมด | สมองที่ใช้ | เหมาะกับ |
|---|---|---|
| ฟรี 100% | Pollinations (+Ollama ถ้ามี) | ใช้ฟรีไม่จำกัด |
| คุณภาพสูงสุด | Gemini/OpenAI เมื่อมีคีย์ → fallback ฟรี | คำตอบยากๆ |
| ส่วนตัวล้วน | Ollama ในเครื่องเท่านั้น (ไม่ส่งออก) | ข้อมูลอ่อนไหว |
| ผสม (แนะนำ) | ที่ตั้งไว้ → ฟรี → Ollama | สมดุล |

ยิ่งกว่านั้น ถ้าคีย์ผิด (401/403) ระบบจะหยุดทันที ไม่ไล่สลับเจ้าอื่นให้มั่ว

**คุยและฟัง**
- แชทข้อความ + **พูดคุยด้วยเสียงไทย** (Web Speech API: STT `th-TH`, TTS `th-TH`) — ใช้ได้ทั้ง Chrome/Edge/Safari มือถือและ PC
- คำบรรยายใต้หน้าจอ (subtitle) แบบเรียลไทม์ + อวาตาร์ตาสไตล์ Cozmo 14 อารมณ์ ที่ขยับตามสถานะจริง
- 8 personas (No7, Jarvis, Mira, ลุง, Luna, Blacky, Pinky, Mochi) พร้อมกฎภาษา ค่ะ/ครับ อัตโนมัติตามเพศผู้ช่วย

**จำ**
- ความจำระยะยาวในเครื่อง (localStorage) — ข้อเท็จจริง + บันทึกบทสนทนา
- ค้นคืนด้วย **BM25 (k1=1.2, b=0.5)** ตัดคำไทยเป็น bigram + ตัด tone mark ก่อน (หลักการเดียวกับ TextFeatures ของ ESP32)
- เรียนรู้เองแบบ heuristic: "ฉันชื่อ…", "จำไว้ว่า…", "ฉันชอบ…"

**ลงมือทำ (19 tools — ไม่ต้องใช้คีย์สักตัว)**

| หมวด | tools | ความเสี่ยง |
|---|---|---|
| 📖 อ่านข้อมูล | `weather` `air` (PM2.5) `crypto` `fx` (ค่าเงิน) `gold` `wiki` `news` `calc` `system_info` | 0 |
| 🧠 ความจำ | `memory_save` `memory_search` `todo` `note` | 0 |
| ⚡ ทำงานในเครื่อง | `timer` `reminder` (เตือนตามเวลาจริง) `clipboard_copy` `open_url` | 1 |
| ✉️ ร่างข้อความ | `compose_message` (อีเมล/SMS/LINE — คุณกดส่งเอง) | 2 |
| 🎛️ ควบคุมอุปกรณ์ | `open_app` (เดสก์ท็อป) | 3 |

AI เรียกเครื่องมือเองได้ผ่านบล็อก ` ```tool {...} ``` ` แล้วระบบรันจริงและสรุปผลเป็นภาษาพูด
ทุกผลลัพธ์มี **การ์ดบนจอ** และทุกขั้นตอนมีร่องรอยให้ดู (call → result) ตามหลัก "42 tools with on-screen cards" ของ ESP32

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
  src/core/          state machine · memory(BM25) · tools · agent loop · permissions · modes
                     · ai-providers (fallback chain) · voice · personas · prompt · settings
  src/ui/            avatar (14 emotions) · cards
desktop/             Electron host: tray, global hotkey, always-on-top overlay, clipboard/open-app bridge
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
