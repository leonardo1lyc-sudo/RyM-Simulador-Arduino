// Bluetooth serie del ESP32 (modo compatible): los datos van y vienen del panel «Celular» del simulador.
#pragma once
#if defined(CONFIG_IDF_TARGET_ESP32S3) || defined(CONFIG_IDF_TARGET_ESP32C3)
#error "BluetoothSerial (Bluetooth clásico) solo existe en el ESP32 original: el S3 y el C3 solo tienen Bluetooth LE."
#endif
#include <Arduino.h>
class BluetoothSerial : public Stream {
public:
  bool begin(const String &name = "ESP32", bool isMaster = false);
  bool begin(unsigned long) { return begin(String("ESP32")); }
  int available() override { return Serial1.available(); }
  int peek() override { return Serial1.peek(); }
  int read() override { return Serial1.read(); }
  size_t write(uint8_t c) override { return _on ? Serial1.write(c) : 0; }
  size_t write(const uint8_t *b, size_t n) override { return _on ? Serial1.write(b, n) : 0; }
  void flush() override { Serial1.flush(); }
  bool hasClient() { return _on; }
  bool connected(int timeout = 0) { return _on; }
  bool connect(const String &) { return false; }
  bool isReady(bool = false, int = 0) { return _on; }
  void end() { _on = false; }
  bool setPin(const char *) { return true; }
  void enableSSP() {}
  bool register_callback(void *) { return true; }
  using Print::write;
private:
  bool _on = false;
};
