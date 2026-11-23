// GENERADO por scripts/gen-esp32-variant.mjs: no editar a mano.
// Variante «ESP32 DevKit (modo compatible)»: los números de pin son los GPIO del ESP32 y cada uno
// corresponde a un pin del ATmega2560 emulado (ver web/src/esp32map.js).
#ifndef Pins_Arduino_h
#define Pins_Arduino_h
#include <avr/pgmspace.h>

#define NUM_DIGITAL_PINS            40
#define NUM_ANALOG_INPUTS           16
#define analogInputToDigitalPin(p)  (-1)
#define digitalPinHasPWM(p)         ((p) == 2 || (p) == 4 || (p) == 12 || (p) == 13 || (p) == 14 || (p) == 15 || (p) == 25 || (p) == 26 || (p) == 27 || (p) == 32 || (p) == 33)
extern const uint8_t PROGMEM analog_pin_to_channel_PGM[];
#define analogPinToChannel(P)       ( (P) < 40 ? pgm_read_byte( analog_pin_to_channel_PGM + (P) ) : 0 )

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
static const uint8_t A0 = 36;
static const uint8_t A3 = 39;
static const uint8_t A4 = 32;
static const uint8_t A5 = 33;
static const uint8_t A6 = 34;
static const uint8_t A7 = 35;
static const uint8_t A10 = 4;
static const uint8_t A11 = 0;
static const uint8_t A12 = 2;
static const uint8_t A13 = 15;
static const uint8_t A14 = 13;
static const uint8_t A15 = 12;
static const uint8_t A16 = 14;
static const uint8_t A17 = 27;
static const uint8_t A18 = 25;
static const uint8_t A19 = 26;
static const uint8_t T0 = 4;
static const uint8_t T1 = 0;
static const uint8_t T2 = 2;
static const uint8_t T3 = 15;
static const uint8_t T4 = 13;
static const uint8_t T5 = 12;
static const uint8_t T6 = 14;
static const uint8_t T7 = 27;
static const uint8_t T8 = 33;
static const uint8_t T9 = 32;
static const uint8_t DAC1 = 25;
static const uint8_t DAC2 = 26;

#define digitalPinToPCICR(p)    ( ((p) == 5 || (p) == 12 || (p) == 13 || (p) == 14 || (p) == 18 || (p) == 19 || (p) == 23 || (p) == 27) || ((p) == 0 || (p) == 34 || (p) == 35 || (p) == 36 || (p) == 39) ? (&PCICR) : ((uint8_t *)0) )
#define digitalPinToPCICRbit(p) ( ((p) == 5 || (p) == 12 || (p) == 13 || (p) == 14 || (p) == 18 || (p) == 19 || (p) == 23 || (p) == 27) ? 0 : 2 )
#define digitalPinToPCMSK(p)    ( ((p) == 5 || (p) == 12 || (p) == 13 || (p) == 14 || (p) == 18 || (p) == 19 || (p) == 23 || (p) == 27) ? (&PCMSK0) : ( ((p) == 0 || (p) == 34 || (p) == 35 || (p) == 36 || (p) == 39) ? (&PCMSK2) : ((uint8_t *)0) ) )
#define digitalPinToPCMSKbit(p) ((p) == 5 ? 0 : ((p) == 12 ? 5 : ((p) == 13 ? 4 : ((p) == 14 ? 6 : ((p) == 18 ? 1 : ((p) == 19 ? 3 : ((p) == 23 ? 2 : ((p) == 27 ? 7 : ((p) == 0 ? 4 : ((p) == 34 ? 0 : ((p) == 35 ? 1 : ((p) == 36 ? 2 : ((p) == 39 ? 3 : 0)))))))))))))
#define digitalPinToInterrupt(p) ((p) < 40 ? (p) : NOT_AN_INTERRUPT) // en el ESP32 el número de interrupción es el GPIO

#ifdef ARDUINO_MAIN
const uint16_t PROGMEM port_to_mode_PGM[] = {
	NOT_A_PORT, (uint16_t) &DDRA, (uint16_t) &DDRB, (uint16_t) &DDRC, (uint16_t) &DDRD, (uint16_t) &DDRE, (uint16_t) &DDRF, (uint16_t) &DDRG,
	(uint16_t) &DDRH, NOT_A_PORT, (uint16_t) &DDRJ, (uint16_t) &DDRK, (uint16_t) &DDRL,
};
const uint16_t PROGMEM port_to_output_PGM[] = {
	NOT_A_PORT, (uint16_t) &PORTA, (uint16_t) &PORTB, (uint16_t) &PORTC, (uint16_t) &PORTD, (uint16_t) &PORTE, (uint16_t) &PORTF, (uint16_t) &PORTG,
	(uint16_t) &PORTH, NOT_A_PORT, (uint16_t) &PORTJ, (uint16_t) &PORTK, (uint16_t) &PORTL,
};
const uint16_t PROGMEM port_to_input_PGM[] = {
	NOT_A_PIN, (uint16_t) &PINA, (uint16_t) &PINB, (uint16_t) &PINC, (uint16_t) &PIND, (uint16_t) &PINE, (uint16_t) &PINF, (uint16_t) &PING,
	(uint16_t) &PINH, NOT_A_PIN, (uint16_t) &PINJ, (uint16_t) &PINK, (uint16_t) &PINL,
};
const uint8_t PROGMEM digital_pin_to_port_PGM[] = {
	PK	, // GPIO 0
	PE	, // GPIO 1
	PH	, // GPIO 2
	PE	, // GPIO 3
	PE	, // GPIO 4
	PB	, // GPIO 5
	NOT_A_PIN	, // GPIO 6
	NOT_A_PIN	, // GPIO 7
	NOT_A_PIN	, // GPIO 8
	NOT_A_PIN	, // GPIO 9
	NOT_A_PIN	, // GPIO 10
	NOT_A_PIN	, // GPIO 11
	PB	, // GPIO 12
	PB	, // GPIO 13
	PB	, // GPIO 14
	PE	, // GPIO 15
	PH	, // GPIO 16
	PH	, // GPIO 17
	PB	, // GPIO 18
	PB	, // GPIO 19
	NOT_A_PIN	, // GPIO 20
	PD	, // GPIO 21
	PD	, // GPIO 22
	PB	, // GPIO 23
	NOT_A_PIN	, // GPIO 24
	PH	, // GPIO 25
	PH	, // GPIO 26
	PB	, // GPIO 27
	NOT_A_PIN	, // GPIO 28
	NOT_A_PIN	, // GPIO 29
	NOT_A_PIN	, // GPIO 30
	NOT_A_PIN	, // GPIO 31
	PL	, // GPIO 32
	PL	, // GPIO 33
	PK	, // GPIO 34
	PK	, // GPIO 35
	PK	, // GPIO 36
	NOT_A_PIN	, // GPIO 37
	NOT_A_PIN	, // GPIO 38
	PK	, // GPIO 39
};
const uint8_t PROGMEM digital_pin_to_bit_mask_PGM[] = {
	_BV( 4 )	, // GPIO 0
	_BV( 1 )	, // GPIO 1
	_BV( 3 )	, // GPIO 2
	_BV( 0 )	, // GPIO 3
	_BV( 4 )	, // GPIO 4
	_BV( 0 )	, // GPIO 5
	0	, // GPIO 6
	0	, // GPIO 7
	0	, // GPIO 8
	0	, // GPIO 9
	0	, // GPIO 10
	0	, // GPIO 11
	_BV( 5 )	, // GPIO 12
	_BV( 4 )	, // GPIO 13
	_BV( 6 )	, // GPIO 14
	_BV( 5 )	, // GPIO 15
	_BV( 0 )	, // GPIO 16
	_BV( 1 )	, // GPIO 17
	_BV( 1 )	, // GPIO 18
	_BV( 3 )	, // GPIO 19
	0	, // GPIO 20
	_BV( 1 )	, // GPIO 21
	_BV( 0 )	, // GPIO 22
	_BV( 2 )	, // GPIO 23
	0	, // GPIO 24
	_BV( 4 )	, // GPIO 25
	_BV( 5 )	, // GPIO 26
	_BV( 7 )	, // GPIO 27
	0	, // GPIO 28
	0	, // GPIO 29
	0	, // GPIO 30
	0	, // GPIO 31
	_BV( 3 )	, // GPIO 32
	_BV( 4 )	, // GPIO 33
	_BV( 0 )	, // GPIO 34
	_BV( 1 )	, // GPIO 35
	_BV( 2 )	, // GPIO 36
	0	, // GPIO 37
	0	, // GPIO 38
	_BV( 3 )	, // GPIO 39
};
const uint8_t PROGMEM digital_pin_to_timer_PGM[] = {
	NOT_ON_TIMER	, // GPIO 0
	NOT_ON_TIMER	, // GPIO 1
	TIMER4A	, // GPIO 2
	NOT_ON_TIMER	, // GPIO 3
	TIMER3B	, // GPIO 4
	NOT_ON_TIMER	, // GPIO 5
	NOT_ON_TIMER	, // GPIO 6
	NOT_ON_TIMER	, // GPIO 7
	NOT_ON_TIMER	, // GPIO 8
	NOT_ON_TIMER	, // GPIO 9
	NOT_ON_TIMER	, // GPIO 10
	NOT_ON_TIMER	, // GPIO 11
	TIMER1A	, // GPIO 12
	TIMER2A	, // GPIO 13
	TIMER1B	, // GPIO 14
	TIMER3C	, // GPIO 15
	NOT_ON_TIMER	, // GPIO 16
	NOT_ON_TIMER	, // GPIO 17
	NOT_ON_TIMER	, // GPIO 18
	NOT_ON_TIMER	, // GPIO 19
	NOT_ON_TIMER	, // GPIO 20
	NOT_ON_TIMER	, // GPIO 21
	NOT_ON_TIMER	, // GPIO 22
	NOT_ON_TIMER	, // GPIO 23
	NOT_ON_TIMER	, // GPIO 24
	TIMER4B	, // GPIO 25
	TIMER4C	, // GPIO 26
	TIMER0A	, // GPIO 27
	NOT_ON_TIMER	, // GPIO 28
	NOT_ON_TIMER	, // GPIO 29
	NOT_ON_TIMER	, // GPIO 30
	NOT_ON_TIMER	, // GPIO 31
	TIMER5A	, // GPIO 32
	TIMER5B	, // GPIO 33
	NOT_ON_TIMER	, // GPIO 34
	NOT_ON_TIMER	, // GPIO 35
	NOT_ON_TIMER	, // GPIO 36
	NOT_ON_TIMER	, // GPIO 37
	NOT_ON_TIMER	, // GPIO 38
	NOT_ON_TIMER	, // GPIO 39
};
const uint8_t PROGMEM analog_pin_to_channel_PGM[] = { 15, 0, 13, 0, 12, 0, 0, 0, 0, 0, 0, 0, 10, 11, 9, 14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 7, 8, 0, 0, 0, 0, 2, 3, 4, 5, 0, 0, 0, 1 };
#endif

#define SERIAL_PORT_MONITOR         Serial
#define SERIAL_PORT_HARDWARE        Serial
#define SERIAL_PORT_HARDWARE1       Serial1
#define SERIAL_PORT_HARDWARE2       Serial2
#define SERIAL_PORT_HARDWARE3       Serial3
#define SERIAL_PORT_HARDWARE_OPEN   Serial2
#endif
