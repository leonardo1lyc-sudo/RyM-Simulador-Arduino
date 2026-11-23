#include "WebServer.h"
#include <NetChannel.h>

static const char *reason(int c) { switch (c) { case 200: return "OK"; case 201: return "Created"; case 204: return "No Content"; case 301: return "Moved Permanently"; case 302: return "Found"; case 303: return "See Other"; case 400: return "Bad Request"; case 401: return "Unauthorized"; case 404: return "Not Found"; case 500: return "Internal Server Error"; default: return ""; } }
static void out(const char *s) { netch::respond((const uint8_t *)s, strlen(s)); }
static void outS(const String &s) { netch::respond((const uint8_t *)s.c_str(), s.length()); }

void WebServer::begin() { esp32_net_event("S", String(_port).c_str()); }
void WebServer::on(const String &uri, HTTPMethod method, THandlerFunction fn) { if (_nh < 16) { _h[_nh].uri = uri; _h[_nh].method = method; _h[_nh].fn = fn; _nh++; } }
static int hexv(char c) { return c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : c >= 'A' && c <= 'F' ? c - 'A' + 10 : 0; }
static String decode(const char *s, int n) { String o; o.reserve(n); for (int i = 0; i < n; i++) { char c = s[i]; if (c == '+') o += ' '; else if (c == '%' && i + 2 < n) { o += (char)(hexv(s[i + 1]) * 16 + hexv(s[i + 2])); i += 2; } else o += c; } return o; }
void WebServer::addArgs(const char *s, int n) {
  int i = 0;
  while (i < n && _nargs < 12) {
    int j = i; while (j < n && s[j] != '&') j++;
    int eq = i; while (eq < j && s[eq] != '=') eq++;
    if (j > i) { _argName[_nargs] = decode(s + i, eq - i); _argVal[_nargs] = eq < j ? decode(s + eq + 1, j - eq - 1) : String(); _nargs++; }
    i = j + 1;
  }
}
void WebServer::parse() {
  const char *r = netch::request(); int n = netch::requestLength();
  _nargs = 0; _extra = ""; _sent = false; _chunked = false; _clen = CONTENT_LENGTH_UNKNOWN; _clenSet = false;
  const char *sp = strchr(r, ' '); if (!sp) { _uri = "/"; _method = HTTP_GET; return; }
  int ml = sp - r;
  _method = !strncmp(r, "POST", ml) ? HTTP_POST : !strncmp(r, "PUT", ml) ? HTTP_PUT : !strncmp(r, "DELETE", ml) ? HTTP_DELETE : !strncmp(r, "PATCH", ml) ? HTTP_PATCH : !strncmp(r, "HEAD", ml) ? HTTP_HEAD : HTTP_GET;
  const char *u = sp + 1, *ue = u; while (*ue && *ue != ' ' && *ue != '\r') ue++;
  const char *q = u; while (q < ue && *q != '?') q++;
  _uri = decode(u, q - u);
  if (q < ue) addArgs(q + 1, ue - q - 1);
  const char *body = strstr(r, "\r\n\r\n");
  if (body && _method == HTTP_POST) { body += 4; int bl = n - (body - r); if (bl > 0) { if (strstr(r, "application/x-www-form-urlencoded")) addArgs(body, bl); else if (_nargs < 12) { _argName[_nargs] = "plain"; _argVal[_nargs] = String(body).substring(0, bl); _nargs++; } } }
}
void WebServer::handleClient() {
  if (!netch::hasRequest()) return;
  parse();
  THandlerFunction fn = nullptr;
  for (int i = 0; i < _nh; i++) if (_h[i].uri == _uri && (_h[i].method == HTTP_ANY || _h[i].method == _method)) { fn = _h[i].fn; break; }
  if (fn) fn(); else if (_notFound) _notFound(); else send(404, "text/plain", "Not found: " + _uri);
  netch::end();
}
String WebServer::arg(const String &name) { for (int i = 0; i < _nargs; i++) if (_argName[i] == name) return _argVal[i]; return String(); }
bool WebServer::hasArg(const String &name) { for (int i = 0; i < _nargs; i++) if (_argName[i] == name) return true; return false; }
void WebServer::sendHeader(const String &name, const String &value, bool) { _extra += name + ": " + value + "\r\n"; }
void WebServer::head(int code, const char *type, size_t len) {
  String h = "HTTP/1.1 " + String(code) + " " + reason(code) + "\r\n";
  if (type) h += "Content-Type: " + String(type) + "\r\n";
  if (len != CONTENT_LENGTH_UNKNOWN) h += "Content-Length: " + String((unsigned long)len) + "\r\n";
  h += _extra + "Connection: close\r\n\r\n"; _extra = ""; outS(h); _sent = true;
}
void WebServer::send(int code, const char *type, const String &content) {
  // setContentLength(CONTENT_LENGTH_UNKNOWN) + sendContent(...): sin Content-Length, el cuerpo termina al cerrar
  head(code, type ? type : "text/html", _clenSet ? _clen : content.length());
  if (content.length()) outS(content);
}
void WebServer::send(int code, const char *type, const uint8_t *content, size_t len) { head(code, type, len); netch::respond(content, len); }
void WebServer::send_P(int code, PGM_P type, PGM_P content) { send_P(code, type, content, strlen_P(content)); }
void WebServer::send_P(int code, PGM_P type, PGM_P content, size_t len) {
  char t[40]; strncpy_P(t, type, sizeof t - 1); t[sizeof t - 1] = 0; head(code, t, len);
  uint8_t b[32]; for (size_t i = 0; i < len; i += sizeof b) { size_t k = len - i < sizeof b ? len - i : sizeof b; memcpy_P(b, content + i, k); netch::respond(b, k); }
}
void WebServer::sendContent(const String &content) { outS(content); }
void WebServer::sendContent_P(PGM_P content) { uint8_t b[32]; size_t len = strlen_P(content); for (size_t i = 0; i < len; i += sizeof b) { size_t k = len - i < sizeof b ? len - i : sizeof b; memcpy_P(b, content + i, k); netch::respond(b, k); } }
