# Build & แพ็กเกจ

ใช้ Node ≥ 20 (ทดสอบด้วย Node 22)

## 1) เว็บ / PWA (ใช้ได้ทันทีทั้งมือถือและ PC)

```bash
npm install
npm run dev        # dev server (HMR) — เปิดจากมือถือใน Wi-Fi เดียวกันได้: http://<ip>:5173
npm run build      # → dist/  (index.html + overlay.html + sw.js + icon.svg)
npm run preview    # ดู production build
npm run server     # เสิร์ฟ dist/ + API ที่ http://localhost:8787
```

ติดตั้งเป็นแอป:
- **Android/Chrome** — เมนู ⋮ → "ติดตั้งแอป" / "เพิ่มไปยังหน้าจอโฮม"
- **iOS/Safari** — ปุ่มแชร์ → "เพิ่มไปยังหน้าจอโฮม"
- **PC/Chrome-Edge** — ไอคอนติดตั้งในแถบที่อยู่

> ⚠️ ไมค์ (Web Speech API) ต้องเป็น **secure context**: `https://` หรือ `localhost`
> ถ้าเปิดจากมือถือด้วย `http://192.168.x.x:5173` ไมค์จะถูกบล็อก — ใช้ `npm run server` + reverse proxy ที่มี TLS
> หรือ build เป็นแอป Android/iOS (ข้อ 3) ซึ่งให้สิทธิ์ไมค์เต็ม

## 2) เดสก์ท็อป (Electron)

```bash
npm run build
npm run desktop        # เปิดแอปจาก dist/
npm run desktop:dev    # ชี้ไป dev server (ต้องรัน npm run dev ก่อน)
npm run desktop:dist   # สร้างตัวติดตั้งใน release/ (dmg/zip, nsis/portable, AppImage/deb)
```

สิ่งที่ได้เพิ่มจากเว็บ:
- system tray + เมนู
- `Ctrl/Cmd + Shift + Space` = push-to-talk ทั่วระบบ
- หน้าต่างอวาตาร์โปร่งใส always-on-top (companion)

หมายเหตุ: `electron` และ `electron-builder` โหลดไบนารีตอน `npm install` ถ้าติดตั้งด้วย `--ignore-scripts` จะยังไม่สามารถรันเดสก์ท็อปได้ (ต้อง `npm rebuild electron`)

## 2.1) ออก release + auto-update

### ออกเวอร์ชัน

```bash
# 1) bump version ใน package.json (และ CHANGELOG ถ้ามี)
# 2) tag แล้ว push
git tag v2.0.0 && git push origin v2.0.0
```

`.github/workflows/release.yml` จะทำ 3 อย่างอัตโนมัติ:

| job | ทำอะไร |
|---|---|
| `verify` | check + unit + smoke + build + **perf budget** (ถ้าไม่ผ่าน = ไม่ปล่อย) |
| `desktop` | matrix `ubuntu / macos / windows` → `electron-builder --publish never` แล้วเก็บ artifact |
| `publish` | รวม artifact → GitHub Release; การ trigger แบบ manual เลือก draft หรือเผยแพร่ได้ ส่วนการ push tag จะเผยแพร่ตามค่า workflow |

ไฟล์ที่ workflow นี้สร้าง: `*.exe` (NSIS + portable) สำหรับ Windows, `*.zip` (แอป `.app` สำหรับ macOS) และ `*.deb` สำหรับ Linux พร้อม `latest*.yml` (metadata ของ updater) — macOS package เป็น unsigned และ Linux workflow ปัจจุบันเลือก `.deb` เป็น target

### Auto-update (opt-in, ปิดไว้เป็นค่าเริ่มต้น)

`desktop/updater.js` ต่อ `electron-updater` เฉพาะเมื่อ **ติดตั้งแล้ว (packaged)** และผู้ใช้เปิดเอง:

| env | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `NO7_AUTO_UPDATE=1` | ปิด | เปิดระบบอัปเดต (ต้องเป็นแอปที่ติดตั้งแล้ว) |
| `NO7_UPDATE_FEED` | จาก `build.publish` (GitHub repo) | generic feed URL ถ้าโฮสต์เอง |
| `NO7_UPDATE_CHANNEL` | `latest` | `latest` / `beta` |
| `NO7_UPDATE_AUTO_DOWNLOAD=0` | ดาวน์โหลด | แค่บอกว่ามีเวอร์ชันใหม่ |
| `NO7_UPDATE_CHECK_MS` | `15000` | หน่วงก่อนเช็คครั้งแรก (clamp 3s–10min) |

พฤติกรรม: เช็คครั้งแรกหลังเปิดแอป → แจ้งเตือนผ่าน OS notification ทุกขั้น (มีใหม่/ดาวน์โหลด %/พร้อมติดตั้ง)
→ ติดตั้งเมื่อปิดแอป (`autoInstallOnAppQuit`) — **ไม่รีสตาร์ตเอง** และ tray มีเมนู "ตรวจอัปเดต"

> macOS release นี้ตั้งใจ build แบบ unsigned (`mac.identity: null`) เพื่อไม่เรียก keychain signing ใน CI — ผู้ใช้อาจต้องอนุญาตแอปจากผู้พัฒนาที่ไม่รู้จักตามการตั้งค่าความปลอดภัยของ macOS
> Windows ไม่ต้องมี certificate สำหรับการใช้งานส่วนตัว (SmartScreen อาจเตือนครั้งแรก)

## 3) มือถือ (Capacitor)

```bash
npm install
npm run mobile:add:android   # สร้างโฟลเดอร์ android/ ครั้งแรกครั้งเดียว (ต้องมี Android Studio)
npm run mobile:sync          # build dist/ แล้ว sync เข้า native project
npm run mobile:open:android  # เปิด Android Studio → Run
```

iOS (ต้องมี macOS + Xcode):

```bash
npm run mobile:add:ios
npm run mobile:sync
npx cap open ios
```

สิทธิ์ที่ต้องเปิด:
- **Android** — `RECORD_AUDIO` (Web Speech ใน WebView) ; ถ้าใช้ WebView ของเครื่องบางรุ่นที่ไม่มี speech engine ให้ใช้ native plugin แทน (ROADMAP)
- **iOS** — `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription` ใน `Info.plist`

`webDir` ชี้ไปที่ `dist` (กำหนดใน `capacitor.config.json`) ดังนั้นไฟล์ที่แพ็กคือชุดเดียวกับเว็บและ Electron เป๊ะ

## 4) ทดสอบ

```bash
npm test           # 34 unit tests (memory BM25, state, tools, prompt, agent, permissions)
npm run test:browser  # 26 end-to-end checks: รัน bundle จริงใน jsdom (boot → แชท → tool → ไมค์ → pairing)
npm run check      # syntax check ทุกไฟล์ .js + ตรวจไฟล์สำคัญ
```

`test:browser` ใช้ `jsdom` + `esbuild` (ติดตั้งมาเป็น devDependency แล้ว) — ไม่ต้องเปิดเบราว์เซอร์จริง

## ตัวแปรสภาพแวดล้อม (สำหรับ server)

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `NO7_PORT` | พอร์ต (ค่าเริ่มต้น 8787) |
| `NO7_HOST` | bind address (ค่าเริ่มต้น 0.0.0.0) |
| `GEMINI_API_KEY` | ให้ `/api/chat?provider=gemini` ใช้ |
| `OPENAI_API_KEY` | ให้ `/api/chat?provider=openai` ใช้ |
| `OLLAMA_URL` | ค่าเริ่มต้น `http://localhost:11434` |

API key ของ server ไม่ถูกส่งไปยังเบราว์เซอร์เลย — client เรียก `/api/chat` แล้ว server ใส่ key ให้
