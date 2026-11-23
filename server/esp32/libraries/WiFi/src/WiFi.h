// WiFi simulado del modo compatible de ESP32. La red es ficticia: WiFi.begin conecta en ~1,5 s
// y las páginas del servidor se ven en el panel «Navegador» del simulador.
#pragma once
#include <Arduino.h>
#include <IPAddress.h>
#include "WiFiClient.h"
#include "WiFiServer.h"

typedef enum { WL_NO_SHIELD = 255, WL_IDLE_STATUS = 0, WL_NO_SSID_AVAIL = 1, WL_SCAN_COMPLETED = 2, WL_CONNECTED = 3, WL_CONNECT_FAILED = 4, WL_CONNECTION_LOST = 5, WL_DISCONNECTED = 6 } wl_status_t;
typedef enum { WIFI_OFF = 0, WIFI_STA = 1, WIFI_AP = 2, WIFI_AP_STA = 3, WIFI_MODE_NULL = 0, WIFI_MODE_STA = 1, WIFI_MODE_AP = 2, WIFI_MODE_APSTA = 3 } wifi_mode_t;
typedef enum { WIFI_AUTH_OPEN = 0, WIFI_AUTH_WEP, WIFI_AUTH_WPA_PSK, WIFI_AUTH_WPA2_PSK, WIFI_AUTH_WPA_WPA2_PSK, WIFI_AUTH_WPA2_ENTERPRISE, WIFI_AUTH_WPA3_PSK } wifi_auth_mode_t;
typedef enum { WIFI_POWER_19_5dBm = 78, WIFI_POWER_2dBm = 8 } wifi_power_t;
#define WIFI_SCAN_RUNNING (-1)
#define WIFI_SCAN_FAILED (-2)

class WiFiClass {
public:
  wl_status_t begin(const char *ssid, const char *pass = nullptr, int32_t channel = 0, const uint8_t *bssid = nullptr, bool connect = true);
  wl_status_t begin(const String &ssid, const String &pass = String()) { return begin(ssid.c_str(), pass.c_str()); }
  wl_status_t begin() { return begin(_ssid); }
  wl_status_t status();
  bool isConnected() { return status() == WL_CONNECTED; }
  bool disconnect(bool wifioff = false, bool eraseap = false);
  bool reconnect() { begin(_ssid); return true; }
  bool mode(wifi_mode_t m) { _mode = m; return true; }
  wifi_mode_t getMode() { return _mode; }
  bool setHostname(const char *h) { strncpy(_host, h, sizeof _host - 1); return true; }
  const char *getHostname() { return _host; }
  bool setAutoReconnect(bool) { return true; }
  bool setAutoConnect(bool) { return true; }
  bool setSleep(bool) { return true; }
  bool setTxPower(wifi_power_t) { return true; }
  bool config(IPAddress ip, IPAddress gw = IPAddress(), IPAddress mask = IPAddress(), IPAddress d1 = IPAddress(), IPAddress d2 = IPAddress()) { if (ip != IPAddress()) _ip = ip; return true; }
  void persistent(bool) {}
  IPAddress localIP() { return isConnected() ? _ip : IPAddress(0, 0, 0, 0); }
  IPAddress gatewayIP() { return IPAddress(192, 168, 1, 1); }
  IPAddress subnetMask() { return IPAddress(255, 255, 255, 0); }
  IPAddress dnsIP(uint8_t = 0) { return IPAddress(192, 168, 1, 1); }
  IPAddress broadcastIP() { return IPAddress(192, 168, 1, 255); }
  String macAddress() { return F("24:6F:28:AA:10:5C"); }
  uint8_t *macAddress(uint8_t *m) { const uint8_t v[6] = {0x24, 0x6F, 0x28, 0xAA, 0x10, 0x5C}; memcpy(m, v, 6); return m; }
  String SSID() { return String(_ssid); }
  String psk() { return String(F("********")); }
  String BSSIDstr() { return F("C8:3A:35:12:9B:01"); }
  int32_t RSSI() { return isConnected() ? -58 + (int32_t)(millis() / 1000 % 5) : 0; }
  int32_t channel() { return 6; }
  // punto de acceso propio
  bool softAP(const char *ssid, const char *pass = nullptr, int channel = 1, int hidden = 0, int max = 4);
  bool softAP(const String &ssid, const String &pass = String()) { return softAP(ssid.c_str(), pass.c_str()); }
  bool softAPConfig(IPAddress ip, IPAddress gw, IPAddress mask) { _apIp = ip; return true; }
  IPAddress softAPIP() { return _apIp; }
  String softAPmacAddress() { return F("24:6F:28:AA:10:5D"); }
  uint8_t softAPgetStationNum() { return 1; }
  bool softAPdisconnect(bool = false) { return true; }
  // escaneo: tres redes ficticias
  int16_t scanNetworks(bool async = false, bool hidden = false);
  int16_t scanComplete() { return 3; }
  void scanDelete() {}
  String SSID(uint8_t i);
  int32_t RSSI(uint8_t i);
  wifi_auth_mode_t encryptionType(uint8_t i) { return i == 2 ? WIFI_AUTH_OPEN : WIFI_AUTH_WPA2_PSK; }
  int32_t channel(uint8_t i) { return 1 + 5 * i; }
  int hostByName(const char *, IPAddress &ip) { ip = IPAddress(93, 184, 216, 34); return 1; }
private:
  char _ssid[33] = "";
  char _host[33] = "esp32";
  wifi_mode_t _mode = WIFI_STA;
  unsigned long _t0 = 0;
  bool _on = false;
  IPAddress _ip = IPAddress(192, 168, 1, 50), _apIp = IPAddress(192, 168, 4, 1);
};
extern WiFiClass WiFi;
