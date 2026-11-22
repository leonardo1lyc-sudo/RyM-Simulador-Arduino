// Pruebas del compilador: npm test (requiere avr-gcc y vendor/)
import assert from 'node:assert/strict';
import { compileSketch, inoToCpp } from '../server/build.js';

const t = async (name, fn) => { try { await fn(); console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n', e); process.exitCode = 1; } };

await t('prototipos automáticos', () => {
  const cpp = inoToCpp('void setup(){ f(1); }\nvoid loop(){}\nint f(int a){ return a; }');
  assert.match(cpp, /int f\(int a\);/);
});
await t('compila con Servo y LiquidCrystal', async () => {
  const r = await compileSketch({ sketch: '#include <Servo.h>\n#include <LiquidCrystal.h>\nServo s; LiquidCrystal l(12,11,5,4,3,2);\nvoid setup(){ s.attach(9); l.begin(16,2); }\nvoid loop(){}' });
  assert.equal(r.ok, true); assert.match(r.hex, /^:/);
  assert.deepEqual(r.libraries.map(l => l.name).sort(), ['LiquidCrystal', 'Servo']);
});
await t('error con línea y traducción', async () => {
  const r = await compileSketch({ sketch: 'void setup(){\n  int x = 5\n}\nvoid loop(){}' });
  assert.equal(r.ok, false); const d = r.diagnostics.find(d => d.type === 'error');
  assert.equal(d.file, 'sketch.ino'); assert.ok(d.line >= 2 && d.line <= 3); assert.match(d.es, /se esperaba/);
});
await t('librería del usuario', async () => {
  const r = await compileSketch({ sketch: '#include <Hola.h>\nvoid setup(){ hola(); }\nvoid loop(){}',
    libraries: [{ name: 'Hola', files: { 'src/Hola.h': 'void hola();', 'src/Hola.cpp': '#include "Hola.h"\nvoid hola(){}' } }] });
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
});
await t('rechaza includes absolutos', async () => {
  await assert.rejects(compileSketch({ sketch: '#include "/etc/passwd"\nvoid setup(){}\nvoid loop(){}' }), /no permitido/);
});
await t('rechaza rutas con .. en librerías', async () => {
  await assert.rejects(compileSketch({ sketch: 'void setup(){}\nvoid loop(){}', libraries: [{ name: 'X', files: { '../x.h': '' } }] }), /no válida/);
});
await t('rechaza #include con macro', async () => {
  await assert.rejects(compileSketch({ sketch: '#define F "/etc/passwd"\n#include F\nvoid setup(){}\nvoid loop(){}' }), /macros no permitido/);
});
