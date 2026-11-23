#!/usr/bin/env sh
# avr-gcc portátil para entornos sin apt (Vercel). Se recorta a lo necesario para el ATmega328P (Uno, Nano) y el ATmega2560 (Mega).
# Primero intenta el toolchain oficial de Arduino (avr-gcc 7.3, el mismo del IDE, compatible con glibc
# antiguas como la de Vercel); si no se puede descargar, usa avr-gcc 14.1 de ZakKemble (glibc >= 2.36).
set -eu
cd "$(dirname "$0")/.."
T=toolchain
if [ -x "$T/bin/avr-gcc" ]; then echo "toolchain/ ya existe"; exit 0; fi
rm -rf "$T" .toolchain-tmp && mkdir -p .toolchain-tmp
ARDUINO_URL="https://downloads.arduino.cc/tools/avr-gcc-7.3.0-atmel3.6.1-arduino7-x86_64-pc-linux-gnu.tar.bz2"
ZAK_URL="https://github.com/ZakKemble/avr-gcc-build/releases/download/v14.1.0-1/avr-gcc-14.1.0-x64-linux.tar.bz2"
if [ -n "${TOOLCHAIN_TARBALL:-}" ]; then cp "$TOOLCHAIN_TARBALL" .toolchain-tmp/gcc.tar.bz2
elif [ "${TOOLCHAIN:-arduino}" = arduino ] && curl -fsSL --retry 3 -o .toolchain-tmp/gcc.tar.bz2 "$ARDUINO_URL"; then echo "toolchain oficial de Arduino"
else curl -fsSL --retry 3 -o .toolchain-tmp/gcc.tar.bz2 "$ZAK_URL"; echo "toolchain ZakKemble"; fi
tar xjf .toolchain-tmp/gcc.tar.bz2 -C .toolchain-tmp
mv .toolchain-tmp/*/ "$T" && rm -rf .toolchain-tmp
VERSION=$(ls "$T/lib/gcc/avr")
echo "avr-gcc $VERSION"
cd "$T"
rm -rf share include README.txt permissions.sh lib/libavr-sim.a lib/libcc1* lib/bfd-plugins
# binarios
for f in bin/*; do case "$(basename "$f")" in avr-gcc|avr-g++|avr-gcc-ar|avr-ar|avr-objcopy|avr-size|avr-as|avr-ld) ;; *) rm -f "$f";; esac; done
for f in avr/bin/*; do case "$(basename "$f")" in as|ld|ar) ;; *) rm -f "$f";; esac; done
L=libexec/gcc/avr/$VERSION
rm -rf "$L/lto1" "$L/install-tools" "$L/plugin"
# multilibs: avr5 (ATmega328P) y avr6 (ATmega2560)
G=lib/gcc/avr/$VERSION
for d in "$G"/*; do case "$(basename "$d")" in avr5|avr6|include|include-fixed|device-specs) ;; *) rm -rf "$d";; esac; done
find "$G/device-specs" -type f ! -name 'specs-atmega328p' ! -name 'specs-atmega2560' ! -name 'specs-avr2' -delete
for d in avr/lib/*; do case "$(basename "$d")" in avr5|avr6|ldscripts) ;; *) rm -rf "$d";; esac; done
find avr/lib/avr5 avr/lib/avr6 -maxdepth 1 -type f \( -name 'crt*.o' -o -name 'lib*.a' \) ! -name 'crtatmega328p.o' ! -name 'libatmega328p.a' ! -name 'crtatmega2560.o' ! -name 'libatmega2560.a' ! -name 'libc.a' ! -name 'libm.a' ! -name 'libprintf_*' ! -name 'libscanf_*' ! -name 'libgcc*' -delete
# cabeceras de E/S de otros microcontroladores
find avr/include/avr -maxdepth 1 -name 'io?*.h' ! -name 'iom328p.h' ! -name 'iomx8.h' ! -name 'iomxx8.h' ! -name 'iom2560.h' ! -name 'iomxx0_1.h' ! -name 'io.h' -delete
cd ..
du -sh "$T"
