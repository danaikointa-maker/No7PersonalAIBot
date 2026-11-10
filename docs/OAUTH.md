# OAuth 2.0 + PKCE

No7 ต่อกับบริการที่ต้องล็อกอิน (Gmail, Google Calendar, Drive) ด้วย **Authorization Code + PKCE**
โดยไม่ต้องมี client secret ในเบราว์เซอร์ และไม่มี token ออกไปนอกเครื่องคุณ

## ลำดับการทำงาน

```
หน้าตั้งค่า (MCP row)  ──กด 🔑──▶  startOAuth()
      │  สร้าง verifier/challenge (S256) + state
      │  เก็บ {id, verifier, state, redirectUri} ใน sessionStorage
      ▼
window.open(authorizeUrl?client_id&redirect_uri&scope&state&code_challenge…)
      ▼  ผู้ใช้ล็อกอิน/ให้สิทธิ์
oauth-callback.html?code=…&state=…
      │  postMessage({type:'no7-oauth', url}) → หน้าหลัก (same-origin เท่านั้น)
      ▼
exchangeCode() → POST /api/oauth/token (companion server) → token endpoint
      ▼
TokenStore (localStorage: no7.oauth.v1)  →  McpClient แนบ Bearer อัตโนมัติ
```

## ฟังก์ชันหลัก (`web/src/core/oauth.js`)

| ฟังก์ชัน | หน้าที่ |
|---|---|
| `createPkcePair()` | สร้าง `verifier` + `challenge` = BASE64URL(SHA-256(verifier)) |
| `randomState()` | state สุ่ม กัน CSRF |
| `buildAuthorizeUrl()` | ประกอบ URL (`response_type=code`, scope, state, PKCE, extra params) |
| `parseCallback(url)` | อ่าน `code` / `state` / `error` จาก redirect |
| `requestToken()` | แลกหรือต่ออายุ token (ผ่าน proxy หรือยิงตรง) |
| `TokenStore` | เก็บ/อ่าน/ลบ token แยกตาม server |
| `OAuthSession` | รวมทุกอย่าง: token ที่ยังไม่หมดอายุ, ต่ออายุอัตโนมัติ, แลก code |

## ต่ออายุ token

- `isExpired(tokens)` ถือว่าหมดอายุเมื่อเหลือ **60 วินาที** (skew) — เรียกก่อนยิงทุกครั้ง
- ถ้าหมดอายุและมี `refresh_token` → `OAuthSession.getAccessToken()` ต่ออายุให้
- ถ้าถูกเรียกพร้อมกันหลายคำขอ จะต่ออายุ **ครั้งเดียว** (promise เดียว) แล้วทุกคนใช้ token ใหม่
- ถ้าต่ออายุไม่สำเร็จ → คืน `null` → MCP call จะได้ `401` และ UI แจ้งให้ล็อกอินใหม่

## ความปลอดภัย

| ประเด็น | การจัดการ |
|---|---|
| client secret | ไม่เก็บในเบราว์เซอร์ (PKCE แทน) — ถ้าจำเป็นใส่ได้ที่ server เท่านั้น |
| token | `localStorage` ของเครื่อง, ไม่ซิงก์, ไม่ขึ้น git |
| redirect hijack | `redirect_uri` ตรงกับที่ลงทะเบียน + `state` ต้องตรงกับที่เก็บไว้ |
| postMessage | รับเฉพาะ `event.origin === location.origin` และ `type === 'no7-oauth'` |
| หน้าต่างป๊อปอัป | `window.open` พร้อม `noopener` โดยพฤติกรรมของเบราว์เซอร์; callback ปิดตัวเอง |
| proxy ปลายทาง | `/api/oauth/token` รับเฉพาะ `http(s)` และส่งเฉพาะฟิลด์ที่กำหนด |

## ข้อจำกัด

- ต้องเปิดแอปผ่าน `https://` หรือ `localhost` (crypto.subtle + popup)
- ยังไม่รองรับ device code flow หรือ dynamic client registration (MCP spec ใหม่)
- provider ที่บังคับ client secret (ไม่มี PKCE) ต้องตั้ง secret ที่ companion server
- ถ้า provider ไม่ยอมให้ redirect ไป `.../oauth-callback.html` ให้ลงทะเบียน URI นั้นใน console ของผู้ให้บริการ
