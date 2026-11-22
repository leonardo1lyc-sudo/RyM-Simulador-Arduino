// Precompila el núcleo y las librerías que usan los ejemplos, para que el primer
// "Simular" en el servidor no tenga que compilarlas (se copia como caché de solo lectura).
import { buildCore, compileSketch } from '../server/build.js';
import { EXAMPLES } from '../web/src/examples.js';

const core = await buildCore();
console.log('núcleo', core.lib);
for (const [name, ex] of Object.entries(EXAMPLES)) {
  const t = Date.now(); const r = await compileSketch({ sketch: ex.code });
  console.log(`${name}: ${r.ok ? 'ok' : 'error'} (${Date.now() - t} ms)`);
}
