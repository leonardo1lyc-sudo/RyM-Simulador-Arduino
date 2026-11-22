# Banco Uno: web + compilador de sketches (avr-gcc + ArduinoCore-avr)
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY web ./web
RUN npm run build

FROM node:20-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc-avr avr-libc binutils-avr git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY scripts ./scripts
RUN sh scripts/setup-vendor.sh && rm -rf vendor/*/.git && apt-get purge -y git && apt-get autoremove -y
COPY package.json ./
COPY server ./server
COPY --from=build /app/web ./web
RUN rm -rf web/src && useradd -m banco && mkdir -p /tmp/banco-uno-cache && chown banco /tmp/banco-uno-cache
USER banco
ENV PORT=8080 BANCO_CACHE=/tmp/banco-uno-cache NODE_ENV=production
EXPOSE 8080
HEALTHCHECK CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
