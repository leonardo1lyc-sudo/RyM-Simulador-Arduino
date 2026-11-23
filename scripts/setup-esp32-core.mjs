// Prepara vendor/esp32-core: copia del núcleo AVR (ATmega2560) con los añadidos que el código de ESP32
// espera (Serial.printf, Serial.begin con pines, Wire.begin(sda, scl), SPI.begin(sck, miso, mosi, ss)).
// Es la base del «modo compatible» de ESP32: el programa corre en un AVR emulado con el pinout del ESP32.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'vendor/ArduinoCore-avr'), DST = path.join(ROOT, 'vendor/esp32-core');
const VERSION = '2';
if (fs.existsSync(path.join(DST, '.version')) && fs.readFileSync(path.join(DST, '.version'), 'utf8') === VERSION) process.exit(0);
fs.rmSync(DST, { recursive: true, force: true });
fs.cpSync(path.join(SRC, 'cores/arduino'), path.join(DST, 'cores/arduino'), { recursive: true });
for (const lib of ['Wire', 'SPI', 'EEPROM', 'SoftwareSerial']) fs.cpSync(path.join(SRC, 'libraries', lib), path.join(DST, 'libraries', lib), { recursive: true });
const patch = (file, find, add, after = true) => {
  const f = path.join(DST, file); let s = fs.readFileSync(f, 'utf8');
  if (!s.includes(find)) throw new Error(`No se encontró «${find}» en ${file}`);
  s = s.replace(find, after ? find + add : add + find); fs.writeFileSync(f, s);
};
patch('cores/arduino/Print.h', '#include "Printable.h"', '\n#include <stdarg.h>\n#include <stdio.h>');
patch('cores/arduino/Print.h', '  public:\n    Print() : write_error(0) {}', `
    size_t printf(const char *fmt, ...) __attribute__((format(printf, 2, 3))) {
      char b[192]; va_list a; va_start(a, fmt); int n = vsnprintf(b, sizeof b, fmt, a); va_end(a);
      if (n <= 0) return 0; if (n >= (int)sizeof b) n = sizeof b - 1; return write((const uint8_t *)b, n);
    }`);
patch('cores/arduino/HardwareSerial.h', '    void begin(unsigned long, uint8_t);', `
    // ESP32: Serial.begin(baudios, SERIAL_8N1, rx, tx) y otras opciones (los pines son fijos en la simulación)
    void begin(unsigned long baud, uint32_t config, int8_t rxPin, int8_t txPin = -1, bool invert = false, unsigned long timeout_ms = 20000UL, uint8_t thr = 112) { (void)rxPin; (void)txPin; (void)invert; (void)timeout_ms; (void)thr; begin(baud, (uint8_t)config); }
    void setPins(int8_t, int8_t, int8_t = -1, int8_t = -1) {}
    size_t setRxBufferSize(size_t n) { return n; }
    size_t setTxBufferSize(size_t n) { return n; }
    void setDebugOutput(bool) {}`);
patch('libraries/Wire/src/Wire.h', '    void begin(int);', `
    bool begin(int sda, int scl, uint32_t frequency = 0) { (void)sda; (void)scl; begin(); if (frequency) setClock(frequency); return true; } // ESP32`);
patch('libraries/SPI/src/SPI.h', '  static void begin();', `
  static void begin(int8_t sck, int8_t miso = -1, int8_t mosi = -1, int8_t ss = -1) { (void)sck; (void)miso; (void)mosi; (void)ss; begin(); } // ESP32`);
patch('cores/arduino/IPAddress.h', '    bool fromString(const String &address) { return fromString(address.c_str()); }', `
    String toString() const { char b[16]; snprintf(b, sizeof b, "%u.%u.%u.%u", _address.bytes[0], _address.bytes[1], _address.bytes[2], _address.bytes[3]); return String(b); } // ESP32`);
fs.writeFileSync(path.join(DST, '.version'), VERSION);
console.log('vendor/esp32-core listo');
