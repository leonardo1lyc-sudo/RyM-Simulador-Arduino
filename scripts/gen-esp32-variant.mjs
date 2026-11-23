// Genera server/esp32/variant/pins_arduino.h a partir de web/src/esp32map.js
import fs from 'node:fs';
import { ESP32_GPIO, ESP32_ADC } from '../web/src/esp32map.js';
const N = 40, rows = [];
for (let g = 0; g < N; g++) rows.push(ESP32_GPIO[g] || null);
const port = rows.map((r, g) => `\t${r ? 'P' + r[0] : 'NOT_A_PIN'}\t, // GPIO ${g}`).join('\n');
const mask = rows.map((r, g) => `\t${r ? `_BV( ${r[1]} )` : '0'}\t, // GPIO ${g}`).join('\n');
const timer = rows.map((r, g) => `\t${r && r[2] ? r[2] : 'NOT_ON_TIMER'}\t, // GPIO ${g}`).join('\n');
const adc = Array.from({ length: N }, (_, g) => ESP32_ADC[g] ?? 0).join(', ');
const pcB = rows.map((r, g) => r && r[0] === 'B' ? g : -1).filter(g => g >= 0), pcK = rows.map((r, g) => r && r[0] === 'K' ? g : -1).filter(g => g >= 0);
const isIn = list => list.map(g => `(p) == ${g}`).join(' || ');
const bitOf = list => list.reduceRight((acc, g) => `((p) == ${g} ? ${rows[g][1]} : ${acc})`, '0');
const pwm = rows.map((r, g) => r && r[2] ? g : -1).filter(g => g >= 0);
const A = { A0: 36, A3: 39, A4: 32, A5: 33, A6: 34, A7: 35, A10: 4, A11: 0, A12: 2, A13: 15, A14: 13, A15: 12, A16: 14, A17: 27, A18: 25, A19: 26 };
const T = { T0: 4, T1: 0, T2: 2, T3: 15, T4: 13, T5: 12, T6: 14, T7: 27, T8: 33, T9: 32 };
const out = `// GENERADO por scripts/gen-esp32-variant.mjs: no editar a mano.
// Variante «ESP32 DevKit (modo compatible)»: los números de pin son los GPIO del ESP32 y cada uno
// corresponde a un pin del ATmega2560 emulado (ver web/src/esp32map.js).
#ifndef Pins_Arduino_h
#define Pins_Arduino_h
#include <avr/pgmspace.h>

#define NUM_DIGITAL_PINS            ${N}
#define NUM_ANALOG_INPUTS           16
#define analogInputToDigitalPin(p)  (-1)
#define digitalPinHasPWM(p)         (${isIn(pwm)})
extern const uint8_t PROGMEM analog_pin_to_channel_PGM[];
#define analogPinToChannel(P)       ( (P) < ${N} ? pgm_read_byte( analog_pin_to_channel_PGM + (P) ) : 0 )

#define PIN_SPI_SS    (5)
#define PIN_SPI_MOSI  (23)
#define PIN_SPI_MISO  (19)
#define PIN_SPI_SCK   (18)
static const uint8_t SS   = PIN_SPI_SS;
static const uint8_t MOSI = PIN_SPI_MOSI;
static const uint8_t MISO = PIN_SPI_MISO;
static const uint8_t SCK  = PIN_SPI_SCK;
#define PIN_WIRE_SDA        (21)
#define PIN_WIRE_SCL        (22)
static const uint8_t SDA = PIN_WIRE_SDA;
static const uint8_t SCL = PIN_WIRE_SCL;
static const uint8_t TX = 1;
static const uint8_t RX = 3;
#define LED_BUILTIN 2
#define BUILTIN_LED 2
${Object.entries(A).map(([k, v]) => `static const uint8_t ${k} = ${v};`).join('\n')}
${Object.entries(T).map(([k, v]) => `static const uint8_t ${k} = ${v};`).join('\n')}
static const uint8_t DAC1 = 25;
static const uint8_t DAC2 = 26;

#define digitalPinToPCICR(p)    ( (${isIn(pcB)}) || (${isIn(pcK)}) ? (&PCICR) : ((uint8_t *)0) )
#define digitalPinToPCICRbit(p) ( (${isIn(pcB)}) ? 0 : 2 )
#define digitalPinToPCMSK(p)    ( (${isIn(pcB)}) ? (&PCMSK0) : ( (${isIn(pcK)}) ? (&PCMSK2) : ((uint8_t *)0) ) )
#define digitalPinToPCMSKbit(p) ${bitOf([...pcB, ...pcK])}
#define digitalPinToInterrupt(p) ((p) < 40 ? (p) : NOT_AN_INTERRUPT) // en el ESP32 el número de interrupción es el GPIO

#ifdef ARDUINO_MAIN
const uint16_t PROGMEM port_to_mode_PGM[] = {
\tNOT_A_PORT, (uint16_t) &DDRA, (uint16_t) &DDRB, (uint16_t) &DDRC, (uint16_t) &DDRD, (uint16_t) &DDRE, (uint16_t) &DDRF, (uint16_t) &DDRG,
\t(uint16_t) &DDRH, NOT_A_PORT, (uint16_t) &DDRJ, (uint16_t) &DDRK, (uint16_t) &DDRL,
};
const uint16_t PROGMEM port_to_output_PGM[] = {
\tNOT_A_PORT, (uint16_t) &PORTA, (uint16_t) &PORTB, (uint16_t) &PORTC, (uint16_t) &PORTD, (uint16_t) &PORTE, (uint16_t) &PORTF, (uint16_t) &PORTG,
\t(uint16_t) &PORTH, NOT_A_PORT, (uint16_t) &PORTJ, (uint16_t) &PORTK, (uint16_t) &PORTL,
};
const uint16_t PROGMEM port_to_input_PGM[] = {
\tNOT_A_PIN, (uint16_t) &PINA, (uint16_t) &PINB, (uint16_t) &PINC, (uint16_t) &PIND, (uint16_t) &PINE, (uint16_t) &PINF, (uint16_t) &PING,
\t(uint16_t) &PINH, NOT_A_PIN, (uint16_t) &PINJ, (uint16_t) &PINK, (uint16_t) &PINL,
};
const uint8_t PROGMEM digital_pin_to_port_PGM[] = {
${port}
};
const uint8_t PROGMEM digital_pin_to_bit_mask_PGM[] = {
${mask}
};
const uint8_t PROGMEM digital_pin_to_timer_PGM[] = {
${timer}
};
const uint8_t PROGMEM analog_pin_to_channel_PGM[] = { ${adc} };
#endif

#define SERIAL_PORT_MONITOR         Serial
#define SERIAL_PORT_HARDWARE        Serial
#define SERIAL_PORT_HARDWARE1       Serial1
#define SERIAL_PORT_HARDWARE2       Serial2
#define SERIAL_PORT_HARDWARE3       Serial3
#define SERIAL_PORT_HARDWARE_OPEN   Serial2
#endif
`;
fs.writeFileSync(new URL('../server/esp32/variant/pins_arduino.h', import.meta.url), out);
console.log('variante ESP32 generada');
