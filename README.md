# RyM Simu · Simulador de Arduino

Simulador de Arduino en el navegador con **emulación real del ATmega328P y el ATmega2560** ([avr8js](https://github.com/wokwi/avr8js)), compilación con **avr-gcc** y el núcleo oficial [ArduinoCore-avr](https://github.com/arduino/ArduinoCore-avr), y circuitos resueltos con análisis nodal (tensiones y corrientes reales).

## Qué incluye

- **Placas**: Arduino Uno R3, Arduino Nano (A6 y A7 solo analógicas) y Arduino Mega 2560 (54 pines digitales, 16 entradas analógicas, 15 PWM, Serial1–3, I2C en 20/21, SPI en 50–53). Se elige en el selector junto a los ejemplos; al cambiar de placa se conservan los cables de los pines que existen en las dos.
- **ESP32 DevKit (modo compatible)**: pinout real de 30 pines a 3,3 V, numeración por GPIO, `analogRead` de 12 bits, LEDC (API 2.x y 3.x), `dacWrite`, `touchRead`, interrupciones con `attachInterrupt(GPIO, …)`, botones EN y BOOT, `Serial.printf`, `Preferences`, `ESP32Servo` y `BluetoothSerial` (panel «Celular»). WiFi simulado: `WiFi.begin`/`softAP`, `WebServer` y `WiFiServer`; la página que sirve el ESP32 se ve en el panel **Navegador**, con enlaces, formularios y `fetch()`. No hay internet ni FreeRTOS: el programa corre sobre un ATmega2560 emulado con librerías de compatibilidad (`server/esp32/`), así que la velocidad y la memoria no son las del ESP32 real.
- **ESP32-CAM (AI-Thinker, modo compatible)**: sus 16 pines, LED flash en GPIO4, LED rojo en GPIO33 y botón RST. `esp_camera.h` con la cámara OV2640 simulada: `esp_camera_fb_get()` entrega un cuadro con la resolución elegida y el panel Navegador lo muestra como una imagen de prueba (también dentro de `<img>` de la página). No hay vídeo continuo (MJPEG).
- **ESP32-S3 DevKitC-1 y ESP32-C3 DevKitM-1 (modo compatible)**: cada una con su numeración de GPIO y sus pines por defecto (I2C, SPI, Serial1), LED RGB de la placa (`neopixelWrite`, `rgbLedWrite` y `digitalWrite(RGB_BUILTIN, …)`), botón BOOT (GPIO0 en el S3, GPIO9 en el C3) y `CONFIG_IDF_TARGET_*`. Como en los chips reales, `BluetoothSerial` no compila (solo tienen Bluetooth LE, que no se simula).
- **Editor de circuitos**: biblioteca de componentes, arrastrar y soltar, cables con codos, girar, propiedades.
- **Componentes**: LED (6 colores), LED RGB, resistencia (bandas de color), pulsador (con rebote opcional), interruptor, potenciómetro, fotorresistencia, zumbador (con sonido), servo SG90, LCD 16×2 paralelo (HD44780) y LCD 16×2 I2C (PCF8574).
- **Módulos**: ultrasonido HC-SR04, DHT22/DHT11, PIR, joystick KY-023, sensor de llama, sensor de gas MQ-2, módulo relé, driver L298N con motor DC, batería, OLED SSD1306 I2C, matriz 8×8 MAX7219 y Bluetooth HC-05/HC-06 (con panel «Celular» para enviar y recibir).
- **Kit de sensores (KY) y otros módulos**: botón KY-004, inclinación KY-020, reed KY-021, Hall KY-003 y lineal KY-024, golpe KY-031, táctil TTP223, obstáculo IR, seguidor de línea KY-033, termistor KY-013 y KY-028, LDR KY-018, micrófono KY-038, humedad de suelo, lluvia, nivel de agua, láser KY-008, zumbador activo KY-012 y pasivo KY-006, LED de 2 colores KY-011, semáforo y relés de 1, 2, 4 y 8 canales.
- **Pantallas y entradas**: display de 7 segmentos (cátodo o ánodo común), TM1637 de 4 dígitos (librería TM1637Display), teclado matricial 4x4 (Keypad), encoder rotativo KY-040, receptor IR VS1838B con control remoto NEC (IRremote).
- **Módulos con protocolo propio**: reloj DS1302 (Rtc by Makuna, 3 hilos), motor paso a paso 28BYJ-48 con driver ULN2003 (Stepper), lector RFID RC522 con tarjetas MIFARE Classic 1K que se pueden leer y escribir (MFRC522, SPI), termómetro DS18B20 (OneWire + DallasTemperature, con búsqueda de ROM).
- **Tiras y aros LED**: tira WS2812B/NeoPixel de 1 a 15 LED y aro de 1 a 10 (Adafruit_NeoPixel; el protocolo se decodifica por tiempos, se pueden encadenar por DOUT → DIN y avisa del consumo), y tira o aro RGB común de ánodo común a 12 V o 5 V (avisa si un canal se maneja directo desde un pin en vez de con un transistor o MOSFET).
- **Componentes electrónicos**: condensador cerámico (10 pF a 10 µF, con su código 104, 473…) y electrolítico (1 µF a 4700 µF, con tensión máxima) que se cargan y descargan en el tiempo (constante RC real; avisa si el electrolítico está invertido o pasado de tensión); diodos 1N4007, 1N4148 y 1N5819; Zener de 3,3 a 12 V; transistores NPN (2N2222A, BC547, TIP120) y PNP (2N2907A, BC557, TIP125) con corte, zona activa y saturación; MOSFET IRLZ44N e IRF540N; reguladores 7805, 7809, 7812 y AMS1117 de 3,3 y 5 V (caída mínima, calor). Cada uno tiene sus pines en el orden real del encapsulado.
- **Protoboards**: completa (830 puntos), media (400) y mini (170). Las columnas de 5 y los rieles + y − están unidos por dentro, y las patas de los componentes que caen sobre un agujero quedan conectadas sin cable. Al mover la protoboard se mueve todo lo que tiene enchufado.
- **NFC, almacenamiento, audio y comunicación**: lector NFC PN532 en I2C, SPI o HSU con tarjeta MIFARE Classic, llavero y etiqueta NTAG213 (Adafruit_PN532); lector microSD con una tarjeta FAT16 de 64 MB simulada cuyos archivos se ven, se bajan y se suben desde el panel (SD); reproductor DFPlayer Mini con tus MP3 o melodías de prueba, que suena por un parlante de 8 Ω o por el amplificador PAM8610 (DFRobotDFPlayerMini); módulo GSM SIM800L con comandos AT, SMS y llamadas desde el panel «Celular»; emisor FS1000A y receptor XY-MK-5V de 433 MHz con control remoto A–D (RCSwitch).
- **Sensores, pantallas y motores**: sensor de color TCS3200/TCS230 (frecuencia según S0–S3 y el color elegido), acelerómetro y giroscopio MPU6050 (Adafruit_MPU6050 y MPU6050 de Electronic Cats), LCD 20×4 I2C azul o verde, pantalla TFT 2,2" ILI9341 de 240×320 por SPI (Adafruit_ILI9341), motor amarillo con reductora (TT) y servo MG996R de alto torque.
- **Arduino casero**: placa «ATmega328P suelto» (DIP-28 con zócalo y la numeración física de las patas), cristal de 16 MHz, tiras de pines macho y hembra de 1 a 20 y borneras de 2 y 3 polos de 5,08 mm. El chip solo arranca con 5 V en VCC, cristal entre XTAL1 y XTAL2 y RESET en alto, y avisa si faltan los condensadores de 22 pF, AVCC o la resistencia de reset.
- **Abrir y guardar proyectos**: el botón **Abrir** acepta un `.ino`, un `.json` (el formato propio de RyM Simu o un `diagram.json` de Wokwi), los dos juntos, un `.zip` con ambos y pestañas `.h/.cpp`; también se pueden arrastrar al lienzo. El botón **.json** descarga el circuito con el código para volver a abrirlo. Las piezas de Wokwi que no existen en RyM Simu se omiten con un aviso.
- **Librerías incluidas** además de las del núcleo: Servo, LiquidCrystal, DHT sensor library, Adafruit SSD1306, Adafruit GFX, Adafruit BusIO, Adafruit Unified Sensor y LedControl, TM1637, Keypad, IRremote, MFRC522, Rtc, OneWire, DallasTemperature, Stepper, Adafruit NeoPixel, Adafruit PN532, SD, DFRobotDFPlayerMini, Adafruit MPU6050, MPU6050, RCSwitch, LiquidCrystal_I2C y Adafruit ILI9341.
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
docker build -t rym-simu .
docker run -p 8080:8080 rym-simu
```

## Pruebas

```sh
npm test                      # compilador (avr-gcc)
node test/e2e.cjs             # extremo a extremo con Playwright, con el servidor en marcha
node test/e2e-modules.cjs     # módulos de la tanda 1 (sensores, relé, motor, pantallas, Bluetooth)
node test/e2e-kits.cjs        # módulos del kit KY, humedad de suelo, agua, relés, semáforo
node test/e2e-kits2.cjs       # 7 segmentos, TM1637, teclado 4x4, encoder, control IR
node test/e2e-kits3.cjs       # DS1302, 28BYJ-48 + ULN2003, RC522, DS18B20
node test/e2e-kits4.cjs       # tiras y aros LED (WS2812B y RGB comunes)
node test/e2e-kits5.cjs       # condensadores (RC), diodos, Zener, transistores, MOSFET, reguladores
node test/e2e-kits6.cjs       # protoboards con conexión automática
node test/e2e-kits7.cjs       # PN532, microSD, DFPlayer, MPU6050, TFT, RF 433, Arduino casero y abrir .ino/diagram.json
node test/e2e-boards.cjs      # placas Nano y Mega 2560 (PWM de los 6 timers, A8, INT4, Serial1, I2C en 20/21)
node test/e2e-esp32.cjs       # ESP32, ESP32-CAM, S3 y C3: WiFi y servidor web, Navegador, ADC de 12 bits, LEDC, BOOT, Bluetooth, fotos
```

## Arquitectura

```
web/src/main.js        interfaz, circuito y solucionador nodal, bucle de simulación
web/src/emulator.js    ATmega328P y ATmega2560 con avr8js (puertos, timers, ADC, USART, TWI, SPI)
web/src/boards.js      placas Uno, Nano y Mega: pines Arduino ↔ puerto/bit, terminales y dibujo
web/src/components.js  componentes: terminales, dibujo y modelo eléctrico
web/src/kits.js        módulos del kit KY, relés de varios canales, semáforo, suelo/lluvia/agua
web/src/kits2.js       7 segmentos, TM1637, teclado 4x4, encoder KY-040, receptor y control IR
web/src/kits3.js       DS1302, 28BYJ-48 + ULN2003, RC522 (registros del MFRC522 y tarjeta MIFARE), DS18B20 (1-Wire)
web/src/modules.js     módulos (sensores, relé, L298N, OLED, MAX7219, HC-05) y sus modelos con temporización exacta
web/src/lcd.js         controlador HD44780, mochila PCF8574 y bus I2C
web/src/libs.js        librerías del usuario (zip, IndexedDB)
web/src/esp32map.js    ESP32: GPIO ↔ puerto/bit del ATmega2560, canales ADC (lo usan la placa y la variante)
web/src/esp32link.js   ESP32: red simulada (Serial3) y Bluetooth (Serial1), panel Navegador
server/esp32/          ESP32, S3 y C3: variantes de pines (variant*, generadas con scripts/gen-esp32-variant.mjs) y librerías de compatibilidad
server/build.js        placas (mmcu, variante), preprocesado .ino, resolución de librerías, avr-gcc, .hex
server/index.js        servidor HTTP: web estática, /api/compile y /api/libraries
```

## Seguridad del compilador

El servidor compila código de terceros. Rechaza `#include` con rutas absolutas, `..` o macros, y `.incbin`, limita tamaños y tiempo de compilación y nunca ejecuta el programa compilado. Aun así, ejecútalo dentro de un contenedor sin privilegios (el `Dockerfile` usa un usuario sin permisos de root).

## Publicar

El repositorio incluye `render.yaml`: en [Render](https://render.com) elige **New → Blueprint** y selecciona este repositorio. Cualquier servicio que ejecute contenedores Docker (Fly.io, Railway, Google Cloud Run, un VPS) sirve igual: construye el `Dockerfile` y expone el puerto 8080.
