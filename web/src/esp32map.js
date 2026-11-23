// Modo compatible de ESP32: cada GPIO del chip se asigna a un pin del ATmega2560 emulado.
// gpio: [puerto, bit, timer PWM o null]. El canal ADC es independiente del pin físico.
// Pines fijos del 2560 que conviene respetar: USART0 E0/E1 (Serial), USART1 D2/D3 (Bluetooth en el ESP32,
// Serial1 en S3/C3), USART3 J0/J1 (red simulada, nunca un GPIO), TWI D1/D0 (SDA/SCL), SPI B0-B3 (SS, SCK, MOSI, MISO),
// INT4/INT5 en E4/E5 e INT0/INT1 en D0/D1; cambio de pin (PCINT) en el puerto B y el K.
// Lo usan las placas (boards.js) y el generador de las variantes del núcleo (scripts/gen-esp32-variant.mjs).
export const VARIANTS = {
  esp32: {
    dir: 'variant', name: 'ESP32 DevKit', chip: 'ESP32-D0WD-V3', n: 40,
    gpio: {
      0: ['K', 4, null], 1: ['E', 1, null], 2: ['H', 3, 'TIMER4A'], 3: ['E', 0, null], 4: ['E', 4, 'TIMER3B'], 5: ['B', 0, null],
      12: ['B', 5, 'TIMER1A'], 13: ['B', 4, 'TIMER2A'], 14: ['B', 6, 'TIMER1B'], 15: ['E', 5, 'TIMER3C'], 16: ['H', 0, null], 17: ['H', 1, null],
      18: ['B', 1, null], 19: ['B', 3, null], 21: ['D', 1, null], 22: ['D', 0, null], 23: ['B', 2, null],
      25: ['H', 4, 'TIMER4B'], 26: ['H', 5, 'TIMER4C'], 27: ['B', 7, 'TIMER0A'], 32: ['L', 3, 'TIMER5A'], 33: ['L', 4, 'TIMER5B'],
      34: ['K', 0, null], 35: ['K', 1, null], 36: ['K', 2, null], 39: ['K', 3, null],
    },
    // GPIO -> canal del ADC (los 16 canales del 2560): ADC1 (32-39) y ADC2 (0, 2, 4, 12-15, 25-27)
    adc: { 36: 0, 39: 1, 32: 2, 33: 3, 34: 4, 35: 5, 25: 6, 26: 7, 27: 8, 14: 9, 12: 10, 13: 11, 4: 12, 2: 13, 15: 14, 0: 15 },
    ext: [4, 15, 22, 21], // GPIO de attachInterrupt 0..3 del núcleo AVR (INT4, INT5, INT0, INT1)
    spi: { ss: 5, mosi: 23, miso: 19, sck: 18 }, sda: 21, scl: 22, tx: 1, rx: 3, led: 2,
    A: { A0: 36, A3: 39, A4: 32, A5: 33, A6: 34, A7: 35, A10: 4, A11: 0, A12: 2, A13: 15, A14: 13, A15: 12, A16: 14, A17: 27, A18: 25, A19: 26 },
    T: { T0: 4, T1: 0, T2: 2, T3: 15, T4: 13, T5: 12, T6: 14, T7: 27, T8: 33, T9: 32 }, dac: [25, 26],
  },
  esp32s3: {
    dir: 'variant-s3', name: 'ESP32-S3 DevKitC-1', chip: 'ESP32-S3', n: 49, target: 'ESP32S3', rgb: 48,
    gpio: {
      0: ['K', 0, null], 1: ['H', 3, 'TIMER4A'], 2: ['H', 4, 'TIMER4B'], 3: ['K', 2, null], 4: ['E', 4, 'TIMER3B'], 5: ['E', 5, 'TIMER3C'],
      6: ['E', 3, 'TIMER3A'], 7: ['H', 5, 'TIMER4C'], 8: ['D', 1, null], 9: ['D', 0, null], 10: ['B', 0, null], 11: ['B', 2, null],
      12: ['B', 1, null], 13: ['B', 3, null], 14: ['K', 1, null], 15: ['B', 4, 'TIMER2A'], 16: ['B', 5, 'TIMER1A'], 17: ['D', 3, null],
      18: ['D', 2, null], 19: ['H', 0, null], 20: ['H', 1, null], 21: ['B', 6, 'TIMER1B'],
      35: ['K', 3, null], 36: ['K', 4, null], 37: ['K', 5, null], 38: ['L', 3, 'TIMER5A'], 39: ['L', 4, 'TIMER5B'], 40: ['L', 5, 'TIMER5C'],
      41: ['H', 6, 'TIMER2B'], 42: ['G', 5, 'TIMER0B'], 43: ['E', 1, null], 44: ['E', 0, null], 45: ['K', 6, null], 46: ['K', 7, null],
      47: ['B', 7, 'TIMER0A'], 48: ['E', 6, null],
    },
    // ADC1 en GPIO1-10 y ADC2 en GPIO11-20 (el 2560 tiene 16 canales: hasta GPIO16)
    adc: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9, 11: 10, 12: 11, 13: 12, 14: 13, 15: 14, 16: 15 },
    ext: [4, 5, 9, 8],
    spi: { ss: 10, mosi: 11, miso: 13, sck: 12 }, sda: 8, scl: 9, tx: 43, rx: 44, tx1: 17, rx1: 18,
    A: { A0: 1, A1: 2, A2: 3, A3: 4, A4: 5, A5: 6, A6: 7, A7: 8, A8: 9, A9: 10, A10: 11, A11: 12, A12: 13, A13: 14, A14: 15, A15: 16, A16: 17, A17: 18, A18: 19, A19: 20 },
    T: { T1: 1, T2: 2, T3: 3, T4: 4, T5: 5, T6: 6, T7: 7, T8: 8, T9: 9, T10: 10, T11: 11, T12: 12, T13: 13, T14: 14 }, dac: [],
  },
  esp32c3: {
    dir: 'variant-c3', name: 'ESP32-C3 DevKitM-1', chip: 'ESP32-C3', n: 22, target: 'ESP32C3', rgb: 8,
    gpio: {
      0: ['K', 0, null], 1: ['H', 3, 'TIMER4A'], 2: ['E', 5, 'TIMER3C'], 3: ['H', 4, 'TIMER4B'], 4: ['B', 1, null], 5: ['B', 3, null],
      6: ['B', 2, null], 7: ['B', 0, null], 8: ['D', 1, null], 9: ['D', 0, null], 10: ['E', 4, 'TIMER3B'],
      18: ['D', 2, null], 19: ['D', 3, null], 20: ['E', 0, null], 21: ['E', 1, null],
    },
    adc: { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 }, // ADC1 en GPIO0-4, ADC2 en GPIO5
    ext: [10, 2, 9, 8],
    spi: { ss: 7, mosi: 6, miso: 5, sck: 4 }, sda: 8, scl: 9, tx: 21, rx: 20, tx1: 19, rx1: 18,
    A: { A0: 0, A1: 1, A2: 2, A3: 3, A4: 4, A5: 5 }, T: {}, dac: [],
  },
};
// compatibilidad con el código del ESP32 original
export const ESP32_GPIO = VARIANTS.esp32.gpio;
export const ESP32_ADC = VARIANTS.esp32.adc;
export const ESP32_INPUT_ONLY = new Set([34, 35, 36, 39]);
