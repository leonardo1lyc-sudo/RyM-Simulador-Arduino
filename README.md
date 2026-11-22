# Banco Uno · Simulador de Arduino

Simulador de Arduino Uno en el navegador con **emulación real del ATmega328P** ([avr8js](https://github.com/wokwi/avr8js)), compilación con **avr-gcc** y el núcleo oficial [ArduinoCore-avr](https://github.com/arduino/ArduinoCore-avr), y circuitos resueltos con análisis nodal (tensiones y corrientes reales).

## Qué incluye

- **Editor de circuitos**: biblioteca de componentes, arrastrar y soltar, cables con codos, girar, propiedades.
- **Componentes**: LED (6 colores), LED RGB, resistencia (bandas de color), pulsador (con rebote opcional), interruptor, potenciómetro, fotorresistencia, zumbador (con sonido), servo SG90, LCD 16×2 paralelo (HD44780) y LCD 16×2 I2C (PCF8574).
- **Emulación real**: CPU AVR, timers y PWM, ADC, USART (monitor serie bidireccional), I2C, SPI y EEPROM.
- **Librerías**: incluidas Servo, LiquidCrystal, Wire, SPI, EEPROM y SoftwareSerial. El usuario puede **cargar las suyas** como `.zip` (el mismo formato que «Añadir biblioteca .ZIP» del IDE) o como archivos `.h/.cpp`; se guardan en el navegador y se envían al compilar.
- **Avisos educativos**: LED sin resistencia, pin que entrega más de 40 mA, cortocircuitos, entradas flotantes, servo o pantalla sin alimentación, cableado I2C incorrecto.
- **Errores de compilación en español**, con enlace a la línea.

## Ejecutar en local

Requisitos: Node 20+, `gcc-avr`, `avr-libc` y `binutils-avr` (en Debian/Ubuntu: `sudo apt install gcc-avr avr-libc binutils-avr`).

```sh
npm install
sh scripts/setup-vendor.sh   # descarga el núcleo AVR y las librerías incluidas
npm run dev                  # compila la web y abre http://localhost:8080
```

Con Docker:

```sh
docker build -t banco-uno .
docker run -p 8080:8080 banco-uno
```

## Pruebas

```sh
npm test                      # compilador (avr-gcc)
node test/e2e.cjs             # extremo a extremo con Playwright, con el servidor en marcha
```

## Arquitectura

```
web/src/main.js        interfaz, circuito y solucionador nodal, bucle de simulación
web/src/emulator.js    ATmega328P con avr8js (puertos, timers, ADC, USART, TWI, SPI)
web/src/components.js  componentes: terminales, dibujo y modelo eléctrico
web/src/lcd.js         controlador HD44780, mochila PCF8574 y bus I2C
web/src/libs.js        librerías del usuario (zip, IndexedDB)
server/build.js        preprocesado .ino, resolución de librerías, avr-gcc, .hex
server/index.js        servidor HTTP: web estática, /api/compile y /api/libraries
```

## Seguridad del compilador

El servidor compila código de terceros. Rechaza `#include` con rutas absolutas, `..` o macros, y `.incbin`, limita tamaños y tiempo de compilación y nunca ejecuta el programa compilado. Aun así, ejecútalo dentro de un contenedor sin privilegios (el `Dockerfile` usa un usuario sin permisos de root).
