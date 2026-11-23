// WebServer del modo compatible de ESP32 (misma API que la librería del núcleo Arduino-ESP32).
#pragma once
#include <Arduino.h>
#include <WiFi.h>

enum HTTPMethod { HTTP_ANY, HTTP_GET, HTTP_HEAD, HTTP_POST, HTTP_PUT, HTTP_PATCH, HTTP_DELETE, HTTP_OPTIONS };
#define CONTENT_LENGTH_UNKNOWN ((size_t)-1)

class WebServer {
public:
  typedef void (*THandlerFunction)(void);
  explicit WebServer(int port = 80) : _port(port) {}
  void begin();
  void begin(uint16_t port) { _port = port; begin(); }
  void close() {}
  void stop() {}
  void handleClient();
  void on(const String &uri, THandlerFunction fn) { on(uri, HTTP_ANY, fn); }
  void on(const String &uri, HTTPMethod method, THandlerFunction fn);
  void onNotFound(THandlerFunction fn) { _notFound = fn; }
  String uri() { return _uri; }
  HTTPMethod method() { return _method; }
  String arg(const String &name);
  String arg(int i) { return i < _nargs ? _argVal[i] : String(); }
  String argName(int i) { return i < _nargs ? _argName[i] : String(); }
  int args() { return _nargs; }
  bool hasArg(const String &name);
  String header(const String &) { return String(); }
  bool hasHeader(const String &) { return false; }
  void collectHeaders(const char **, size_t) {}
  String hostHeader() { return F("192.168.1.50"); }
  bool authenticate(const char *, const char *) { return true; }
  void requestAuthentication() {}
  void sendHeader(const String &name, const String &value, bool first = false);
  void setContentLength(size_t len) { _clen = len; _clenSet = true; }
  void send(int code, const char *type = nullptr, const String &content = String());
  void send(int code, const String &type, const String &content) { send(code, type.c_str(), content); }
  void send(int code, const char *type, const char *content) { send(code, type, String(content)); }
  void send_P(int code, PGM_P type, PGM_P content);
  void send_P(int code, PGM_P type, PGM_P content, size_t len);
  void send(int code, const char *type, const uint8_t *content, size_t len);
  void sendContent(const String &content);
  void sendContent(const char *content) { sendContent(String(content)); }
  void sendContent_P(PGM_P content);
  void enableCORS(bool = true) {}
  void enableCrossOrigin(bool = true) {}
  WiFiClient client() { return WiFiClient(true); }
private:
  void head(int code, const char *type, size_t len);
  void parse();
  void addArgs(const char *s, int n);
  int _port;
  struct H { String uri; HTTPMethod method; THandlerFunction fn; };
  H _h[16]; int _nh = 0;
  THandlerFunction _notFound = nullptr;
  String _uri; HTTPMethod _method = HTTP_GET;
  String _argName[12], _argVal[12]; int _nargs = 0;
  String _extra; size_t _clen = CONTENT_LENGTH_UNKNOWN; bool _sent = false, _chunked = false, _clenSet = false;
};
