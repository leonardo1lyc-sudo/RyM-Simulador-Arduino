// GENERADO por scripts/gen-esp32-variant.mjs: no editar a mano.
// Variante «ESP32-S3 DevKitC-1 (modo compatible)»: los números de pin son los GPIO del chip y cada uno
// corresponde a un pin del ATmega2560 emulado (ver web/src/esp32map.js).
#ifndef Pins_Arduino_h
#define Pins_Arduino_h
#include <avr/pgmspace.h>

#define NUM_DIGITAL_PINS            49
#define NUM_ANALOG_INPUTS           16
#define analogInputToDigitalPin(p)  (-1)
#define digitalPinHasPWM(p)         ((p) == 1 || (p) == 2 || (p) == 4 || (p) == 5 || (p) == 6 || (p) == 7 || (p) == 15 || (p) == 16 || (p) == 21 || (p) == 38 || (p) == 39 || (p) == 40 || (p) == 41 || (p) == 42 || (p) == 47)
extern const uint8_t PROGMEM analog_pin_to_channel_PGM[];
#define analogPinToChannel(P)       ( (P) < 49 ? pgm_read_byte( analog_pin_to_channel_PGM + (P) ) : 0 )

#define PIN_SPI_SS    (10)
#define PIN_SPI_MOSI  (11)
#define PIN_SPI_MISO  (13)
#define PIN_SPI_SCK   (12)
static const uint8_t SS   = PIN_SPI_SS;
static const uint8_t MOSI = PIN_SPI_MOSI;
static const uint8_t MISO = PIN_SPI_MISO;
static const uint8_t SCK  = PIN_SPI_SCK;
#define PIN_WIRE_SDA        (8)
#define PIN_WIRE_SCL        (9)
static const uint8_t SDA = PIN_WIRE_SDA;
static const uint8_t SCL = PIN_WIRE_SCL;
static const uint8_t TX = 43;
static const uint8_t RX = 44;
#define TX1 17
#define RX1 18
// LED RGB (WS2812) de la placa en GPIO48: digitalWrite(RGB_BUILTIN, HIGH) lo prende en blanco
#define PIN_RGB_LED 48
#define RGB_BUILTIN 100
#define RGB_BRIGHTNESS 64
#define LED_BUILTIN RGB_BUILTIN
#define BUILTIN_LED RGB_BUILTIN
#define BANCO_EXT_PINS { 4, 5, 9, 8 }
#define BANCO_CHIP_MODEL "ESP32-S3"
static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A3 = 4;
static const uint8_t A4 = 5;
static const uint8_t A5 = 6;
static const uint8_t A6 = 7;
static const uint8_t A7 = 8;
static const uint8_t A8 = 9;
static const uint8_t A9 = 10;
static const uint8_t A10 = 11;
static const uint8_t A11 = 12;
static const uint8_t A12 = 13;
static const uint8_t A13 = 14;
static const uint8_t A14 = 15;
static const uint8_t A15 = 16;
static const uint8_t A16 = 17;
static const uint8_t A17 = 18;
static const uint8_t A18 = 19;
static const uint8_t A19 = 20;
static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T3 = 3;
static const uint8_t T4 = 4;
static const uint8_t T5 = 5;
static const uint8_t T6 = 6;
static const uint8_t T7 = 7;
static const uint8_t T8 = 8;
static const uint8_t T9 = 9;
static const uint8_t T10 = 10;
static const uint8_t T11 = 11;
static const uint8_t T12 = 12;
static const uint8_t T13 = 13;
static const uint8_t T14 = 14;


#define digitalPinToPCICR(p)    ( ((p) == 10 || (p) == 11 || (p) == 12 || (p) == 13 || (p) == 15 || (p) == 16 || (p) == 21 || (p) == 47) || ((p) == 0 || (p) == 3 || (p) == 14 || (p) == 35 || (p) == 36 || (p) == 37 || (p) == 45 || (p) == 46) ? (&PCICR) : ((uint8_t *)0) )
#define digitalPinToPCICRbit(p) ( ((p) == 10 || (p) == 11 || (p) == 12 || (p) == 13 || (p) == 15 || (p) == 16 || (p) == 21 || (p) == 47) ? 0 : 2 )
#define digitalPinToPCMSK(p)    ( ((p) == 10 || (p) == 11 || (p) == 12 || (p) == 13 || (p) == 15 || (p) == 16 || (p) == 21 || (p) == 47) ? (&PCMSK0) : ( ((p) == 0 || (p) == 3 || (p) == 14 || (p) == 35 || (p) == 36 || (p) == 37 || (p) == 45 || (p) == 46) ? (&PCMSK2) : ((uint8_t *)0) ) )
#define digitalPinToPCMSKbit(p) ((p) == 10 ? 0 : ((p) == 11 ? 2 : ((p) == 12 ? 1 : ((p) == 13 ? 3 : ((p) == 15 ? 4 : ((p) == 16 ? 5 : ((p) == 21 ? 6 : ((p) == 47 ? 7 : ((p) == 0 ? 0 : ((p) == 3 ? 2 : ((p) == 14 ? 1 : ((p) == 35 ? 3 : ((p) == 36 ? 4 : ((p) == 37 ? 5 : ((p) == 45 ? 6 : ((p) == 46 ? 7 : 0))))))))))))))))
#define digitalPinToInterrupt(p) ((p) < 49 ? (p) : NOT_AN_INTERRUPT) // en el ESP32 el número de interrupción es el GPIO

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
	PH	, // GPIO 1
	PH	, // GPIO 2
	PK	, // GPIO 3
	PE	, // GPIO 4
	PE	, // GPIO 5
	PE	, // GPIO 6
	PH	, // GPIO 7
	PD	, // GPIO 8
	PD	, // GPIO 9
	PB	, // GPIO 10
	PB	, // GPIO 11
	PB	, // GPIO 12
	PB	, // GPIO 13
	PK	, // GPIO 14
	PB	, // GPIO 15
	PB	, // GPIO 16
	PD	, // GPIO 17
	PD	, // GPIO 18
	PH	, // GPIO 19
	PH	, // GPIO 20
	PB	, // GPIO 21
	NOT_A_PIN	, // GPIO 22
	NOT_A_PIN	, // GPIO 23
	NOT_A_PIN	, // GPIO 24
	NOT_A_PIN	, // GPIO 25
	NOT_A_PIN	, // GPIO 26
	NOT_A_PIN	, // GPIO 27
	NOT_A_PIN	, // GPIO 28
	NOT_A_PIN	, // GPIO 29
	NOT_A_PIN	, // GPIO 30
	NOT_A_PIN	, // GPIO 31
	NOT_A_PIN	, // GPIO 32
	NOT_A_PIN	, // GPIO 33
	NOT_A_PIN	, // GPIO 34
	PK	, // GPIO 35
	PK	, // GPIO 36
	PK	, // GPIO 37
	PL	, // GPIO 38
	PL	, // GPIO 39
	PL	, // GPIO 40
	PH	, // GPIO 41
	PG	, // GPIO 42
	PE	, // GPIO 43
	PE	, // GPIO 44
	PK	, // GPIO 45
	PK	, // GPIO 46
	PB	, // GPIO 47
	PE	, // GPIO 48
};
const uint8_t PROGMEM digital_pin_to_bit_mask_PGM[] = {
	_BV( 0 )	, // GPIO 0
	_BV( 3 )	, // GPIO 1
	_BV( 4 )	, // GPIO 2
	_BV( 2 )	, // GPIO 3
	_BV( 4 )	, // GPIO 4
	_BV( 5 )	, // GPIO 5
	_BV( 3 )	, // GPIO 6
	_BV( 5 )	, // GPIO 7
	_BV( 1 )	, // GPIO 8
	_BV( 0 )	, // GPIO 9
	_BV( 0 )	, // GPIO 10
	_BV( 2 )	, // GPIO 11
	_BV( 1 )	, // GPIO 12
	_BV( 3 )	, // GPIO 13
	_BV( 1 )	, // GPIO 14
	_BV( 4 )	, // GPIO 15
	_BV( 5 )	, // GPIO 16
	_BV( 3 )	, // GPIO 17
	_BV( 2 )	, // GPIO 18
	_BV( 0 )	, // GPIO 19
	_BV( 1 )	, // GPIO 20
	_BV( 6 )	, // GPIO 21
	0	, // GPIO 22
	0	, // GPIO 23
	0	, // GPIO 24
	0	, // GPIO 25
	0	, // GPIO 26
	0	, // GPIO 27
	0	, // GPIO 28
	0	, // GPIO 29
	0	, // GPIO 30
	0	, // GPIO 31
	0	, // GPIO 32
	0	, // GPIO 33
	0	, // GPIO 34
	_BV( 3 )	, // GPIO 35
	_BV( 4 )	, // GPIO 36
	_BV( 5 )	, // GPIO 37
	_BV( 3 )	, // GPIO 38
	_BV( 4 )	, // GPIO 39
	_BV( 5 )	, // GPIO 40
	_BV( 6 )	, // GPIO 41
	_BV( 5 )	, // GPIO 42
	_BV( 1 )	, // GPIO 43
	_BV( 0 )	, // GPIO 44
	_BV( 6 )	, // GPIO 45
	_BV( 7 )	, // GPIO 46
	_BV( 7 )	, // GPIO 47
	_BV( 6 )	, // GPIO 48
};
const uint8_t PROGMEM digital_pin_to_timer_PGM[] = {
	NOT_ON_TIMER	, // GPIO 0
	TIMER4A	, // GPIO 1
	TIMER4B	, // GPIO 2
	NOT_ON_TIMER	, // GPIO 3
	TIMER3B	, // GPIO 4
	TIMER3C	, // GPIO 5
	TIMER3A	, // GPIO 6
	TIMER4C	, // GPIO 7
	NOT_ON_TIMER	, // GPIO 8
	NOT_ON_TIMER	, // GPIO 9
	NOT_ON_TIMER	, // GPIO 10
	NOT_ON_TIMER	, // GPIO 11
	NOT_ON_TIMER	, // GPIO 12
	NOT_ON_TIMER	, // GPIO 13
	NOT_ON_TIMER	, // GPIO 14
	TIMER2A	, // GPIO 15
	TIMER1A	, // GPIO 16
	NOT_ON_TIMER	, // GPIO 17
	NOT_ON_TIMER	, // GPIO 18
	NOT_ON_TIMER	, // GPIO 19
	NOT_ON_TIMER	, // GPIO 20
	TIMER1B	, // GPIO 21
	NOT_ON_TIMER	, // GPIO 22
	NOT_ON_TIMER	, // GPIO 23
	NOT_ON_TIMER	, // GPIO 24
	NOT_ON_TIMER	, // GPIO 25
	NOT_ON_TIMER	, // GPIO 26
	NOT_ON_TIMER	, // GPIO 27
	NOT_ON_TIMER	, // GPIO 28
	NOT_ON_TIMER	, // GPIO 29
	NOT_ON_TIMER	, // GPIO 30
	NOT_ON_TIMER	, // GPIO 31
	NOT_ON_TIMER	, // GPIO 32
	NOT_ON_TIMER	, // GPIO 33
	NOT_ON_TIMER	, // GPIO 34
	NOT_ON_TIMER	, // GPIO 35
	NOT_ON_TIMER	, // GPIO 36
	NOT_ON_TIMER	, // GPIO 37
	TIMER5A	, // GPIO 38
	TIMER5B	, // GPIO 39
	TIMER5C	, // GPIO 40
	TIMER2B	, // GPIO 41
	TIMER0B	, // GPIO 42
	NOT_ON_TIMER	, // GPIO 43
	NOT_ON_TIMER	, // GPIO 44
	NOT_ON_TIMER	, // GPIO 45
	NOT_ON_TIMER	, // GPIO 46
	TIMER0A	, // GPIO 47
	NOT_ON_TIMER	, // GPIO 48
};
const uint8_t PROGMEM analog_pin_to_channel_PGM[] = { 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
#endif

#define SERIAL_PORT_MONITOR         Serial
#define SERIAL_PORT_HARDWARE        Serial
#define SERIAL_PORT_HARDWARE1       Serial1
#define SERIAL_PORT_HARDWARE2       Serial2
#define SERIAL_PORT_HARDWARE3       Serial3
#define SERIAL_PORT_HARDWARE_OPEN   Serial2
#endif
