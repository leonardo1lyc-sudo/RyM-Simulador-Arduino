// GENERADO por scripts/gen-esp32-variant.mjs: no editar a mano.
// Variante «ESP32-C3 DevKitM-1 (modo compatible)»: los números de pin son los GPIO del chip y cada uno
// corresponde a un pin del ATmega2560 emulado (ver web/src/esp32map.js).
#ifndef Pins_Arduino_h
#define Pins_Arduino_h
#include <avr/pgmspace.h>

#define NUM_DIGITAL_PINS            22
#define NUM_ANALOG_INPUTS           16
#define analogInputToDigitalPin(p)  (-1)
#define digitalPinHasPWM(p)         ((p) == 1 || (p) == 2 || (p) == 3 || (p) == 10)
extern const uint8_t PROGMEM analog_pin_to_channel_PGM[];
#define analogPinToChannel(P)       ( (P) < 22 ? pgm_read_byte( analog_pin_to_channel_PGM + (P) ) : 0 )

#define PIN_SPI_SS    (7)
#define PIN_SPI_MOSI  (6)
#define PIN_SPI_MISO  (5)
#define PIN_SPI_SCK   (4)
static const uint8_t SS   = PIN_SPI_SS;
static const uint8_t MOSI = PIN_SPI_MOSI;
static const uint8_t MISO = PIN_SPI_MISO;
static const uint8_t SCK  = PIN_SPI_SCK;
#define PIN_WIRE_SDA        (8)
#define PIN_WIRE_SCL        (9)
static const uint8_t SDA = PIN_WIRE_SDA;
static const uint8_t SCL = PIN_WIRE_SCL;
static const uint8_t TX = 21;
static const uint8_t RX = 20;
#define TX1 19
#define RX1 18
// LED RGB (WS2812) de la placa en GPIO8: digitalWrite(RGB_BUILTIN, HIGH) lo prende en blanco
#define PIN_RGB_LED 8
#define RGB_BUILTIN 100
#define RGB_BRIGHTNESS 64
#define LED_BUILTIN RGB_BUILTIN
#define BUILTIN_LED RGB_BUILTIN
#define BANCO_EXT_PINS { 10, 2, 9, 8 }
#define BANCO_CHIP_MODEL "ESP32-C3"
static const uint8_t A0 = 0;
static const uint8_t A1 = 1;
static const uint8_t A2 = 2;
static const uint8_t A3 = 3;
static const uint8_t A4 = 4;
static const uint8_t A5 = 5;



#define digitalPinToPCICR(p)    ( ((p) == 4 || (p) == 5 || (p) == 6 || (p) == 7) || ((p) == 0) ? (&PCICR) : ((uint8_t *)0) )
#define digitalPinToPCICRbit(p) ( ((p) == 4 || (p) == 5 || (p) == 6 || (p) == 7) ? 0 : 2 )
#define digitalPinToPCMSK(p)    ( ((p) == 4 || (p) == 5 || (p) == 6 || (p) == 7) ? (&PCMSK0) : ( ((p) == 0) ? (&PCMSK2) : ((uint8_t *)0) ) )
#define digitalPinToPCMSKbit(p) ((p) == 4 ? 1 : ((p) == 5 ? 3 : ((p) == 6 ? 2 : ((p) == 7 ? 0 : ((p) == 0 ? 0 : 0)))))
#define digitalPinToInterrupt(p) ((p) < 22 ? (p) : NOT_AN_INTERRUPT) // en el ESP32 el número de interrupción es el GPIO

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
	PE	, // GPIO 2
	PH	, // GPIO 3
	PB	, // GPIO 4
	PB	, // GPIO 5
	PB	, // GPIO 6
	PB	, // GPIO 7
	PD	, // GPIO 8
	PD	, // GPIO 9
	PE	, // GPIO 10
	NOT_A_PIN	, // GPIO 11
	NOT_A_PIN	, // GPIO 12
	NOT_A_PIN	, // GPIO 13
	NOT_A_PIN	, // GPIO 14
	NOT_A_PIN	, // GPIO 15
	NOT_A_PIN	, // GPIO 16
	NOT_A_PIN	, // GPIO 17
	PD	, // GPIO 18
	PD	, // GPIO 19
	PE	, // GPIO 20
	PE	, // GPIO 21
};
const uint8_t PROGMEM digital_pin_to_bit_mask_PGM[] = {
	_BV( 0 )	, // GPIO 0
	_BV( 3 )	, // GPIO 1
	_BV( 5 )	, // GPIO 2
	_BV( 4 )	, // GPIO 3
	_BV( 1 )	, // GPIO 4
	_BV( 3 )	, // GPIO 5
	_BV( 2 )	, // GPIO 6
	_BV( 0 )	, // GPIO 7
	_BV( 1 )	, // GPIO 8
	_BV( 0 )	, // GPIO 9
	_BV( 4 )	, // GPIO 10
	0	, // GPIO 11
	0	, // GPIO 12
	0	, // GPIO 13
	0	, // GPIO 14
	0	, // GPIO 15
	0	, // GPIO 16
	0	, // GPIO 17
	_BV( 2 )	, // GPIO 18
	_BV( 3 )	, // GPIO 19
	_BV( 0 )	, // GPIO 20
	_BV( 1 )	, // GPIO 21
};
const uint8_t PROGMEM digital_pin_to_timer_PGM[] = {
	NOT_ON_TIMER	, // GPIO 0
	TIMER4A	, // GPIO 1
	TIMER3C	, // GPIO 2
	TIMER4B	, // GPIO 3
	NOT_ON_TIMER	, // GPIO 4
	NOT_ON_TIMER	, // GPIO 5
	NOT_ON_TIMER	, // GPIO 6
	NOT_ON_TIMER	, // GPIO 7
	NOT_ON_TIMER	, // GPIO 8
	NOT_ON_TIMER	, // GPIO 9
	TIMER3B	, // GPIO 10
	NOT_ON_TIMER	, // GPIO 11
	NOT_ON_TIMER	, // GPIO 12
	NOT_ON_TIMER	, // GPIO 13
	NOT_ON_TIMER	, // GPIO 14
	NOT_ON_TIMER	, // GPIO 15
	NOT_ON_TIMER	, // GPIO 16
	NOT_ON_TIMER	, // GPIO 17
	NOT_ON_TIMER	, // GPIO 18
	NOT_ON_TIMER	, // GPIO 19
	NOT_ON_TIMER	, // GPIO 20
	NOT_ON_TIMER	, // GPIO 21
};
const uint8_t PROGMEM analog_pin_to_channel_PGM[] = { 0, 1, 2, 3, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
#endif

#define SERIAL_PORT_MONITOR         Serial
#define SERIAL_PORT_HARDWARE        Serial
#define SERIAL_PORT_HARDWARE1       Serial1
#define SERIAL_PORT_HARDWARE2       Serial2
#define SERIAL_PORT_HARDWARE3       Serial3
#define SERIAL_PORT_HARDWARE_OPEN   Serial2
#endif
