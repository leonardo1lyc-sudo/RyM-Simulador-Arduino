import { load, send, fail } from './_runtime.js';

// GET /api/health → {ok:true}. Con ?prueba=1 compila un sketch de ejemplo para verificar el compilador
// (&placa=nano|mega para probar otra placa).
export default async function handler(req, res){
  if (!/[?&]prueba=1/.test(req.url || '')) return send(res, 200, { ok: true });
  let b;
  try {
    b = await load();
    const t0 = Date.now();
    const placa = (/[?&]placa=(\w+)/.exec(req.url) || [])[1] || 'uno';
    const r = await b.compileSketch({ board: placa, sketch: '#include <Servo.h>\nServo s;\nvoid setup(){ s.attach(9); Serial.begin(9600); }\nvoid loop(){ s.write(analogRead(A0) / 6); Serial.println(millis()); }\n' });
    send(res, 200, { ok: r.ok, board: placa, ms: Date.now() - t0, size: r.size, libraries: r.libraries, diagnostics: r.diagnostics });
  } catch (e) { fail(res, e, b && b.BuildError); }
}
