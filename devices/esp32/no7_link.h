// No7 Phone-Link client สำหรับ ESP32 (Arduino core)
// - เซ็น HMAC-SHA256 ด้วย mbedtls (มีมาใน ESP-IDF/Arduino)
// - poll คำสั่งทุก N วินาที แล้วเรียก callback ให้โปรแกรมหลักทำงาน
//
// ใช้งาน:
//   No7Link link;
//   link.begin("http://192.168.1.10:8787", "119577", SECRET_HEX);
//   link.onCommand([](const String& cmd, const String& argsJson) {
//     if (cmd == "eyes") { /* เปลี่ยนอารมณ์ตา */ }
//     link.report(id, true, "{\"ok\":1}");
//   });
//   link.hello("จอโต๊ะทำงาน", "esp32", "{\"mic\":true,\"eyes\":true}");
//   link.onEyes([](const String& emotion, int intensity, bool stale) { /* วาดตา */ });
//   link.loop();   // เรียกใน loop()
#pragma once
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <mbedtls/md.h>
#include <mbedtls/base64.h>
#include <functional>

class No7Link {
 public:
  void begin(const String& baseUrl, const String& code, const String& secretHex) {
    baseUrl_ = baseUrl; code_ = code; secretHex_ = secretHex;
  }

  /// callback(command, argsJson, commandId)
  void onCommand(std::function<void(const String&, const String&, const String&)> cb) { handler_ = cb; }

  void loop() {
    if (WiFi.status() != WL_CONNECTED) return;
    if (millis() - lastPoll_ >= intervalMs_) {
      lastPoll_ = millis();
      pollAndRun();
    }
    if (millis() - lastEyes_ >= eyesIntervalMs_) {
      lastEyes_ = millis();
      pollEyes();
    }
  }

  void report(const String& id, bool ok, const String& dataJson) {
    StaticJsonDocument<512> doc;
    doc["id"] = id;
    doc["ok"] = ok;
    deserializeJson(doc["data"], dataJson.isEmpty() ? "{}" : dataJson);
    String body; serializeJson(doc, body);
    request("POST", "/api/link/result", body);
  }

  /* ---- 13.1 hello: บอก server ว่าบอร์ดนี้เป็นใคร มีอะไรบ้าง ---- */
  bool hello(const String& name, const String& kind = "esp32", const String& capsJson = "{}") {
    StaticJsonDocument<384> doc;
    doc["name"] = name;
    doc["kind"] = kind;
    doc["firmware"] = "no7-esp32/1.5";
    deserializeJson(doc["capabilities"], capsJson.isEmpty() ? "{}" : capsJson);
    String body; serializeJson(doc, body);
    return request("POST", "/api/link/hello", body).indexOf("\"ok\":true") >= 0;
  }

  /* ---- 13.2 eyes: ส่งอารมณ์ขึ้น server (จอ = บอร์ดนี้เอง หรือเครื่องอื่น) ---- */
  bool sendEyes(const String& emotion, int intensity = 80, int ttlMs = 15000) {
    StaticJsonDocument<192> doc;
    doc["emotion"] = emotion;
    doc["intensity"] = intensity;
    doc["ttlMs"] = ttlMs;
    String body; serializeJson(doc, body);
    return request("POST", "/api/link/eyes", body).indexOf("\"ok\":true") >= 0;
  }

  /// callback(emotion, intensity, stale) — เรียกเฉพาะเมื่อค่าที่ได้เปลี่ยนจากเดิม
  void onEyes(std::function<void(const String&, int, bool)> cb) { eyesHandler_ = cb; }

  /// อ่านอารมณ์ล่าสุดแล้วเรียก callback (ถ้ามีและเปลี่ยน)
  void pollEyes() {
    if (!eyesHandler_) return;
    String payload = request("GET", "/api/link/eyes");
    if (payload.isEmpty()) return;
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, payload)) return;
    if (doc["eyes"].isNull()) return;
    String emotion = doc["eyes"]["emotion"] | "";
    int intensity = doc["eyes"]["intensity"] | 80;
    bool stale = doc["eyes"]["stale"] | false;
    String key = emotion + "|" + String(intensity) + "|" + String(stale ? 1 : 0);
    if (key == lastEyesKey_) return;
    lastEyesKey_ = key;
    eyesHandler_(emotion, intensity, stale);
  }

  /* ---- 13.3 voice: ส่ง chunk เสียงขึ้น server ให้ PC ดึงไปเล่น ---- */
  bool sendVoice(const uint8_t* data, size_t len, bool final = false) {
    if (len == 0) return false;
    size_t b64Len = 0;
    mbedtls_base64_encode(nullptr, 0, &b64Len, data, len);
    if (b64Len == 0) return false;
    char* b64 = (char*)malloc(b64Len + 1);
    if (!b64) return false;
    size_t written = 0;
    int rc = mbedtls_base64_encode((unsigned char*)b64, b64Len + 1, &written, data, len);
    if (rc != 0) { free(b64); return false; }
    b64[written] = '\0';
    DynamicJsonDocument doc(b64Len + 256);
    doc["chunk"] = b64;
    doc["mime"] = "audio/ogg";
    doc["final"] = final;
    String body; serializeJson(doc, body);
    String res = request("POST", "/api/link/voice", body);
    free(b64);
    return res.indexOf("\"ok\":true") >= 0;
  }

 private:
  String baseUrl_, code_, secretHex_;
  unsigned long lastPoll_ = 0, intervalMs_ = 3000;
  unsigned long lastEyes_ = 0, eyesIntervalMs_ = 1000;
  String lastEyesKey_;
  std::function<void(const String&, const String&, const String&)> handler_;
  std::function<void(const String&, int, bool)> eyesHandler_;

  static void hexToBytes(const String& hex, uint8_t* out, size_t len) {
    for (size_t i = 0; i < len; i++) out[i] = strtoul(hex.substring(i * 2, i * 2 + 2).c_str(), nullptr, 16);
  }

  String sign(const String& method, const String& path, const String& body) {
    String canonical = method + "\n" + path + "\n" + body;
    uint8_t secret[64];
    size_t secretLen = secretHex_.length() / 2;
    hexToBytes(secretHex_, secret, secretLen);

    uint8_t hmac[32];
    const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
    mbedtls_md_context_t ctx; mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, info, 1);
    mbedtls_md_hmac_starts(&ctx, secret, secretLen);
    mbedtls_md_hmac_update(&ctx, (const uint8_t*)canonical.c_str(), canonical.length());
    mbedtls_md_hmac_finish(&ctx, hmac);
    mbedtls_md_free(&ctx);

    String hex;
    for (int i = 0; i < 32; i++) { char b[3]; snprintf(b, 3, "%02x", hmac[i]); hex += b; }
    return hex;
  }

  String request(const String& method, const String& path, const String& body = "") {
    HTTPClient http;
    http.begin(baseUrl_ + path);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-No7-Code", code_);
    http.addHeader("X-No7-Signature", sign(method, path, body));
    int status = method == "POST" ? http.POST(body) : http.GET();
    String out = status > 0 ? http.getString() : "";
    http.end();
    return out;
  }

  void pollAndRun() {
    String payload = request("GET", "/api/link/poll");
    if (payload.isEmpty()) return;
    StaticJsonDocument<2048> doc;
    if (deserializeJson(doc, payload)) return;
    for (JsonObject c : doc["commands"].as<JsonArray>()) {
      String id = c["id"] | "";
      String cmd = c["command"] | "";
      String args; serializeJson(c["args"], args);
      if (handler_) handler_(cmd, args, id);
    }
  }
};
