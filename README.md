# Banco Uno · Simulador de Arduino

Simulador de Arduino en el navegador con **emulación real del ATmega328P y el ATmega2560** ([avr8js](https://github.com/wokwi/avr8js)), compilación con **avr-gcc** y el núcleo oficial [ArduinoCore-avr](https://github.com/arduino/ArduinoCore-avr), y circuitos resueltos con análisis nodal (tensiones y corrientes reales).

## Qué incluye

- **Placas**: Arduino Uno R3, Arduino Nano (A6 y A7 solo analógicas) y Arduino Mega 2560 (54 pines digitales, 16 entradas analógicas, 15 PWM, Serial1–3, I2C en 20/21, SPI en 50–53). Se elige en el selector junto a los ejemplos; al cambiar de placa se conservan los cables de los pines que existen en las dos.
- **Editor de circuitos**: biblioteca de componentes, arrastrar y soltar, cables con codos, girar, propiedades.
- **Componentes**: LED (6 colores), LED RGB, resistencia (bandas de color), pulsador (con rebote opcional), interruptor, potenciómetro, fotorresistencia, zumbador (con sonido), servo SG90, LCD 16×2 paralelo (HD44780) y LCD 16×2 I2C (PCF8574).
- **Módulos**: ultrasonido HC-SR04, DHT22/DHT11, PIR, joystick KY-023, sensor de llama, sensor de gas MQ-2, módulo relé, driver L298N con motor DC, batería, OLED SSD1306 I2C, matriz 8×8 MAX7219 y Bluetooth HC-05/HC-06 (con panel «Celular» para enviar y recibir).
- **Librerías incluidas** además de las del núcleo: Servo, LiquidCrystal, DHT sensor library, Adafruit SSD1306, Adafruit GFX, Adafruit BusIO, Adafruit Unified Sensor y LedControl.
- **Emulación real**: CPU AVR, timers y PWM, ADC, USART (monitor serie bidireccional), I2C, SPI, EEPROM e interrupciones externas. En el Mega: timers 0–5, cuatro USART, ADC de 16 canales e INT0–INT7.
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
node test/e2e-modules.cjs     # módulos de la tanda 1 (sensores, relé, motor, pantallas, Bluetooth)
node test/e2e-boards.cjs      # placas Nano y Mega 2560 (PWM de los 6 timers, A8, INT4, Serial1, I2C en 20/21)
```

## Arquitectura

```
web/src/main.js        interfaz, circuito y solucionador nodal, bucle de simulación
web/src/emulator.js    ATmega328P y ATmega2560 con avr8js (puertos, timers, ADC, USART, TWI, SPI)
web/src/boards.js      placas Uno, Nano y Mega: pines Arduino ↔ puerto/bit, terminales y dibujo
web/src/components.js  componentes: terminales, dibujo y modelo eléctrico
web/src/modules.js     módulos (sensores, relé, L298N, OLED, MAX7219, HC-05) y sus modelos con temporización exacta
web/src/lcd.js         controlador HD44780, mochila PCF8574 y bus I2C
web/src/libs.js        librerías del usuario (zip, IndexedDB)
server/build.js        placas (mmcu, variante), preprocesado .ino, resolución de librerías, avr-gcc, .hex
server/index.js        servidor HTTP: web estática, /api/compile y /api/libraries
```

## Seguridad del compilador

El servidor compila código de terceros. Rechaza `#include` con rutas absolutas, `..` o macros, y `.incbin`, limita tamaños y tiempo de compilación y nunca ejecuta el programa compilado. Aun así, ejecútalo dentro de un contenedor sin privilegios (el `Dockerfile` usa un usuario sin permisos de root).

## Publicar

El repositorio incluye `render.yaml`: en [Render](https://render.com) elige **New → Blueprint** y selecciona este repositorio. Cualquier servicio que ejecute contenedores Docker (Fly.io, Railway, Google Cloud Run, un VPS) sirve igual: construye el `Dockerfile` y expone el puerto 8080.
