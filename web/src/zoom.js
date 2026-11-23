/* Zoom y desplazamiento del lienzo.
   Todo el resto del simulador convierte coordenadas con getScreenCTM(), así que basta con
   mover el viewBox: rueda = zoom hacia el cursor, arrastrar el fondo / botón central /
   barra espaciadora + arrastrar = desplazar, dos dedos = pellizcar. */
export const WORLD = { x0: -1600, y0: -1200, x1: 3000, y1: 2000 }; // zona donde se pueden colocar piezas

export function createZoom(svg, { isBusy = () => false, onChange = () => {} } = {}){
  const MIN = 0.15, MAX = 4;
  let base = { w: 1100, h: 700 }, cx = 550, cy = 350, s = 1, fitScale = 1, ready = false;
  const size = () => { const r = svg.getBoundingClientRect(); return { W: Math.max(r.width, 1), H: Math.max(r.height, 1) }; };
  function apply(){
    const { W, H } = size(), w = W / s, h = H / s;
    svg.setAttribute('viewBox', `${(cx - w / 2).toFixed(2)} ${(cy - h / 2).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
    onChange(api.percent());
  }
  function fitRect(x, y, w, h, pad = 24){
    const { W, H } = size();
    s = Math.min(MAX, Math.max(MIN, Math.min((W - pad * 2) / w, (H - pad * 2) / h)));
    cx = x + w / 2; cy = y + h / 2; apply();
  }
  function contentBox(){
    let b = null;
    for (const id of ['boardLayer', 'compLayer', 'wireLayer']) {
      const g = svg.querySelector('#' + id); if (!g || !g.childElementCount) continue;
      let r; try { r = g.getBBox(); } catch { continue; }
      if (!r.width && !r.height) continue;
      b = b ? { x: Math.min(b.x, r.x), y: Math.min(b.y, r.y), x2: Math.max(b.x2, r.x + r.width), y2: Math.max(b.y2, r.y + r.height) } : { x: r.x, y: r.y, x2: r.x + r.width, y2: r.y + r.height };
    }
    return b ? { x: b.x, y: b.y, w: b.x2 - b.x, h: b.y2 - b.y } : { x: 0, y: 0, w: base.w, h: base.h };
  }
  function zoomAt(f, clientX, clientY){
    const r = svg.getBoundingClientRect();
    const px = clientX === undefined ? r.width / 2 : clientX - r.left, py = clientY === undefined ? r.height / 2 : clientY - r.top;
    const ns = Math.min(MAX, Math.max(MIN, s * f)); if (ns === s) return;
    // el punto bajo el cursor queda fijo
    const wx = cx + (px - r.width / 2) / s, wy = cy + (py - r.height / 2) / s;
    s = ns; cx = wx - (px - r.width / 2) / s; cy = wy - (py - r.height / 2) / s; apply();
  }
  const panBy = (dx, dy) => { cx -= dx / s; cy -= dy / s; apply(); };

  /* Rueda: zoom (también el pellizco del touchpad, que llega con ctrlKey). Shift = desplazar. */
  svg.addEventListener('wheel', e => {
    if (e.defaultPrevented || e.target.closest('[data-ctrl="pot"]')) return;
    e.preventDefault();
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    if (e.shiftKey && !e.ctrlKey) { panBy(-(e.deltaX || e.deltaY) * k, 0); return; }
    zoomAt(Math.exp(-Math.max(-120, Math.min(120, e.deltaY * k)) * (e.ctrlKey ? 0.01 : 0.0011)), e.clientX, e.clientY);
  }, { passive: false });

  /* Desplazar: fondo vacío con el botón izquierdo, cualquier lugar con el central o con espacio. */
  let space = false, pan = null; const touches = new Map(); let pinch = null;
  addEventListener('keydown', e => { if (e.code === 'Space' && !e.target.closest('textarea,input,select,button,.cm-editor')) { space = true; svg.classList.add('pan-ready'); e.preventDefault(); } });
  addEventListener('keyup', e => { if (e.code === 'Space') { space = false; svg.classList.remove('pan-ready'); } });
  const empty = t => !t.closest('[data-term],[data-ctrl],[data-comp],[data-wire]');
  svg.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { // pellizco: anula lo que haya empezado el primer dedo
        const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; pan = null;
        e.stopImmediatePropagation(); e.preventDefault(); return;
      }
    }
    const force = e.button === 1 || space;
    if (force || (e.button === 0 && empty(e.target) && !isBusy())) {
      pan = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
      if (force) { e.stopImmediatePropagation(); e.preventDefault(); svg.setPointerCapture(e.pointerId); svg.classList.add('panning'); }
    }
  }, true);
  svg.addEventListener('pointermove', e => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) {
      const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      panBy(mx - pinch.mx, my - pinch.my); zoomAt(d / pinch.d, mx, my); pinch = { d, mx, my };
      e.stopImmediatePropagation(); return;
    }
    if (!pan || pan.id !== e.pointerId) return;
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (!pan.moved && Math.hypot(dx, dy) < 4) return;
    if (!pan.moved) { pan.moved = true; svg.setPointerCapture(e.pointerId); svg.classList.add('panning'); }
    pan.x = e.clientX; pan.y = e.clientY; panBy(dx, dy);
  }, true);
  const end = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; if (pan && pan.id === e.pointerId) { pan = null; svg.classList.remove('panning'); } };
  svg.addEventListener('pointerup', end, true); svg.addEventListener('pointercancel', end, true);
  svg.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });

  new ResizeObserver(() => { if (ready) apply(); }).observe(svg);

  const api = {
    /** Nueva placa: tamaño de referencia y encuadre del contenido. */
    setBase(w, h){ base = { w, h }; ready = true; requestAnimationFrame(() => api.fit()); fitRect(0, 0, w, h); fitScale = s; },
    fit(){ const b = contentBox(); fitRect(b.x - 20, b.y - 20, b.w + 40, b.h + 40); fitScale = s; },
    zoomIn(){ zoomAt(1.25); }, zoomOut(){ zoomAt(0.8); },
    reset(){ s = 1; apply(); },
    percent: () => Math.round(s * 100),
    /** Rectángulo visible en coordenadas del circuito. */
    visible(){ const { W, H } = size(); return { x: cx - W / s / 2, y: cy - H / s / 2, w: W / s, h: H / s }; },
    get panned(){ return !!(pan && pan.moved); },
  };
  addEventListener('keydown', e => {
    if (e.target.closest('textarea,input,select,.cm-editor') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); api.zoomIn(); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); api.zoomOut(); }
    else if (e.key === '0') { api.fit(); }
  });
  return api;
}
