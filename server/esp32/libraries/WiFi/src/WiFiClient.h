// Cliente TCP del modo compatible: solo sirve para responder peticiones del panel Navegador (WiFiServer).
#pragma once
#include <Arduino.h>
#include <Client.h>
#include <IPAddress.h>
class WiFiClient : public Client {
public:
  WiFiClient() : _srv(false) {}
  explicit WiFiClient(bool server) : _srv(server) {}
  int connect(IPAddress ip, uint16_t port) override;
  int connect(const char *host, uint16_t port) override;
  int connect(const char *host, uint16_t port, int32_t) { return connect(host, port); }
  size_t write(uint8_t b) override;
  size_t write(const uint8_t *buf, size_t size) override;
  int available() override;
  int read() override;
  int read(uint8_t *buf, size_t size) override;
  int peek() override;
  void flush() override {}
  void stop() override;
  uint8_t connected() override;
  operator bool() override { return connected(); }
  IPAddress remoteIP() { return IPAddress(192, 168, 1, 23); }
  uint16_t remotePort() { return 51234; }
  IPAddress localIP() { return IPAddress(192, 168, 1, 50); }
  void setTimeout(uint32_t ms) { Stream::setTimeout(ms); }
  void setNoDelay(bool) {}
  using Print::write;
private:
  bool _srv;
};
