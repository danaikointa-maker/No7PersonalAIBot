# 🖥️ Desktop — หน้าต่างบนจอ + สูตรอัตโนมัติ

No7 รู้ว่ามีอะไรเปิดอยู่บนจอ และทำงานหลายขั้นให้จบในครั้งเดียว — แต่ยังอยู่ในกรอบเดิม:
**allowlist ที่คุณตั้งเอง · audit ทุกครั้ง · dry-run ได้เสมอ · ไม่มี shell**

ใช้ได้จริงเฉพาะ **เดสก์ท็อปแอป (Electron)** — บนเบราว์เซอร์/มือถือจะได้ข้อความบอกเหตุผล ไม่ crash

---

## 1. อ่านรายชื่อหน้าต่าง

| OS | คำสั่งที่ใช้ | ต้องมี |
|---|---|---|
| Windows | `powershell -NoProfile -Command "Get-Process \| Where-Object { $_.MainWindowTitle } \| Select-Object -ExpandProperty MainWindowTitle"` | PowerShell (มีมาให้) |
| macOS | `osascript -e 'tell application "System Events" to get name of every process whose visible is true'` | อนุญาต Accessibility ให้แอป |
| Linux | `wmctrl -l` (โฟกัส: `wmctrl -a`, fallback `xdotool`) | `sudo apt install wmctrl` |

```js
import { listWindows, matchWindows, focusWindow } from './core/desktop.js';

const res = await listWindows();
// { ok: true, windows: ['Chrome — Gmail', 'Visual Studio Code', …] }

matchWindows(res.windows, 'code');          // ['Visual Studio Code']
await focusWindow({ target: 'chrome', windows: res.windows });
```

- การค้นหาให้คะแนน: ตรงตัว (3) > ขึ้นต้นด้วย (2) > มีคำอยู่ข้างใน (1) — รองรับ glob `*`
- อ่านได้สูงสุด 100 หน้าต่าง, ชื่อยาวสุด 120 ตัวอักษร
- `listWindows()` **ไม่ throw** — คืน `{ ok:false, reason, hint }` เพื่อให้ UI แสดงวิธีแก้

## 2. สูตรอัตโนมัติ (recipes)

สูตร = ชื่อ + ลำดับขั้น (สูงสุด **8 ขั้น**) แต่ละขั้นเป็นหนึ่งใน 5 แบบ:

| ขั้น | ตัวอย่าง | หมายเหตุ |
|---|---|---|
| `open_app` | `open_app notepad` | ต้องอยู่ใน `allowApps` |
| `open_url` | `open_url https://calendar.google.com` | เฉพาะ http/https |
| `focus_window` | `focus_window Chrome` | ใช้ชื่อเต็มที่ตรงที่สุด |
| `wait` | `wait 800` | ต่อขั้นไม่เกิน 5,000 ms, รวมไม่เกิน 15,000 ms |
| `notify` | `notify เริ่มงานได้เลย` | Notification ของเครื่อง |

### ตั้งชื่อสูตรในหน้าเว็บ

เมนู **🖥️ เดสก์ท็อป** → ใส่ชื่อ + พิมพ์ขั้นละบรรทัด แล้วกด

- **💾 บันทึกสูตร** — เก็บในเครื่อง (`localStorage: no7.recipes.v1`, สูงสุด 20 สูตร, ชื่อซ้ำ = ทับ)
- **🔍 ลองก่อน (dry-run)** — แสดงทีละขั้นว่าจะทำอะไรได้/ถูกบล็อกเพราะอะไร โดยไม่ทำจริง
- **▶️ รันสูตร** — วิ่งจริงทีละขั้น หยุดทันทีเมื่อขั้นใดล้มเหลว
- **🗑 ลบสูตร**

### ผ่าน tool / แชท

```text
เปิดสูตร "โหมดทำงานเช้า" ให้หน่อย
```

```
tool: run_recipe  { name: "โหมดทำงานเช้า", dryRun: true }
tool: desktop     { action: "list", query: "chrome" }
tool: desktop     { action: "focus", query: "terminal" }
```

ถ้ายังไม่มีสูตร ใส่ `steps` หลายบรรทัดมาได้เลย — No7 จะบันทึกให้:

```
tool: run_recipe { name: "จดงานเร็ว", steps: "open_app notepad\nwait 800\nnotify เปิดโน้ตให้แล้ว" }
```

## 3. ความปลอดภัย

- ทุกขั้น `open_app` / `open_url` ผ่าน `checkControl()` ตัวเดียวกับ `control_run` → ถ้า **ยังไม่เปิด "ควบคุมคอมพิวเตอร์"** หรือแอปไม่อยู่ใน allowlist จะถูกบล็อกพร้อมเหตุผล
- `focus_window` เปลี่ยนแค่ตำแหน่งโฟกัส ไม่ได้พิมพ์/คลิกอะไรแทนคุณ (ไม่ทำ keystroke injection)
- ไม่มีความสามารถรัน shell — `run_command` แยกไปอยู่ที่ `control_run` และยังต้องอยู่ใน `NO7_CONTROL_ALLOW_COMMANDS`
- ทุกการสั่งงานถูกบันทึกใน **audit log** (50 รายการล่าสุด) ที่หน้า ⚙️ ตั้งค่า
- เปิด `dry-run` ก่อนทุกครั้งที่แก้สูตรใหม่ — ปลอดภัยที่สุด

## 4. ข้อจำกัดที่รู้ตัว

- ต้องเปิดแอปเดสก์ท็อปทิ้งไว้ (ไม่ได้ทำงานเป็น background service)
- Linux ต้องติดตั้ง `wmctrl` เอง; ถ้าไม่มี จะอ่านรายการหน้าต่างไม่ได้ (แต่ `open_app`/`open_url`/`notify` ยังใช้ได้)
- macOS ต้องให้สิทธิ์ Accessibility กับแอป ไม่งั้น `osascript` จะได้รายการว่าง
- ยังไม่มีเงื่อนไข (`if`) หรือขั้นที่ต้องรอหน้าต่างขึ้นก่อน (ใช้ `wait` แทน)
- โฟกัสหน้าต่างใช้ชื่อเป็นตัวหลัก — ถ้าหลายหน้าต่างชื่อคล้ายกันมาก อาจได้ตัวแรกที่คะแนนสูงสุด

## 5. ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
|---|---|
| `web/src/core/desktop.js` | parse/match หน้าต่าง, recipe normalize/validate/plan/run, `RecipeStore` |
| `web/src/core/tools.js` | tool `desktop`, `run_recipe` |
| `desktop/main.js` | IPC `no7:list-windows`, `no7:focus-window` (คำสั่งคงที่ของ OS เท่านั้น) |
| `desktop/preload.cjs` | expose `listWindows` / `focusWindow` ให้ bundle เดียวกัน |
| `web/index.html` + `web/src/main.js` | หน้า 🖥️ เดสก์ท็อป |
| `tests/desktop.test.js` | 16 tests (parse/match/recipe/tool/store) |
