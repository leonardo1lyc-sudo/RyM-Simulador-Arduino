// Modo compatible de ESP32: cada GPIO del ESP32 se asigna a un pin del ATmega2560 emulado.
// [puerto, bit, timer PWM o null]. El canal ADC es independiente del pin físico.
// Lo usan el dibujo de la placa (boards.js) y el generador de la variante del núcleo (scripts/gen-esp32-variant.mjs).
export const ESP32_GPIO = {
  0: ['K', 4, null], 1: ['E', 1, null], 2: ['H', 3, 'TIMER4A'], 3: ['E', 0, null], 4: ['E', 4, 'TIMER3B'], 5: ['B', 0, null],
  12: ['B', 5, 'TIMER1A'], 13: ['B', 4, 'TIMER2A'], 14: ['B', 6, 'TIMER1B'], 15: ['E', 5, 'TIMER3C'], 16: ['H', 0, null], 17: ['H', 1, null],
  18: ['B', 1, null], 19: ['B', 3, null], 21: ['D', 1, null], 22: ['D', 0, null], 23: ['B', 2, null],
  25: ['H', 4, 'TIMER4B'], 26: ['H', 5, 'TIMER4C'], 27: ['B', 7, 'TIMER0A'], 32: ['L', 3, 'TIMER5A'], 33: ['L', 4, 'TIMER5B'],
  34: ['K', 0, null], 35: ['K', 1, null], 36: ['K', 2, null], 39: ['K', 3, null],
};
// GPIO -> canal del ADC (los 16 canales del 2560): ADC1 (32-39) y ADC2 (0, 2, 4, 12-15, 25-27)
export const ESP32_ADC = { 36: 0, 39: 1, 32: 2, 33: 3, 34: 4, 35: 5, 25: 6, 26: 7, 27: 8, 14: 9, 12: 10, 13: 11, 4: 12, 2: 13, 15: 14, 0: 15 };
export const ESP32_INPUT_ONLY = new Set([34, 35, 36, 39]);
// interrupciones externas del 2560 (número de attachInterrupt del núcleo AVR)
export const ESP32_EXTINT = { 4: 0, 15: 1, 22: 2, 21: 3 };
