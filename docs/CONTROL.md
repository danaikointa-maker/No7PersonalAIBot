# Computer control (เดสก์ท็อปเท่านั้น)

No7 สั่งงานเครื่องได้ — แต่ต้องผ่าน **allowlist ที่คุณตั้งเอง** และทุกครั้งถูกบันทึก
ค่าเริ่มต้นคือ **ปิด** เปิดเมื่อคุณไว้ใจเท่านั้น

```
ผู้ใช้/Agent → control_run tool (risk 3, ต้องยืนยัน) → checkControl(policy)
            → ControlAudit (บันทึก)
            → Electron bridge → main process (ตรวจ allowlist อีกชั้น) → ระบบ
```

## การกระทำที่รองรับ (`control_run`)

| action | ทำอะไร | ความเสี่ยง | ต้องอยู่ใน allowlist |
|---|---|---|---|
| `open_app` | เปิดโปรแกรม/ไฟล์ (`target`) | 1 | ✅ `allowApps` |
| `open_url` | เปิดลิงก์ http/https | 0 | — |
| `clipboard` | คัดลอกข้อความ (`text`) | 0 | — |
| `run_command` | รันคำสั่ง (`target`) แบบไม่มี shell | 3 | ✅ `allowCommands` |

## ตั้งค่า (หน้าตั้งค่า → ควบคุมคอมพิวเตอร์)

- **เปิดให้ No7 สั่งงานเครื่อง** — switch ปิดไว้เป็นค่าเริ่มต้น
- **โปรแกรมที่อนุญาต** — บรรทัดละชื่อ รองรับ `*` และ `?` เช่น `code`, `note*`, `chrome`
- **คำสั่งที่อนุญาต** — เฉพาะชื่อคำสั่งแรก (binary) เช่น `git`, `node` (ไม่ใช่ `git status`)
- **สูงสุดต่อนาที** — กันการยิงรัว (default 6)

เก็บใน `settings.controlPolicy` (localStorage) และประวัติใน `no7.control.audit.v1` (50 รายการล่าสุด)

## ชั้นป้องกัน 3 ชั้น

1. **Permission gate** — `control_run` เป็น risk 3 → ต้องกดอนุญาต (ยกเว้น autonomy = `allow-all`)
2. **Policy ในเบราว์เซอร์** — allowlist + deny patterns + rate limit + audit
3. **Main process (Electron)** — ตรวจ `NO7_CONTROL_ALLOW_COMMANDS` ซ้ำ, ไม่ใช้ shell, timeout 10 วิ, `maxBuffer` 512KB

### deny patterns (ปฏิเสธเสมอ แม้อยู่ใน allowlist)

`rm -rf /`, `mkfs`, `dd if=`, `shutdown/reboot`, `diskpart`, `format C:`, `reg delete`,
`del /s /q`, fork bomb, `curl|wget … | sh`, `sudo/doas`, `chmod 777 /`, เขียนลง `/dev/sd*`,
และ **ตัวดำเนินการเชลล์** ทั้งหมด (`;`, `&`, `|`, `>`, `` ` ``, `$`)

## การเปิดคำสั่งในเดสก์ท็อป

```bash
# อนุญาตเฉพาะคำสั่งเหล่านี้ (ค่าเริ่มต้น = ไม่มีอะไรเลย)
NO7_CONTROL_ALLOW_COMMANDS="git,node,npm" npm run desktop
```

- `no7:run-command` ใช้ `execFile(binary, args)` — ไม่มีการตีความ shell
- `no7:open-app` เปิดได้เฉพาะ path ที่มีอยู่ หรือชื่อที่แมปไว้ (calculator/notepad/explorer/terminal/settings)
- bridge ที่เปิดให้หน้าเว็บ: `openApp`, `openExternal`, `copyText`, `notify`, `runCommand`, `controlInfo`

## Audit

หน้าตั้งค่าแสดง 6 รายการล่าสุด + สรุป (อนุญาต/ปฏิเสธ) มีปุ่มล้าง log
ในรายงาน diagnostics จะไม่มีการส่งเนื้อหาคำสั่งออกไป (เฉพาะจำนวน)

## ข้อจำกัด

- ใช้ได้เฉพาะ Electron (เบราว์เซอร์/มือถือได้ error ที่อ่านรู้เรื่อง)
- ยังไม่มี UI automation (คลิก/พิมพ์ตามหน้าจอ) — ต้องใช้ accessibility API เพิ่ม
- `run_command` เป็นแบบ one-shot (ไม่มี interactive/stdin)
- allowlist เป็นแบบชื่อ binary ไม่ได้จำกัด path — ถ้าต้องการเข้มกว่านี้ให้ตั้ง allowlist ที่ระดับ OS
