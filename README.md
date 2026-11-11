# No7 Personal AI Bot `v1.5`

> ผู้ช่วย AI ส่วนตัวที่ **โค้ดชุดเดียวกันรันได้ทั้งมือถือและ PC** — พูดไทยก่อน ฟังได้ด้วยเสียง มีความจำระยะยาว
> เรียกเครื่องมือจริง ทำงานหลายก้าวได้ ซิงก์ข้ามเครื่อง และสั่งงานอุปกรณ์ผ่าน HMAC
>
> หลอมหลักการของ [PersonalAIBot-ESP32](https://github.com/danaikointa-maker/PersonalAIBot-ESP32) และ
> [uncle-desktop](https://github.com/danaikointa-maker/uncle-desktop) แล้วเขียนใหม่ให้เป็นเว็บเทคโนโลยี

---

## เริ่มใช้ใน 60 วินาที

```bash
npm install
npm run dev          # → http://localhost:5173  (เปิดในมือถือผ่าน Wi-Fi ก็ได้)
```

ค่าเริ่มต้นใช้ **Pollinations** (AI ฟรี ไม่ต้องใช้คีย์) — เปลี่ยนสมองได้ที่ ⚙️ ตั้งค่า

```bash
npm run build         # dist/ ชุดเดียวสำหรับ PWA + Electron + Capacitor
npm run server        # companion server: static + AI proxy + tools + sync + phone-link
npm run desktop       # เปิดเป็นแอปเดสก์ท็อป (Electron)
npm run mobile:sync   # ซิงก์ dist/ เข้าโปรเจค Android/iOS
npm test              # 266 unit tests
npm run test:browser  # 82 end-to-end checks (รันแอปจริงใน jsdom)
npm run check         # syntax + structure check
```

---

## ทำอะไรได้ (v1.5)

### 🎭 เลือกได้ทั้งหมด — 5 บทบาทในที่เดียว
`✨ ทั้งหมด` (สลับบทบาทเองตามคำขอ) · `💛 เพื่อนคุย` · `💼 งาน` · `📅 ชีวิตประจำวัน` · `🏠 อุปกรณ์`
แต่ละโหมดกรองเครื่องมือและปรับน้ำเสียง — เลือกโหมดเดียวหรือใช้ "ทั้งหมด" ก็ได้

### 🤖 ลงมือทำได้จริง (agent loop + ประตูอนุญาต)
- เรียกเครื่องมือต่อเนื่อง 1–8 ขั้นต่อคำสั่ง แล้วสรุปผลเป็นภาษาพูด
- ทุกการกระทำมีความเสี่ยง 0–3 → `อ่าน` ผ่านฉลุย · `ทำงานเบา/ร่างข้อความ/ควบคุมเครื่อง` ต้องยืนยัน
- กล่องยืนยันมี `อนุญาต` · `อนุญาตตลอด session` · `ไม่อนุญาต` และระดับอิสระ 3 แบบ
- 6 หมวดสิทธิ์ที่ปิดได้: 📖 อ่าน · 🧠 ความจำ · ⚡ ทำงานในเครื่อง · ✉️ ร่างข้อความ · 🎛️ ควบคุมอุปกรณ์ · 🔌 MCP

### 🧠 ความจำที่โตขึ้น
- BM25 (k1=1.2, b=0.5) × importance × recency × pin — ตัดคำไทยเป็น bigram, strip tone mark
- Consolidation: heuristic + AI (opt-in) สรุปบทสนทนาเป็นข้อเท็จจริง, merge ซ้ำ, decay ของเก่า, รายวัน
- ปักหมุด/แก้/ลบ/ค้น/กรอง/Nำเข้า-ส่งออก JSON

### 🔊 เสียงและการตอบ
- สตรีมคำตอบทีละคำ (SSE/NDJSON) + **เริ่มพูดก่อนคำตอบจบ** แล้วหยุดทันทีถ้าเป็นการเรียกเครื่องมือ
- ฟังด้วยเสียงไทย (STT) + **ปลุกด้วยคำว่า "No7"** (หยุดฟังขณะพูด กันเสียงตัวเอง)
- **พูดขัดจังหวะได้ (barge-in)**: โหมด `keyword` ("หยุด/เดี๋ยว/รอ/stop") หรือ `any` พร้อมกันเสียงสะท้อนของตัวเอง
- **TTS 3 ระดับ**: เสียงเครื่อง (ฟรี/ออฟไลน์) · OpenAI-compatible ผ่าน `POST /api/tts` (เปลี่ยน base URL ได้) · ปิดเสียง
  ถ้าผู้ให้บริการล่มจะ fallback ไปเสียงเครื่องให้อัตโนมัติ
- ปรับความเร็ว/pitch/เลือกเสียง, ปุ่มหยุดพูด, คำบรรยายใต้จอ, อวาตาร์ 14 อารมณ์

### 🔌 MCP / เครื่องมือภายนอก
- ต่อ MCP server (JSON-RPC 2.0 over HTTP) ได้เอง — Gmail, ปฏิทิน, ไฟล์, ฐานข้อมูล
- **stdio ในเครื่อง**: companion server spawn MCP process ตาม allowlist `MCP_STDIO_SERVERS` (ไม่ให้เบราว์เซอร์สั่งรันคำสั่งเอง)
- **OAuth 2.0 + PKCE**: ล็อกอิน Gmail/Drive ได้จากหน้าตั้งค่า, ต่ออายุ token อัตโนมัติ, token อยู่ในเครื่องเท่านั้น
- เครื่องมือที่ค้นพบกลายเป็น `mcp__<server>__<tool>` ใช้ผ่าน agent loop และประตูอนุญาต (หมวด `mcp`, risk 2 = ถามก่อน)

### 💬 บอทแชท (Telegram / LINE)
- Telegram webhook (ตรวจ secret token) + LINE webhook (ตรวจ `X-Line-Signature` แบบ constant-time)
- จำบริบทต่อห้อง 16 ข้อความ (TTL 2 ชม.) + คำสั่ง `/start` `/help` `/clear` `/tools`
- token/secret อยู่ที่ server เท่านั้น — หน้าเว็บแค่แสดงสถานะและคัดลอก webhook URL

### 🖥️ ควบคุมคอมพิวเตอร์ (เดสก์ท็อป)
- tool `control_run` (risk 3) เปิดโปรแกรม/ลิงก์ คัดลอกข้อความ หรือรันคำสั่ง — **ปิดไว้เป็นค่าเริ่มต้น**
- allowlist แบบ glob 3 ชั้น: permission gate → policy ในเบราว์เซอร์ → main process (`NO7_CONTROL_ALLOW_COMMANDS`)
- deny patterns (rm -rf, sudo, curl|sh …), ปฏิเสธ shell operator, จำกัดต่อนาที + audit log

### ✅ งาน + เตือนข้ามเครื่อง
- เพิ่มงานด้วยเสียง/ข้อความ ("เตือนส่งรายงานพรุ่งนี้ 9 โมง"), priority 0–3, เตือนตามเวลา
- ซิงก์ข้ามเครื่องแบบ last-write-wins + tombstone (การลบตามไปทุกเครื่อง)
- `parseDue` เข้าใจ ISO, `+30m`, `+2h`, `วันนี้ 18:00`, `พรุ่งนี้ 09:30`

### 🧯 ความเสถียรและความเร็ว
- Retry แบบ exponential + jitter เฉพาะ error ชั่วคราว (429/5xx/network) และไม่ลองซ้ำถ้าเริ่มพูดไปแล้ว
- **คิวออฟไลน์**: พิมพ์ตอนไม่มีเน็ตแล้วเก็บไว้ ส่งอัตโนมัติเมื่อกลับมาออนไลน์
- สถิติในเครื่อง: token แรก, เวลารวม, เวลาต่อเครื่องมือ, p50/p95, อัตราสำเร็จ
- **รายงานปัญหาแบบปิดข้อมูลอ่อนไหว** (key/token/อีเมล/เบอร์โทร) คัดลอกหรือดาวน์โหลด `.md` ได้

### 📱 มือถือ
- PWA shortcuts (`?view=chat|memory|calendar|devices`), แถบออฟไลน์, แผงความสามารถ 15 อย่าง
- จัดการพื้นที่เก็บข้อมูล + ขอ persistent storage + ล้างข้อมูลเป็นกลุ่ม
- เมนู/ปุ่มใหญ่/ปุ่มลัดคีย์บอร์ด (`Ctrl/Cmd+K`, `Ctrl/Cmd+M`, `Esc`, `Ctrl/Cmd+Enter`)

### 🧰 28 tools (ไม่ต้องใช้คีย์)
| หมวด | tools |
|---|---|
| 📖 อ่าน | `weather` `air` `crypto` `fx` `gold` `wiki` `news` `calc` `rss_read` `summarize_url` |
| 🧠 ความจำ | `memory_save` `memory_search` `todo` `note` |
| 📅 ตาราง | `calendar_list` `calendar_add` (+ นำเข้า/ส่งออก `.ics`) |
| ⚡ ทำงานในเครื่อง | `timer` `reminder` `clipboard_copy` `open_url` `task` |
| ✉️ ร่างข้อความ | `compose_message` (อีเมล/SMS/LINE — คุณกดส่งเอง) |
| 🎛️ ควบคุม | `open_app` `control_run` `desktop` `run_recipe` `device_command` `system_info` |

### 🎭 Persona Studio
สร้าง/แก้/ทำสำเนา/ลบ persona เอง — ตัวตน, คำทักทาย, หัวข้อต้องห้าม, คำลงท้าย, สไตล์เสียง

### 🔗 อุปกรณ์ + 🔄 ซิงก์
- Phone-Link: สั่งงาน PC/ESP32 ผ่าน HMAC-SHA256 (`/api/link/*`), มี ESP32 reference client ให้
- ซิงก์มือถือ ↔ PC ผ่าน server ของคุณเอง (`/api/sync`, token) — ไม่มีคลาวด์ ไม่มีบัญชี
- **งาน + เตือนข้ามเครื่อง**: เพิ่มงานด้วยเสียง/ข้อความ, เตือนตามเวลา, ซิงก์แบบ last-write-wins (tombstone สำหรับการลบ)
- **งานซ้ำ + เตือนแม้ปิดแอป**: `daily/weekdays/weekly/monthly/hourly`, server tick ส่ง Telegram, ปิดงานแล้วเลื่อนรอบถัดไปเอง

### 🖥️ เดสก์ท็อป
tray · hotkey ระดับระบบ (`Ctrl/Cmd+Shift+Space`) · overlay always-on-top · clipboard/open-app/notify bridge
- **รู้จักหน้าต่างบนจอ**: อ่านรายชื่อหน้าต่าง (powershell / osascript / wmctrl) + ค้นหา + โฟกัส
- **สูตรอัตโนมัติ (recipes)**: ลำดับขั้น `open_app` / `open_url` / `focus_window` / `wait` / `notify` สูงสุด 8 ขั้น, dry-run ได้, วิ่งผ่าน allowlist เดิม

---

## โครงสร้าง

```
web/                 ชุด UI + core ที่ทุกแพลตฟอร์มใช้
  src/core/          state · memory · consolidate · tools · agent · permissions · modes
                     · ai-providers (stream/fallback) · voice · stream · wake · bargein · tts
                     · mcp · retry · metrics · diagnostics · capabilities · storage
                     · calendar · net · sync · link · prompt · settings · platform
  src/ui/            avatar (14 emotions) · cards
  overlay.html       อวาตาร์โปร่งใสสำหรับเดสก์ท็อป
desktop/             Electron host + preload bridge
mobile/              ที่สำหรับ native project (Capacitor)
server/              companion server (zero deps): static · AI proxy · tools · sync · phone-link
devices/esp32/       reference client (no7_link.h) + คู่มือ
tests/               unit tests + jsdom end-to-end
docs/                เอกสาร 19 ไฟล์
```

## เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | โครงสร้าง, state machine, permission gate, data flow |
| [docs/PRINCIPLES.md](docs/PRINCIPLES.md) | หลักการจาก repo เดิม → อยู่ตรงไหนในโค้ดนี้ |
| [docs/PHASES.md](docs/PHASES.md) | แผนเฟสและสถานะการปิดงาน |
| [docs/MEMORY.md](docs/MEMORY.md) | ความจำ BM25 + consolidation |
| [docs/VOICE.md](docs/VOICE.md) | สตรีมมิ่ง, พูดก่อนจบ, wake word |
| [docs/PERSONA.md](docs/PERSONA.md) | Persona Studio |
| [docs/CONNECTORS.md](docs/CONNECTORS.md) | ปฏิทิน, RSS, sync |
| [docs/MCP.md](docs/MCP.md) | MCP client, stdio bridge, proxy, สิทธิ์, ข้อจำกัด |
| [docs/OAUTH.md](docs/OAUTH.md) | OAuth 2.0 + PKCE, token store, ความปลอดภัย |
| [docs/MOBILE.md](docs/MOBILE.md) | PWA, offline, capability, storage บนมือถือ |
| [docs/RELIABILITY.md](docs/RELIABILITY.md) | retry/backoff, offline queue, metrics, diagnostics |
| [docs/BOTS.md](docs/BOTS.md) | Telegram / LINE bot ผ่าน server |
| [docs/CONTROL.md](docs/CONTROL.md) | computer control + allowlist + audit |
| [docs/TASKS.md](docs/TASKS.md) | งาน, งานซ้ำ, เตือนตามเวลา + เตือนผ่าน server/Telegram |
| [docs/DESKTOP.md](docs/DESKTOP.md) | หน้าต่างบนจอ + สูตรอัตโนมัติ (recipes) |
| [docs/LOCAL_MODELS.md](docs/LOCAL_MODELS.md) | สมองในเครื่อง (Ollama / LM Studio) + สลับอัตโนมัติเมื่อออฟไลน์ |
| [docs/DEVICES.md](docs/DEVICES.md) | Phone-Link protocol + ESP32 |
| [docs/PHONE_LINK.md](docs/PHONE_LINK.md) | HMAC canonical signing + ตัวอย่าง curl |
| [docs/BUILD.md](docs/BUILD.md) | build ทั้ง 3 แพลตฟอร์ม |
| [docs/CONCEPT.md](docs/CONCEPT.md) | คอนเซ็บผู้ใช้ → สเปก |
| [CHANGELOG.md](CHANGELOG.md) | ประวัติเวอร์ชัน |

## ความเป็นส่วนตัว

ทุกอย่างเก็บในเครื่อง (ความจำ, ตั้งค่า, โน้ต, ปฏิทิน, persona, อุปกรณ์)
API key ไม่ถูกส่งออก ไม่ถูกซิงก์ และไม่เคยออกจากเครื่องนอกจากไปยังผู้ให้บริการ AI ที่คุณเลือก
การซิงก์/สั่งงานอุปกรณ์ใช้ server ที่คุณโฮสต์เองในวง LAN

## License

MIT — ดู [LICENSE](LICENSE)
