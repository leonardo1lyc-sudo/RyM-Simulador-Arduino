#!/usr/bin/env sh
# Descarga un avr-gcc portátil (sin dependencias del sistema) y lo recorta a lo necesario
# para el ATmega328P. Se usa en Vercel, donde no se puede instalar gcc-avr con apt.
set -eu
cd "$(dirname "$0")/.."
VERSION=14.1.0
URL="https://github.com/ZakKemble/avr-gcc-build/releases/download/v${VERSION}-1/avr-gcc-${VERSION}-x64-linux.tar.bz2"
T=toolchain
if [ -x "$T/bin/avr-gcc" ]; then echo "toolchain/ ya existe"; exit 0; fi
rm -rf "$T" .toolchain-tmp && mkdir -p .toolchain-tmp
if [ -n "${TOOLCHAIN_TARBALL:-}" ]; then cp "$TOOLCHAIN_TARBALL" .toolchain-tmp/gcc.tar.bz2
else curl -sSL --retry 3 -o .toolchain-tmp/gcc.tar.bz2 "$URL"; fi
tar xjf .toolchain-tmp/gcc.tar.bz2 -C .toolchain-tmp
mv .toolchain-tmp/avr-gcc-${VERSION}-x64-linux "$T" && rm -rf .toolchain-tmp
cd "$T"
rm -rf share include README.txt permissions.sh lib/libavr-sim.a lib/libcc1* lib/bfd-plugins
# binarios
for f in bin/*; do case "$(basename "$f")" in avr-gcc|avr-g++|avr-gcc-ar|avr-ar|avr-objcopy|avr-size|avr-as|avr-ld) ;; *) rm -f "$f";; esac; done
for f in avr/bin/*; do case "$(basename "$f")" in as|ld|ar) ;; *) rm -f "$f";; esac; done
L=libexec/gcc/avr/$VERSION
rm -rf "$L/lto1" "$L/install-tools" "$L/plugin"
# multilibs: solo avr5 (ATmega328P)
G=lib/gcc/avr/$VERSION
for d in "$G"/*; do case "$(basename "$d")" in avr5|include|include-fixed|device-specs) ;; *) rm -rf "$d";; esac; done
find "$G/device-specs" -type f ! -name 'specs-atmega328p' ! -name 'specs-avr2' -delete
for d in avr/lib/*; do case "$(basename "$d")" in avr5|ldscripts) ;; *) rm -rf "$d";; esac; done
find avr/lib/avr5 -maxdepth 1 -type f \( -name 'crt*.o' -o -name 'lib*.a' \) ! -name 'crtatmega328p.o' ! -name 'libatmega328p.a' ! -name 'libc.a' ! -name 'libm.a' ! -name 'libprintf_*' ! -name 'libscanf_*' ! -name 'libgcc*' -delete
# cabeceras de E/S de otros microcontroladores
find avr/include/avr -maxdepth 1 -name 'io?*.h' ! -name 'iom328p.h' ! -name 'iomx8.h' ! -name 'iomxx8.h' ! -name 'io.h' -delete
cd ..
du -sh "$T"
