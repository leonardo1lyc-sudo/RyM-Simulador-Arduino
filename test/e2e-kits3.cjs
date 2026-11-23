// Prueba de la tanda 3c (DS1302, 28BYJ-48 + ULN2003, RC522, DS18B20): node test/e2e-kits3.cjs [url]
const { chromium } = require('playwright');
const path = require('path');
const URL = process.argv[2] || 'http://localhost:8080/';
const OUT = process.env.SHOTS || '.';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL); await p.evaluate(() => localStorage.clear());
  const waitRun = async () => { await p.waitForFunction(() => document.querySelector('#status').textContent === 'Simulando' || /Error/.test(document.querySelector('#status').textContent), null, { timeout: 90000 }); };
  const status = () => p.evaluate(() => document.querySelector('#status').textContent + ' ' + document.querySelector('#err').textContent);
  const load = async st => { await p.evaluate(s => __banco.applyState(s), st); await waitRun(); const s = await status(); if (!/Simulando/.test(s)) console.log('  compilación:', s.slice(0, 600)); };
  const ex = name => p.evaluate(n => __banco.exampleState(n), name).then(load);
  const exCode = (name, code) => p.evaluate(([n, c]) => { const s = __banco.exampleState(n); s.code = c; return s; }, [name, code]).then(load);
  const serial = () => p.evaluate(() => document.querySelector('#serialOut').textContent);
  const lines = async () => (await serial()).split('\n').map(l => l.trim()).filter(Boolean);
  const shot = n => p.screenshot({ path: path.join(OUT, n + '.png') });
  let ok = true; const check = (c, msg) => { console.log((c ? 'OK   ' : 'FAIL ') + msg); if (!c) ok = false; };
  const comp = t => `__banco.state.comps.find(c => c.type === '${t}')`;

  // DS1302: el ejemplo lee la hora cada segundo y avanza
  await ex('reloj'); await p.waitForTimeout(3300);
  let L = (await lines()).filter(l => /^\d\d\/\d\d\/\d{4} \d\d:\d\d:\d\d$/.test(l));
  const secs = L.map(l => { const [, h, m, s] = /(\d\d):(\d\d):(\d\d)$/.exec(l); return +h * 3600 + +m * 60 + +s; });
  check(L.length >= 2 && secs.slice(1).every((v, i) => v - secs[i] === 1), 'DS1302 cuenta los segundos: ' + JSON.stringify(L.slice(-3)));
  await shot('k3-reloj');
  await exCode('reloj', `#include <ThreeWire.h>\n#include <RtcDS1302.h>\nThreeWire w(4, 5, 2); RtcDS1302<ThreeWire> r(w);\nvoid setup(){ Serial.begin(9600); r.Begin(); r.SetIsWriteProtected(false); r.SetIsRunning(true); r.SetDateTime(RtcDateTime(2030, 12, 31, 23, 59, 58)); r.SetMemory((uint8_t)3, (uint8_t)77); }\nvoid loop(){ RtcDateTime t = r.GetDateTime(); char s[40]; snprintf(s, sizeof(s), "%u-%u-%u %u:%u:%u ram=%u", t.Year(), t.Month(), t.Day(), t.Hour(), t.Minute(), t.Second(), r.GetMemory(3)); Serial.println(s); delay(1000); }\n`);
  await p.waitForTimeout(3300); L = await lines();
  check(L.includes('2030-12-31 23:59:58 ram=77') && L.includes('2031-1-1 0:0:0 ram=77'), 'DS1302 SetDateTime (burst), cambio de año y RAM: ' + JSON.stringify(L.slice(-3)));

  // 28BYJ-48: un cuarto de vuelta a cada lado
  await ex('pasoapaso'); await p.waitForTimeout(400);
  let mx = 0; for (let i = 0; i < 16; i++) { const st = await p.evaluate(`(${comp('stepper')})._steps || 0`); mx = Math.max(mx, st); await p.waitForTimeout(150); }
  check(Math.abs(mx - 512) <= 2, 'Stepper llega a 512 pasos (90°): ' + mx.toFixed(1));
  await shot('k3-motor');
  await p.waitForTimeout(2600); const back = await p.evaluate(`(${comp('stepper')})._steps || 0`);
  check(Math.abs(back) <= 2 || Math.abs(back - 512) <= 2 || (back > 0 && back < 512), 'Stepper vuelve en sentido contrario: ' + back.toFixed(1));
  await exCode('pasoapaso', `#include <Stepper.h>\nStepper m(2048, 8, 10, 9, 11);\nvoid setup(){ m.setSpeed(60); m.step(200); }\nvoid loop(){}\n`);
  await p.waitForTimeout(1500);
  const stall = await p.evaluate(`[(${comp('stepper')})._steps || 0, document.querySelector('#warnings').textContent]`);
  check(Math.abs(stall[0]) < 10 && /demasiado rápido/.test(stall[1]), 'Stepper a 60 rpm se traba y avisa: ' + stall[0]);

  // RC522: lee el UID de la tarjeta y del llavero
  await ex('rfid'); await p.waitForTimeout(800);
  check(!/UID/.test(await serial()), 'RC522 sin tarjeta: no lee nada');
  await p.evaluate(`(c => { c.props.near = true; __banco.refresh(); })(${comp('rc522')})`); await p.waitForTimeout(800);
  let s = await serial();
  check(/UID: 93 3A 7C 1D  -> acceso permitido/.test(s) && await p.evaluate(() => __banco.io.pins[13].val), 'RC522 lee la tarjeta: ' + JSON.stringify((await lines()).slice(-1)));
  await shot('k3-rfid');
  await p.evaluate(`(c => { c.props.near = false; __banco.refresh(); })(${comp('rc522')})`); await p.waitForTimeout(300);
  await p.evaluate(`(c => { c.props.card = 'llavero'; c.props.near = true; __banco.refresh(); })(${comp('rc522')})`); await p.waitForTimeout(800);
  s = await serial(); check(/UID: 5A 21 B4 0C  -> acceso denegado/.test(s), 'RC522 lee el llavero: ' + JSON.stringify((await lines()).slice(-1)));
  // lectura y escritura de un bloque con autenticación
  await exCode('rfid', `#include <SPI.h>\n#include <MFRC522.h>\nMFRC522 m(10, 9); MFRC522::MIFARE_Key k;\nvoid setup(){ Serial.begin(9600); SPI.begin(); m.PCD_Init(); for (byte i = 0; i < 6; i++) k.keyByte[i] = 0xFF; Serial.print("ver="); Serial.println(m.PCD_ReadRegister(MFRC522::VersionReg), HEX); }\nvoid loop(){ if (!m.PICC_IsNewCardPresent() || !m.PICC_ReadCardSerial()) return; byte d[16] = "Hola RFID 12345"; byte buf[18], n = 18;\n Serial.print("auth="); Serial.println(m.PCD_Authenticate(MFRC522::PICC_CMD_MF_AUTH_KEY_A, 4, &k, &m.uid));\n Serial.print("w="); Serial.println(m.MIFARE_Write(4, d, 16)); Serial.print("r="); Serial.println(m.MIFARE_Read(4, buf, &n)); buf[15] = 0; Serial.println((char*)buf); m.PICC_HaltA(); m.PCD_StopCrypto1(); }\n`);
  await p.evaluate(`(c => { c.props.card = 'tarjeta'; c.props.near = true; __banco.refresh(); })(${comp('rc522')})`); await p.waitForTimeout(1000);
  s = await serial(); check(/ver=92/.test(s) && /auth=0/.test(s) && /w=0/.test(s) && /r=0/.test(s) && /Hola RFID 12345/.test(s), 'RC522 autentica, escribe y lee el bloque 4: ' + JSON.stringify((await lines()).slice(-5)));

  // DS18B20: OneWire + DallasTemperature
  const waitSerial = (re, ms = 8000) => p.waitForFunction(r => new RegExp(r).test(document.querySelector('#serialOut').textContent), re, { timeout: ms }).catch(() => {});
  await ex('temperatura'); await waitSerial('Temperatura: .* C');
  s = await serial(); L = await lines();
  check(/Sensores encontrados: 1/.test(s) && /Temperatura: 23\.50 C/.test(s), 'DS18B20 encontrado y lee 23,5 °C: ' + JSON.stringify(L.slice(-2)));
  await p.evaluate(`(c => { c.props.temp = -10.25; __banco.refresh(); })(${comp('ds18b20')})`); await waitSerial('-10\\.25 C');
  s = await serial(); check(/Temperatura: -10\.25 C/.test(s), 'DS18B20 a -10,25 °C: ' + JSON.stringify((await lines()).slice(-1)));
  await shot('k3-temp');
  // sin resistencia de 4,7 kΩ no responde
  await p.evaluate(() => { const s = __banco.exampleState('temperatura'); s.comps.pop(); s.wires = s.wires.filter(w => !w.a.startsWith('C2')); return __banco.applyState(s); }); await waitRun(); await waitSerial('Temperatura: .* C');
  L = await lines(); check(L.some(l => /Sensores encontrados: 0/.test(l)) || L.some(l => /-127/.test(l)), 'DS18B20 sin resistencia de 4,7 kΩ no responde: ' + JSON.stringify(L.slice(-2)));

  console.log('errores de página:', errs);
  await b.close(); process.exit(ok && !errs.length ? 0 : 1);
})();
