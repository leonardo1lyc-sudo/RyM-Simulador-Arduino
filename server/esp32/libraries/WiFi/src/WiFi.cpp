#include "WiFi.h"
#include "NetChannel.h"

WiFiClass WiFi;

/* ---------- canal ---------- */
namespace netch {
  static char buf[640]; static int len = 0, pos = 0, need = -1; static bool ready = false, open = false;
  static int headerEnd() { for (int i = 3; i < len; i++) if (buf[i - 3] == '\r' && buf[i - 2] == '\n' && buf[i - 1] == '\r' && buf[i] == '\n') return i + 1; return -1; }
  void poll() {
    esp32_net_begin();
    while (!ready && Serial3.available()) {
      int c = Serial3.read(); if (len < (int)sizeof buf - 1) buf[len++] = c; buf[len] = 0;
      if (need < 0) { int h = headerEnd(); if (h > 0) { const char *cl = strstr(buf, "Content-Length:"); need = h + (cl && cl < buf + h ? atoi(cl + 15) : 0); } }
      if (need >= 0 && len >= need) { ready = true; pos = 0; }
    }
  }
  bool hasRequest() { poll(); return ready; }
  const char *request() { return buf; }
  int requestLength() { return len; }
  int &readPos() { return pos; }
  bool responding() { return ready; }
  void respond(const uint8_t *b, size_t n) { if (!ready) return; if (!open) { Serial3.write(0x02); open = true; } Serial3.write(b, n); }
  void end() { if (!ready) return; if (!open) Serial3.write(0x02); Serial3.write(0x04); Serial3.flush(); open = false; ready = false; len = 0; pos = 0; need = -1; buf[0] = 0; }
}

/* ---------- WiFi ---------- */
wl_status_t WiFiClass::begin(const char *ssid, const char *pass, int32_t, const uint8_t *, bool) {
  strncpy(_ssid, ssid ? ssid : "", sizeof _ssid - 1); _t0 = millis(); _on = true;
  esp32_net_event("W", _ssid);
  return WL_DISCONNECTED;
}
wl_status_t WiFiClass::status() {
  if (!_on) return WL_IDLE_STATUS;
  if (!_ssid[0]) return WL_NO_SSID_AVAIL;
  if (millis() - _t0 < 1500) return WL_DISCONNECTED;
  static bool told = false; if (!told) { told = true; esp32_net_event("C", _ssid); }
  return WL_CONNECTED;
}
bool WiFiClass::disconnect(bool, bool) { _on = false; esp32_net_event("D", ""); return true; }
bool WiFiClass::softAP(const char *ssid, const char *, int, int, int) { _mode = WIFI_AP; esp32_net_event("A", ssid ? ssid : ""); return true; }
static const char *const NETS[] = {"Casa", "Escuela-WiFi", "Invitados"};
int16_t WiFiClass::scanNetworks(bool, bool) { delay(300); return 3; }
String WiFiClass::SSID(uint8_t i) { return i < 3 ? String(NETS[i]) : String(); }
int32_t WiFiClass::RSSI(uint8_t i) { return -45 - 12 * (int32_t)i; }

/* ---------- WiFiClient (respuestas al panel Navegador) ---------- */
int WiFiClient::connect(IPAddress, uint16_t) { esp32_net_event("X", ""); return 0; }
int WiFiClient::connect(const char *host, uint16_t) { esp32_net_event("X", host ? host : ""); return 0; }
size_t WiFiClient::write(uint8_t b) { if (!_srv || !netch::responding()) return 0; netch::respond(&b, 1); return 1; }
size_t WiFiClient::write(const uint8_t *buf, size_t size) { if (!_srv || !netch::responding()) return 0; netch::respond(buf, size); return size; }
int WiFiClient::available() { if (!_srv || !netch::responding()) return 0; return netch::requestLength() - netch::readPos(); }
int WiFiClient::read() { if (available() <= 0) return -1; return (uint8_t)netch::request()[netch::readPos()++]; }
int WiFiClient::read(uint8_t *buf, size_t size) { int n = 0; while (n < (int)size && available() > 0) buf[n++] = read(); return n; }
int WiFiClient::peek() { if (available() <= 0) return -1; return (uint8_t)netch::request()[netch::readPos()]; }
void WiFiClient::stop() { if (_srv) netch::end(); _srv = false; }
uint8_t WiFiClient::connected() { return _srv && netch::responding(); }

/* ---------- WiFiServer ---------- */
void WiFiServer::begin(uint16_t port) { _port = port; _on = true; esp32_net_event("S", String(port).c_str()); }
bool WiFiServer::hasClient() { return _on && netch::hasRequest(); }
WiFiClient WiFiServer::available() { if (hasClient()) return WiFiClient(true); return WiFiClient(); }
