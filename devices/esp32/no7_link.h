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
//   link.loop();   // เรียกใน loop()
#pragma once
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <mbedtls/md.h>
#include <functional>

class No7Link {
 public:
  void begin(const String& baseUrl, const String& code, const String& secretHex) {
    baseUrl_ = baseUrl; code_ = code; secretHex_ = secretHex;
  }

  /// callback(command, argsJson, commandId)
  void onCommand(std::function<void(const String&, const String&, const String&)> cb) { handler_ = cb; }

  void loop() {
    if (millis() - lastPoll_ < intervalMs_) return;
    lastPoll_ = millis();
    if (WiFi.status() != WL_CONNECTED) return;
    pollAndRun();
  }

  void report(const String& id, bool ok, const String& dataJson) {
    StaticJsonDocument<512> doc;
    doc["id"] = id;
    doc["ok"] = ok;
    deserializeJson(doc["data"], dataJson.isEmpty() ? "{}" : dataJson);
    String body; serializeJson(doc, body);
    request("POST", "/api/link/result", body);
  }

 private:
  String baseUrl_, code_, secretHex_;
  unsigned long lastPoll_ = 0, intervalMs_ = 3000;
  std::function<void(const String&, const String&, const String&)> handler_;

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
