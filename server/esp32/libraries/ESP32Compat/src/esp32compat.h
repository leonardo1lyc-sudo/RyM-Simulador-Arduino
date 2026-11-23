// Se incluye antes de cada archivo C++ cuando la placa es un ESP32 (modo compatible).
// Añade las funciones del núcleo de Arduino-ESP32 que no existen en el núcleo AVR.
#pragma once
#ifdef __cplusplus
#include <Arduino.h>

#define IRAM_ATTR
#define ARDUINO_ISR_ATTR
#define DRAM_ATTR
#define RTC_DATA_ATTR
#define RTC_NOINIT_ATTR
#define WORD_ALIGNED_ATTR
typedef int esp_err_t;
extern const void *esp32_ram_buf; // búfer en RAM que send_P debe leer como RAM (cuadro de la cámara)
#define ESP_OK 0
#define ESP_FAIL -1

/* ---------- ADC (12 bits, 0 a 3,3 V) ---------- */
typedef enum { ADC_0db, ADC_2_5db, ADC_6db, ADC_11db } adc_attenuation_t;
#define ADC_ATTENDB_MAX ADC_11db
void analogReadResolution(uint8_t bits);
void analogSetWidth(uint8_t bits);
void analogSetAttenuation(adc_attenuation_t a);
void analogSetPinAttenuation(uint8_t pin, adc_attenuation_t a);
void analogSetClockDiv(uint8_t);
int esp32_analogRead(uint8_t pin);
uint32_t analogReadMilliVolts(uint8_t pin);
#define analogRead(p) esp32_analogRead(p)

/* ---------- PWM: analogWrite y LEDC (APIs 2.x y 3.x) ---------- */
void analogWriteResolution(uint8_t bits);
void analogWriteFrequency(uint32_t freq);
void esp32_analogWrite(uint8_t pin, int value);
#define analogWrite(p, v) esp32_analogWrite(p, v)
uint32_t ledcSetup(uint8_t channel, uint32_t freq, uint8_t resolution);
void ledcAttachPin(uint8_t pin, uint8_t channel);
void ledcDetachPin(uint8_t pin);
bool ledcAttach(uint8_t pin, uint32_t freq, uint8_t resolution);
bool ledcAttachChannel(uint8_t pin, uint32_t freq, uint8_t resolution, uint8_t channel);
bool ledcDetach(uint8_t pin);
bool ledcWrite(uint8_t pinOrChannel, uint32_t duty);
uint32_t ledcRead(uint8_t pinOrChannel);
uint32_t ledcWriteTone(uint8_t pinOrChannel, uint32_t freq);
uint32_t ledcReadFreq(uint8_t pinOrChannel);
bool ledcChangeFrequency(uint8_t pin, uint32_t freq, uint8_t resolution);
void dacWrite(uint8_t pin, uint8_t value);
void dacDisable(uint8_t pin);

/* ---------- táctil, sensor Hall y temperatura interna ---------- */
uint16_t touchRead(uint8_t pin);
void touchAttachInterrupt(uint8_t pin, void (*cb)(void), uint16_t threshold);
int hallRead();
float temperatureRead();

/* ---------- interrupciones en cualquier GPIO ---------- */
void esp32_attachInterrupt(uint8_t pin, void (*isr)(void), int mode);
void esp32_attachInterruptArg(uint8_t pin, void (*isr)(void *), void *arg, int mode);
void esp32_detachInterrupt(uint8_t pin);
#undef digitalPinToInterrupt
#define digitalPinToInterrupt(p) (p)
#define attachInterrupt(p, f, m) esp32_attachInterrupt(p, f, m)
#define attachInterruptArg(p, f, a, m) esp32_attachInterruptArg(p, f, a, m)
#define detachInterrupt(p) esp32_detachInterrupt(p)
#define ONHIGH 4
#define ONLOW 5

/* ---------- ESP, tiempo, azar y sueño ---------- */
class EspClass {
public:
  void restart();
  uint32_t getFreeHeap();
  uint32_t getHeapSize() { return 8192; }
  uint32_t getMinFreeHeap() { return getFreeHeap(); }
  uint32_t getMaxAllocHeap() { return getFreeHeap(); }
  uint32_t getFreePsram() { return 0; }
  uint32_t getPsramSize() { return 0; }
  const char *getChipModel() { return "ESP32-D0WD-V3"; }
  uint8_t getChipRevision() { return 3; }
  uint8_t getChipCores() { return 2; }
  uint32_t getCpuFreqMHz() { return 240; }
  uint32_t getFlashChipSize() { return 4194304; }
  uint32_t getFlashChipSpeed() { return 40000000; }
  uint32_t getSketchSize() { return 0; }
  uint32_t getFreeSketchSpace() { return 1310720; }
  const char *getSdkVersion() { return "v4.4 (simulado)"; }
  uint64_t getEfuseMac() { return 0x5C10AA286F24ULL; }
  uint32_t getCycleCount() { return micros() * 240UL; }
  void deepSleep(uint64_t us);
};
extern EspClass ESP;
void esp_restart();
uint32_t esp_random();
void esp_fill_random(void *buf, size_t len);
int64_t esp_timer_get_time();
esp_err_t esp_sleep_enable_timer_wakeup(uint64_t us);
esp_err_t esp_sleep_enable_ext0_wakeup(int gpio, int level);
void esp_deep_sleep_start();
void esp_light_sleep_start();
void esp_deep_sleep(uint64_t us);
int esp_sleep_get_wakeup_cause();
#define ESP_SLEEP_WAKEUP_UNDEFINED 0
#define ESP_SLEEP_WAKEUP_EXT0 2
#define ESP_SLEEP_WAKEUP_TIMER 4
#define GPIO_NUM_0 0
#define GPIO_NUM_2 2
#define GPIO_NUM_4 4
#define GPIO_NUM_12 12
#define GPIO_NUM_13 13
#define GPIO_NUM_14 14
#define GPIO_NUM_15 15
#define GPIO_NUM_25 25
#define GPIO_NUM_26 26
#define GPIO_NUM_27 27
#define GPIO_NUM_32 32
#define GPIO_NUM_33 33
#define GPIO_NUM_1 1
#define GPIO_NUM_3 3
#define GPIO_NUM_5 5
#define GPIO_NUM_16 16
#define GPIO_NUM_17 17
#define GPIO_NUM_18 18
#define GPIO_NUM_19 19
#define GPIO_NUM_21 21
#define GPIO_NUM_22 22
#define GPIO_NUM_23 23
#define GPIO_NUM_34 34
#define GPIO_NUM_35 35
#define GPIO_NUM_36 36
#define GPIO_NUM_39 39
#define GPIO_NUM_NC -1
// PSRAM: la ESP32-CAM la trae, la simulación no (los buffers van a la RAM interna)
static inline bool psramFound(void) { return false; }
#define ps_malloc(n) malloc(n)
#define ps_calloc(n, s) calloc(n, s)
typedef int gpio_num_t;
uint32_t getCpuFrequencyMhz();
bool setCpuFrequencyMhz(uint32_t mhz);
uint32_t getXtalFrequencyMhz();
uint32_t getApbFrequency();

/* ---------- FreeRTOS: solo lo básico (un único hilo) ---------- */
typedef uint32_t TickType_t;
typedef void *TaskHandle_t;
typedef int BaseType_t;
typedef unsigned int UBaseType_t;
#define portTICK_PERIOD_MS 1
#define portTICK_RATE_MS 1
#define portMAX_DELAY 0xFFFFFFFFUL
#define pdMS_TO_TICKS(ms) ((TickType_t)(ms))
#define pdTRUE 1
#define pdFALSE 0
#define pdPASS 1
#define pdFAIL 0
#define configTICK_RATE_HZ 1000
inline void vTaskDelay(TickType_t t) { delay(t); }
inline TickType_t xTaskGetTickCount() { return millis(); }
inline UBaseType_t uxTaskGetStackHighWaterMark(TaskHandle_t) { return 1024; }
inline BaseType_t xPortGetCoreID() { return 1; }
inline void taskYIELD() { yield(); }
// xTaskCreate: el modo compatible tiene un solo núcleo y no hay tareas en paralelo
BaseType_t xTaskCreate(void (*fn)(void *), const char *name, uint32_t stack, void *param, UBaseType_t prio, TaskHandle_t *h);
BaseType_t xTaskCreatePinnedToCore(void (*fn)(void *), const char *name, uint32_t stack, void *param, UBaseType_t prio, TaskHandle_t *h, BaseType_t core);
inline void vTaskDelete(TaskHandle_t) {}

/* ---------- red simulada (canal interno con el simulador) ---------- */
void esp32_net_begin();
void esp32_net_event(const char *type, const char *data);
#endif
