#!/usr/bin/env sh
# Descarga el núcleo oficial Arduino AVR y las librerías incluidas, en versiones fijas.
set -eu
cd "$(dirname "$0")/.."
mkdir -p vendor
fetch() { # repo destino commit
  if [ -d "vendor/$2" ] && [ -n "$(ls -A "vendor/$2")" ]; then return; fi
  mkdir -p "vendor/$2"
  curl -sSL --retry 3 "https://codeload.github.com/$1/tar.gz/$3" | tar xz -C "vendor/$2" --strip-components 1
}
fetch arduino/ArduinoCore-avr ArduinoCore-avr 11b9130371e8447920edb65a75706a6c951e51fc
fetch arduino-libraries/Servo Servo 440b319ec11ea2664df8ce201c271c935de28a2d
fetch arduino-libraries/LiquidCrystal LiquidCrystal 42022e0bb7e11829317467bab28ed42af23e0ee5
echo "vendor/ listo"
