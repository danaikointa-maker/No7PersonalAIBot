# mobile/ — host สำหรับ Capacitor

โฟลเดอร์ `android/` และ `ios/` ถูก **generate** ด้วย Capacitor (ไม่ commit ลง git)
ไฟล์ที่แพ็กเข้าแอปคือ `dist/` จาก `npm run build` — ชุดเดียวกับเว็บและ Electron

```bash
npm install
npm run mobile:add:android   # ครั้งแรก (สร้าง ./android)
npm run mobile:sync          # build + copy dist → android/app/src/main/assets/public
npm run mobile:open:android  # เปิด Android Studio
```

iOS (macOS): `npm run mobile:add:ios` → `npm run mobile:sync` → `npx cap open ios`

## สิทธิ์ที่ต้องเปิด

**Android** (`android/app/src/main/AndroidManifest.xml`)
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

**iOS** (`ios/App/App/Info.plist`)
```xml
<key>NSMicrophoneUsageDescription</key>
<string>ใช้ไมโครโฟนเพื่อพูดคุยกับ No7</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>แปลงเสียงพูดไทยเป็นข้อความ</string>
```

## หมายเหตุ vềเสียงบน WebView

`SpeechRecognition` (Web Speech) ใช้ได้บน Chrome/Edge/Safari แต่ **ไม่ใช่ทุก WebView ของ Android**
ถ้าเครื่องเป้าหมายไม่มี ให้สลับไปใช้ native plugin (เช่น `@capacitor-community/speech-recognition` + TTS)
โดยไม่ต้องแก้ UI — จุดต่ออยู่ที่ `web/src/core/voice.js` (เมธอด `listenOnce` / `speak`)

รหัสจับคู่ Phone-Link (`⚙️ ตั้งค่า`) ใช้ `crypto.subtle` ซึ่ง Capacitor WebView (https scheme) รองรับ
