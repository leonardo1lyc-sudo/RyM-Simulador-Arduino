#!/usr/bin/env sh
# Construcción en Vercel: núcleo y librerías, avr-gcc portátil, núcleo precompilado y la web.
set -eu
cd "$(dirname "$0")/.."
sh scripts/setup-vendor.sh
rm -rf vendor/*/.git
sh scripts/setup-toolchain.sh
rm -rf .vercel-cache
AVR_BIN="$PWD/toolchain/bin" BANCO_CACHE="$PWD/.vercel-cache" node -e "import('./server/build.js').then(b => b.buildCore()).then(c => console.log('núcleo precompilado', c.lib))"
npm run build
