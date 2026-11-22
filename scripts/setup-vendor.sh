#!/usr/bin/env sh
# Descarga el núcleo oficial Arduino AVR y las librerías incluidas, en versiones fijas.
set -eu
cd "$(dirname "$0")/.."
mkdir -p vendor
fetch() { # repo destino commit
  if [ -d "vendor/$2/.git" ]; then return; fi
  git init -q "vendor/$2"
  git -C "vendor/$2" fetch -q --depth 1 "https://github.com/$1.git" "$3"
  git -C "vendor/$2" checkout -q FETCH_HEAD
}
fetch arduino/ArduinoCore-avr ArduinoCore-avr 11b9130371e8447920edb65a75706a6c951e51fc
fetch arduino-libraries/Servo Servo 440b319ec11ea2664df8ce201c271c935de28a2d
fetch arduino-libraries/LiquidCrystal LiquidCrystal 42022e0bb7e11829317467bab28ed42af23e0ee5
echo "vendor/ listo"
