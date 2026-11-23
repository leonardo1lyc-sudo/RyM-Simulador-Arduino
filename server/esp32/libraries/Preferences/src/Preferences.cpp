#include "Preferences.h"
#include <EEPROM.h>
// 60 ranuras de 64 bytes: [hash 2][largo 1][datos 61]; hash 0xFFFF = libre
static const int SLOTS = 60, SZ = 64, DATA = 61;
uint16_t Preferences::hash(const char *key) {
  uint16_t h = 5381; for (const char *s = _ns; *s; s++) h = (h * 33) ^ (uint8_t)*s; h = (h * 33) ^ ':'; for (const char *s = key; *s; s++) h = (h * 33) ^ (uint8_t)*s;
  return h == 0xFFFF ? 0xFFFE : h;
}
static uint16_t slotHash(int i) { return EEPROM.read(i * SZ) | (EEPROM.read(i * SZ + 1) << 8); }
bool Preferences::begin(const char *name, bool ro, const char *) { strncpy(_ns, name ? name : "", sizeof _ns - 1); _ns[sizeof _ns - 1] = 0; _open = true; _ro = ro; return true; }
int Preferences::find(const char *key) { if (!_open) return -1; uint16_t h = hash(key); for (int i = 0; i < SLOTS; i++) if (slotHash(i) == h) return i; return -1; }
bool Preferences::clear() { if (!_open || _ro) return false; for (int i = 0; i < SLOTS; i++) { /* no se guarda el espacio de nombres: se borra todo */ EEPROM.update(i * SZ, 0xFF); EEPROM.update(i * SZ + 1, 0xFF); } return true; }
bool Preferences::remove(const char *key) { int i = find(key); if (i < 0 || _ro) return false; EEPROM.update(i * SZ, 0xFF); EEPROM.update(i * SZ + 1, 0xFF); return true; }
size_t Preferences::freeEntries() { size_t n = 0; for (int i = 0; i < SLOTS; i++) if (slotHash(i) == 0xFFFF) n++; return n; }
PreferenceType Preferences::getType(const char *key) { return find(key) >= 0 ? PT_BLOB : PT_INVALID; }
size_t Preferences::putBytes(const char *key, const void *value, size_t len) {
  if (!_open || _ro || len > (size_t)DATA) return 0;
  int i = find(key); if (i < 0) for (int j = 0; j < SLOTS; j++) if (slotHash(j) == 0xFFFF) { i = j; break; }
  if (i < 0) return 0;
  uint16_t h = hash(key); EEPROM.update(i * SZ, h & 255); EEPROM.update(i * SZ + 1, h >> 8); EEPROM.update(i * SZ + 2, len);
  for (size_t k = 0; k < len; k++) EEPROM.update(i * SZ + 3 + k, ((const uint8_t *)value)[k]);
  return len;
}
bool Preferences::get(const char *key, void *v, size_t n) { int i = find(key); if (i < 0) return false; size_t len = EEPROM.read(i * SZ + 2); if (len > n) len = n; for (size_t k = 0; k < len; k++) ((uint8_t *)v)[k] = EEPROM.read(i * SZ + 3 + k); return true; }
size_t Preferences::getBytesLength(const char *key) { int i = find(key); return i < 0 ? 0 : EEPROM.read(i * SZ + 2); }
size_t Preferences::getBytes(const char *key, void *buf, size_t max) { size_t l = getBytesLength(key); if (!l) return 0; if (l > max) l = max; get(key, buf, l); return l; }
size_t Preferences::getString(const char *key, char *buf, size_t max) { if (!max) return 0; size_t l = getBytes(key, buf, max - 1); buf[l] = 0; return l; }
String Preferences::getString(const char *key, const String &d) { char b[DATA + 1]; if (find(key) < 0) return d; getString(key, b, sizeof b); return String(b); }
