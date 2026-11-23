#pragma once
#include <Arduino.h>
#include <Server.h>
#include "WiFiClient.h"
class WiFiServer : public Server {
public:
  explicit WiFiServer(uint16_t port = 80, uint8_t max = 4) : _port(port) {}
  void begin() override { begin(_port); }
  void begin(uint16_t port);
  WiFiClient available();
  WiFiClient accept() { return available(); }
  bool hasClient();
  void setNoDelay(bool) {}
  void end() {}
  void close() {}
  void stop() {}
  size_t write(uint8_t b) override { return 0; }
  operator bool() { return _on; }
  using Print::write;
private:
  uint16_t _port; bool _on = false;
};
