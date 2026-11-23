// Preferences del ESP32 (modo compatible): pares clave-valor guardados en la EEPROM del AVR emulado.
#pragma once
#include <Arduino.h>
typedef enum { PT_I8, PT_U8, PT_I16, PT_U16, PT_I32, PT_U32, PT_I64, PT_U64, PT_STR, PT_BLOB, PT_INVALID } PreferenceType;
class Preferences {
public:
  bool begin(const char *name, bool readOnly = false, const char *partition = nullptr);
  void end() { _open = false; }
  bool clear();
  bool remove(const char *key);
  bool isKey(const char *key) { return find(key) >= 0; }
  size_t freeEntries();
  PreferenceType getType(const char *key);
  size_t putChar(const char *k, int8_t v) { return putBytes(k, &v, 1); }
  size_t putUChar(const char *k, uint8_t v) { return putBytes(k, &v, 1); }
  size_t putShort(const char *k, int16_t v) { return putBytes(k, &v, 2); }
  size_t putUShort(const char *k, uint16_t v) { return putBytes(k, &v, 2); }
  size_t putInt(const char *k, int32_t v) { return putBytes(k, &v, 4); }
  size_t putUInt(const char *k, uint32_t v) { return putBytes(k, &v, 4); }
  size_t putLong(const char *k, int32_t v) { return putBytes(k, &v, 4); }
  size_t putULong(const char *k, uint32_t v) { return putBytes(k, &v, 4); }
  size_t putLong64(const char *k, int64_t v) { return putBytes(k, &v, 8); }
  size_t putULong64(const char *k, uint64_t v) { return putBytes(k, &v, 8); }
  size_t putFloat(const char *k, float v) { return putBytes(k, &v, 4); }
  size_t putDouble(const char *k, double v) { return putBytes(k, &v, sizeof v); }
  size_t putBool(const char *k, bool v) { uint8_t b = v; return putBytes(k, &b, 1); }
  size_t putString(const char *k, const char *v) { return putBytes(k, v, strlen(v)) ? strlen(v) : 0; }
  size_t putString(const char *k, const String &v) { return putString(k, v.c_str()); }
  size_t putBytes(const char *key, const void *value, size_t len);
  int8_t getChar(const char *k, int8_t d = 0) { get(k, &d, 1); return d; }
  uint8_t getUChar(const char *k, uint8_t d = 0) { get(k, &d, 1); return d; }
  int16_t getShort(const char *k, int16_t d = 0) { get(k, &d, 2); return d; }
  uint16_t getUShort(const char *k, uint16_t d = 0) { get(k, &d, 2); return d; }
  int32_t getInt(const char *k, int32_t d = 0) { get(k, &d, 4); return d; }
  uint32_t getUInt(const char *k, uint32_t d = 0) { get(k, &d, 4); return d; }
  int32_t getLong(const char *k, int32_t d = 0) { get(k, &d, 4); return d; }
  uint32_t getULong(const char *k, uint32_t d = 0) { get(k, &d, 4); return d; }
  int64_t getLong64(const char *k, int64_t d = 0) { get(k, &d, 8); return d; }
  uint64_t getULong64(const char *k, uint64_t d = 0) { get(k, &d, 8); return d; }
  float getFloat(const char *k, float d = NAN) { get(k, &d, 4); return d; }
  double getDouble(const char *k, double d = NAN) { get(k, &d, sizeof d); return d; }
  bool getBool(const char *k, bool d = false) { uint8_t b = d; get(k, &b, 1); return b; }
  String getString(const char *k, const String &d = String());
  size_t getString(const char *k, char *buf, size_t max);
  size_t getBytesLength(const char *key);
  size_t getBytes(const char *key, void *buf, size_t max);
private:
  int find(const char *key);
  bool get(const char *key, void *v, size_t n);
  uint16_t hash(const char *key);
  char _ns[16] = ""; bool _open = false, _ro = false;
};
