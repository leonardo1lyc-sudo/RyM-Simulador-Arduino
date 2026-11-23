// Implementación del núcleo ESP32 del modo compatible (ver esp32compat.h).
#include "esp32compat.h"
#undef analogRead
#undef analogWrite
#undef attachInterrupt
#undef detachInterrupt
#include <avr/interrupt.h>

EspClass ESP;

/* ---------- ADC ---------- */
static uint8_t adcBits = 12;
void analogReadResolution(uint8_t bits) { adcBits = bits < 1 ? 1 : bits > 16 ? 16 : bits; }
void analogSetWidth(uint8_t bits) { analogReadResolution(bits); }
void analogSetAttenuation(adc_attenuation_t) {}
void analogSetPinAttenuation(uint8_t, adc_attenuation_t) {}
void analogSetClockDiv(uint8_t) {}
// el ADC del AVR mide 0-5 V en 10 bits; el del ESP32 da 0-4095 para 0-3,3 V
int esp32_analogRead(uint8_t pin) {
  long mv = (long)analogRead(pin) * 5000L / 1023L;
  long full = (1L << adcBits) - 1;
  long v = mv * full / 3300L;
  return v > full ? full : v;
}
uint32_t analogReadMilliVolts(uint8_t pin) { long mv = (long)analogRead(pin) * 5000L / 1023L; return mv > 3300 ? 3300 : mv; }

/* ---------- PWM ---------- */
static uint8_t pwmBits = 8;
void analogWriteResolution(uint8_t bits) { pwmBits = bits < 1 ? 1 : bits > 16 ? 16 : bits; }
void analogWriteFrequency(uint32_t) {}
static void writeDuty(uint8_t pin, uint32_t duty, uint8_t bits) {
  uint32_t full = (1UL << bits) - 1;
  if (duty > full) duty = full;
  uint32_t v8 = bits >= 8 ? duty >> (bits - 8) : duty << (8 - bits);
  if (bits < 8 && duty == full) v8 = 255;
  pinMode(pin, OUTPUT);
  analogWrite(pin, (int)v8);
}
void esp32_analogWrite(uint8_t pin, int value) { writeDuty(pin, value < 0 ? 0 : value, pwmBits); }
struct LedcCh { int8_t pin; uint8_t bits; uint32_t freq, duty; };
static LedcCh ch[16];
static int8_t pinCh[NUM_DIGITAL_PINS];
static bool ledcInit = false;
static void ledcBoot() { if (ledcInit) return; ledcInit = true; for (int i = 0; i < 16; i++) { ch[i].pin = -1; ch[i].bits = 8; ch[i].freq = 5000; ch[i].duty = 0; } for (int i = 0; i < NUM_DIGITAL_PINS; i++) pinCh[i] = -1; }
uint32_t ledcSetup(uint8_t c, uint32_t freq, uint8_t res) { ledcBoot(); if (c >= 16) return 0; ch[c].freq = freq; ch[c].bits = res ? res : 8; return freq; }
void ledcAttachPin(uint8_t pin, uint8_t c) { ledcBoot(); if (c >= 16 || pin >= NUM_DIGITAL_PINS) return; ch[c].pin = pin; pinCh[pin] = c; writeDuty(pin, ch[c].duty, ch[c].bits); }
void ledcDetachPin(uint8_t pin) { ledcBoot(); if (pin < NUM_DIGITAL_PINS && pinCh[pin] >= 0) { ch[pinCh[pin]].pin = -1; pinCh[pin] = -1; } digitalWrite(pin, LOW); }
bool ledcAttachChannel(uint8_t pin, uint32_t freq, uint8_t res, uint8_t c) { ledcSetup(c, freq, res); ledcAttachPin(pin, c); return true; }
bool ledcAttach(uint8_t pin, uint32_t freq, uint8_t res) {
  ledcBoot(); if (pin >= NUM_DIGITAL_PINS) return false;
  if (pinCh[pin] >= 0) return ledcAttachChannel(pin, freq, res, pinCh[pin]);
  for (uint8_t c = 0; c < 16; c++) if (ch[c].pin < 0) return ledcAttachChannel(pin, freq, res, c);
  return false;
}
bool ledcDetach(uint8_t pin) { ledcDetachPin(pin); return true; }
// API 2.x: ledcWrite(canal, ciclo). API 3.x: ledcWrite(pin, ciclo). Se distingue por lo que se haya asociado.
static int8_t resolve(uint8_t x) { ledcBoot(); if (x < NUM_DIGITAL_PINS && pinCh[x] >= 0) return pinCh[x]; if (x < 16 && ch[x].pin >= 0) return x; return -1; }
bool ledcWrite(uint8_t x, uint32_t duty) {
  int8_t c = resolve(x);
  if (c < 0) { if (x < 16) { ch[x].duty = duty; return true; } return false; }
  ch[c].duty = duty; if (ch[c].pin >= 0) writeDuty(ch[c].pin, duty, ch[c].bits); return true;
}
uint32_t ledcRead(uint8_t x) { int8_t c = resolve(x); return c < 0 ? 0 : ch[c].duty; }
uint32_t ledcWriteTone(uint8_t x, uint32_t freq) { int8_t c = resolve(x); if (c < 0 || ch[c].pin < 0) return 0; if (freq) tone(ch[c].pin, freq); else noTone(ch[c].pin); ch[c].freq = freq; return freq; }
uint32_t ledcReadFreq(uint8_t x) { int8_t c = resolve(x); return c < 0 ? 0 : ch[c].freq; }
bool ledcChangeFrequency(uint8_t pin, uint32_t freq, uint8_t res) { int8_t c = resolve(pin); if (c < 0) return false; ch[c].freq = freq; ch[c].bits = res; return true; }
void dacWrite(uint8_t pin, uint8_t value) { writeDuty(pin, value, 8); }
void dacDisable(uint8_t pin) { digitalWrite(pin, LOW); }

/* ---------- táctil (un pin unido a 3,3 V cuenta como «tocado»), Hall y temperatura ---------- */
uint16_t touchRead(uint8_t pin) { pinMode(pin, INPUT); return digitalRead(pin) ? 12 : 72; }
void touchAttachInterrupt(uint8_t pin, void (*cb)(void), uint16_t) { esp32_attachInterrupt(pin, cb, RISING); }
int hallRead() { return 0; }
float temperatureRead() { return 46.5; }

const void *esp32_ram_buf = 0;

/* ---------- interrupciones: INT0/1/4/5 por hardware y cambio de pin (PCINT) en el resto ---------- */
struct Isr { void (*f)(void); void (*fa)(void *); void *arg; uint8_t mode; };
static Isr isr[NUM_DIGITAL_PINS];
static uint8_t lastB, lastK;
static void callIsr(uint8_t g, bool level) {
  Isr &i = isr[g]; if (!i.f && !i.fa) return;
  bool fire = i.mode == CHANGE || (i.mode == RISING && level) || (i.mode == FALLING && !level) || (i.mode == ONHIGH && level) || (i.mode == ONLOW && !level);
  if (!fire) return; if (i.fa) i.fa(i.arg); else i.f();
}
static void scanPort(volatile uint8_t &pinReg, uint8_t &last, uint8_t mask, char port) {
  uint8_t now = pinReg, diff = (now ^ last) & mask; last = now;
  if (!diff) return;
  for (uint8_t g = 0; g < NUM_DIGITAL_PINS; g++) {
    if (digitalPinToPCMSK(g) == 0) continue;
    if ((digitalPinToPCICRbit(g) == 0) != (port == 'B')) continue;
    uint8_t bit = 1 << digitalPinToPCMSKbit(g);
    if (diff & bit) callIsr(g, now & bit);
  }
}
ISR(PCINT0_vect) { scanPort(PINB, lastB, PCMSK0, 'B'); }
ISR(PCINT2_vect) { scanPort(PINK, lastK, PCMSK2, 'K'); }
static void trampoline(uint8_t g) { Isr &i = isr[g]; if (i.fa) i.fa(i.arg); else if (i.f) i.f(); }
static const uint8_t EXT[4] = BANCO_EXT_PINS; // GPIO con interrupción externa (attachInterrupt 0..3 del núcleo AVR)
static void ext0() { trampoline(EXT[0]); }
static void ext1() { trampoline(EXT[1]); }
static void ext2() { trampoline(EXT[2]); }
static void ext3() { trampoline(EXT[3]); }
static void attachAny(uint8_t pin, int mode) {
  if (pin >= NUM_DIGITAL_PINS) return;
  isr[pin].mode = mode;
  int n = -1; for (int i = 0; i < 4; i++) if (EXT[i] == pin) n = i;
  int m = mode == ONLOW ? LOW : mode == ONHIGH ? CHANGE : mode;
  static void (*const tr[4])() = { ext0, ext1, ext2, ext3 };
  if (n >= 0) { attachInterrupt(n, tr[n], m); return; }
  volatile uint8_t *msk = digitalPinToPCMSK(pin);
  if (!msk) { esp32_net_event("I", String(pin).c_str()); return; } // pin sin interrupción en la simulación
  uint8_t oldSreg = SREG; cli();
  if (digitalPinToPCICRbit(pin) == 0) lastB = PINB; else lastK = PINK;
  *msk |= 1 << digitalPinToPCMSKbit(pin);
  PCICR |= 1 << digitalPinToPCICRbit(pin);
  SREG = oldSreg;
}
void esp32_attachInterrupt(uint8_t pin, void (*f)(void), int mode) { if (pin >= NUM_DIGITAL_PINS) return; isr[pin].f = f; isr[pin].fa = 0; attachAny(pin, mode); }
void esp32_attachInterruptArg(uint8_t pin, void (*f)(void *), void *arg, int mode) { if (pin >= NUM_DIGITAL_PINS) return; isr[pin].fa = f; isr[pin].arg = arg; isr[pin].f = 0; attachAny(pin, mode); }
void esp32_detachInterrupt(uint8_t pin) {
  if (pin >= NUM_DIGITAL_PINS) return;
  int n = -1; for (int i = 0; i < 4; i++) if (EXT[i] == pin) n = i;
  if (n >= 0) detachInterrupt(n);
  else { volatile uint8_t *msk = digitalPinToPCMSK(pin); if (msk) *msk &= ~(1 << digitalPinToPCMSKbit(pin)); }
  isr[pin].f = 0; isr[pin].fa = 0;
}

/* ---------- ESP ---------- */
extern int __heap_start, *__brkval;
uint32_t EspClass::getFreeHeap() { int v; return (uint32_t)((int)&v - (__brkval == 0 ? (int)&__heap_start : (int)__brkval)); }
void EspClass::restart() { esp32_net_event("R", ""); delay(20); cli(); asm volatile("jmp 0"); }
void EspClass::deepSleep(uint64_t us) { esp_deep_sleep(us); }
void esp_restart() { ESP.restart(); }
uint32_t esp_random() { static bool seeded = false; if (!seeded) { randomSeed(micros() ^ analogRead(36)); seeded = true; } return ((uint32_t)random(0x10000) << 16) | (uint32_t)random(0x10000); }
void esp_fill_random(void *buf, size_t len) { uint8_t *b = (uint8_t *)buf; for (size_t i = 0; i < len; i++) b[i] = esp_random(); }
int64_t esp_timer_get_time() { return (int64_t)micros(); }
static uint64_t wakeUs = 0; static int wakeCause = ESP_SLEEP_WAKEUP_UNDEFINED;
static uint8_t sleepFlag __attribute__((section(".noinit")));
esp_err_t esp_sleep_enable_timer_wakeup(uint64_t us) { wakeUs = us; return ESP_OK; }
esp_err_t esp_sleep_enable_ext0_wakeup(int, int) { return ESP_OK; }
// sueño profundo: se espera el tiempo pedido y se reinicia (como el ESP32 real)
void esp_deep_sleep_start() { esp32_net_event("Z", String((unsigned long)(wakeUs / 1000)).c_str()); unsigned long ms = wakeUs / 1000; if (!ms) { for (;;) delay(1000); } delay(ms); sleepFlag = 0xA5; cli(); asm volatile("jmp 0"); }
void esp_deep_sleep(uint64_t us) { wakeUs = us; esp_deep_sleep_start(); }
void esp_light_sleep_start() { delay(wakeUs / 1000); }
int esp_sleep_get_wakeup_cause() { if (sleepFlag == 0xA5) { sleepFlag = 0; wakeCause = ESP_SLEEP_WAKEUP_TIMER; } return wakeCause; }
uint32_t getCpuFrequencyMhz() { return 240; }
bool setCpuFrequencyMhz(uint32_t) { return true; }
uint32_t getXtalFrequencyMhz() { return 40; }
uint32_t getApbFrequency() { return 80000000; }
BaseType_t xTaskCreate(void (*)(void *), const char *name, uint32_t, void *, UBaseType_t, TaskHandle_t *h) { if (h) *h = 0; esp32_net_event("T", name ? name : ""); return pdFAIL; }
BaseType_t xTaskCreatePinnedToCore(void (*f)(void *), const char *name, uint32_t s, void *p, UBaseType_t pr, TaskHandle_t *h, BaseType_t) { return xTaskCreate(f, name, s, p, pr, h); }

/* ---------- canal de red simulada: Serial3 (sin pines en la placa) ---------- */
static bool netOn = false;
void esp32_net_begin() { if (!netOn) { Serial3.begin(500000); netOn = true; } }
void esp32_net_event(const char *type, const char *data) { esp32_net_begin(); Serial3.write(0x05); Serial3.print(type); Serial3.print(':'); Serial3.print(data); Serial3.write('\n'); Serial3.flush(); }

/* ---------- LED RGB de la placa (WS2812 en S3 y C3) ---------- */
// La simulación no decodifica el protocolo WS2812: el color se informa al panel por el canal interno.
void neopixelWrite(uint8_t pin, uint8_t r, uint8_t g, uint8_t b) {
#ifdef PIN_RGB_LED
  if (pin == PIN_RGB_LED || pin == RGB_BUILTIN) {
    char d[16]; snprintf(d, sizeof d, "%u,%u,%u", r, g, b); esp32_net_event("L", d); return;
  }
#endif
  (void)r; (void)g; (void)b; esp32_net_event("N", String(pin).c_str());
}
void rgbLedWrite(uint8_t pin, uint8_t r, uint8_t g, uint8_t b) { neopixelWrite(pin, r, g, b); }
extern "C" void esp32_rgb_builtin(uint8_t on) {
#ifdef RGB_BRIGHTNESS
  uint8_t v = on ? RGB_BRIGHTNESS : 0; neopixelWrite(RGB_BUILTIN, v, v, v);
#else
  (void)on;
#endif
}
