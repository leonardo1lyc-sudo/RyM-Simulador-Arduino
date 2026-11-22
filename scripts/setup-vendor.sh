#!/usr/bin/env sh
# Descarga el núcleo oficial Arduino AVR y las librerías incluidas, en versiones fijas.
set -eu
cd "$(dirname "$0")/.."
mkdir -p vendor
fetch() { # repo destino commit
  if [ -d "vendor/$2" ] && [ -n "$(ls -A "vendor/$2")" ]; then return; fi
  mkdir -p "vendor/$2"
  if curl -fsSL --retry 3 -o "vendor/.$2.tgz" "https://codeload.github.com/$1/tar.gz/$3"; then
    tar xzf "vendor/.$2.tgz" -C "vendor/$2" --strip-components 1
  else # sin codeload: git
    git -C "vendor/$2" init -q && git -C "vendor/$2" fetch -q --depth 1 "https://github.com/$1.git" "$3" && git -C "vendor/$2" checkout -q FETCH_HEAD && rm -rf "vendor/$2/.git"
  fi
  rm -f "vendor/.$2.tgz"
  rm -rf "vendor/$2/examples" "vendor/$2/extras" "vendor/$2/docs"
}
fetch arduino/ArduinoCore-avr ArduinoCore-avr 11b9130371e8447920edb65a75706a6c951e51fc
fetch arduino-libraries/Servo Servo 440b319ec11ea2664df8ce201c271c935de28a2d
fetch arduino-libraries/LiquidCrystal LiquidCrystal 42022e0bb7e11829317467bab28ed42af23e0ee5
# librerías de terceros para los módulos del simulador (versiones fijas)
fetch adafruit/DHT-sensor-library libraries/DHT f7d625462e6033f373e51f8c67f88fc429535b47
fetch adafruit/Adafruit_Sensor libraries/Adafruit_Sensor 0a9127a1e886ff1adb4c1b6f5958b24108d55aa6
fetch adafruit/Adafruit_SSD1306 libraries/Adafruit_SSD1306 d94f699451d72286357cba7259055ffff2c2940b
fetch adafruit/Adafruit-GFX-Library libraries/Adafruit_GFX 85ce269b270eb1241e36a22cceec2c5e0905f48c
fetch adafruit/Adafruit_BusIO libraries/Adafruit_BusIO 3b8364267c3ee6e16bad91bc2101aefbd5b5915f
fetch wayoda/LedControl libraries/LedControl 2714e8b1ca1a8fcc7f6b6d5e77025cb5eb702c3e
echo "vendor/ listo"
