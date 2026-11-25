// Tarjeta microSD simulada: imagen FAT16 dispersa (solo se guardan los bloques usados) con
// tabla de particiones, como una tarjeta recién formateada. La usan el módulo microSD (SD.h)
// y el panel de archivos para ver, subir y bajar archivos.
const SECT = 512;
const TOTAL = 131072;  // 64 MiB
const PSTART = 2048;   // inicio de la partición (como las tarjetas reales)
const SPC = 4, RSV = 4, NF = 2, ROOTENT = 512, ROOTSECS = ROOTENT * 32 / SECT;

export class Fat16 {
  constructor(){
    this.blocks = new Map(); this.version = 0;
    const part = TOTAL - PSTART; let fsz = 128;
    for (let i = 0; i < 4; i++) { const cl = Math.floor((part - RSV - NF * fsz - ROOTSECS) / SPC); fsz = Math.ceil((cl + 2) * 2 / SECT); }
    this.fatSz = fsz; this.fat0 = PSTART + RSV; this.root = this.fat0 + NF * fsz; this.data = this.root + ROOTSECS;
    this.clusters = Math.floor((TOTAL - this.data) / SPC);
    this.format();
  }
  get totalBlocks(){ return TOTAL; }
  read(lba){ return this.blocks.get(lba) || new Uint8Array(SECT); }
  write(lba, data){
    if (lba < 0 || lba >= TOTAL) return;
    const b = Uint8Array.from(data.slice(0, SECT)); if (b.length < SECT) return;
    if (b.every(v => v === 0)) this.blocks.delete(lba); else this.blocks.set(lba, b);
    this.version++;
  }
  format(){
    this.blocks.clear();
    const mbr = new Uint8Array(SECT), v = new DataView(mbr.buffer);
    const e = 446; mbr[e] = 0x00; mbr[e + 1] = 0x20; mbr[e + 2] = 0x21; mbr[e + 4] = 0x06; mbr[e + 5] = 0xFE; mbr[e + 6] = 0xFF; mbr[e + 7] = 0xFF;
    v.setUint32(e + 8, PSTART, true); v.setUint32(e + 12, TOTAL - PSTART, true); mbr[510] = 0x55; mbr[511] = 0xAA;
    this.write(0, mbr);
    const b = new Uint8Array(SECT), d = new DataView(b.buffer);
    b.set([0xEB, 0x3C, 0x90]); b.set([...'MSDOS5.0'].map(c => c.charCodeAt(0)), 3);
    d.setUint16(11, SECT, true); b[13] = SPC; d.setUint16(14, RSV, true); b[16] = NF; d.setUint16(17, ROOTENT, true);
    d.setUint16(19, 0, true); b[21] = 0xF8; d.setUint16(22, this.fatSz, true); d.setUint16(24, 63, true); d.setUint16(26, 255, true);
    d.setUint32(28, PSTART, true); d.setUint32(32, TOTAL - PSTART, true); b[36] = 0x80; b[38] = 0x29; d.setUint32(39, 0x52594D53, true);
    b.set([...'RYM SIMU   '].map(c => c.charCodeAt(0)), 43); b.set([...'FAT16   '].map(c => c.charCodeAt(0)), 54); b[510] = 0x55; b[511] = 0xAA;
    this.write(PSTART, b);
    this.setFat(0, 0xFFF8); this.setFat(1, 0xFFFF);
    const r = new Uint8Array(SECT); r.set([...'RYM SIMU   '].map(c => c.charCodeAt(0)), 0); r[11] = 0x08; this.write(this.root, r);
  }
  getFat(n){ const off = n * 2, blk = this.read(this.fat0 + Math.floor(off / SECT)); return blk[off % SECT] | blk[off % SECT + 1] << 8; }
  setFat(n, val){
    const off = n * 2;
    for (let f = 0; f < NF; f++) { const lba = this.fat0 + f * this.fatSz + Math.floor(off / SECT); const blk = Uint8Array.from(this.read(lba)); blk[off % SECT] = val & 255; blk[off % SECT + 1] = val >> 8; this.write(lba, blk); }
  }
  clusterLba(n){ return this.data + (n - 2) * SPC; }
  chain(first){ const out = []; let n = first; const seen = new Set(); while (n >= 2 && n < 0xFFF8 && !seen.has(n) && out.length < 70000) { seen.add(n); out.push(n); n = this.getFat(n); } return out; }
  // Sectores del directorio (raíz: zona fija; subdirectorio: su cadena de clusters)
  dirSectors(cluster){
    if (!cluster) return Array.from({ length: ROOTSECS }, (_, i) => this.root + i);
    const s = []; for (const n of this.chain(cluster)) for (let i = 0; i < SPC; i++) s.push(this.clusterLba(n) + i); return s;
  }
  list(cluster = 0, prefix = '', depth = 0){
    const out = [];
    for (const lba of this.dirSectors(cluster)) {
      const blk = this.read(lba);
      for (let o = 0; o < SECT; o += 32) {
        const first = blk[o]; if (first === 0) return out;
        const attr = blk[o + 11]; if (first === 0xE5 || attr === 0x0F || (attr & 0x08)) continue;
        const raw = String.fromCharCode(...blk.slice(o, o + 8)).trimEnd(), ext = String.fromCharCode(...blk.slice(o + 8, o + 11)).trimEnd();
        if (raw === '.' || raw === '..') continue;
        const name = raw + (ext ? '.' + ext : ''), cl = blk[o + 26] | blk[o + 27] << 8, size = new DataView(blk.buffer, blk.byteOffset).getUint32(o + 28, true);
        const ent = { name, path: prefix + name, dir: !!(attr & 0x10), cluster: cl, size, lba, off: o };
        out.push(ent);
        if (ent.dir && depth < 4) out.push(...this.list(cl, ent.path + '/', depth + 1));
      }
    }
    return out;
  }
  readFile(ent){
    const out = new Uint8Array(ent.size); let pos = 0;
    for (const n of this.chain(ent.cluster)) for (let i = 0; i < SPC && pos < ent.size; i++) { const b = this.read(this.clusterLba(n) + i); const k = Math.min(SECT, ent.size - pos); out.set(b.subarray(0, k), pos); pos += k; }
    return out;
  }
  remove(ent){
    for (const n of this.chain(ent.cluster)) this.setFat(n, 0);
    const blk = Uint8Array.from(this.read(ent.lba)); blk[ent.off] = 0xE5; this.write(ent.lba, blk);
  }
  static name83(name){
    const clean = s => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9_\-~!#$%&'()@^`{}]/g, '_');
    const dot = name.lastIndexOf('.'); let base = clean(dot > 0 ? name.slice(0, dot) : name), ext = clean(dot > 0 ? name.slice(dot + 1) : '').slice(0, 3);
    if (base.length > 8) base = base.slice(0, 6) + '~1';
    return { base: base || '_', ext };
  }
  // Escribe un archivo en la raíz (reemplaza si ya existe). Devuelve el nombre 8.3 que quedó.
  addFile(name, data){
    const { base, ext } = Fat16.name83(name), full = base + (ext ? '.' + ext : '');
    const old = this.list().find(e => !e.dir && e.path === full); if (old) this.remove(old);
    const need = Math.ceil(data.length / (SPC * SECT)); const cls = [];
    for (let n = 2; n < this.clusters + 2 && cls.length < need; n++) if (this.getFat(n) === 0) cls.push(n);
    if (cls.length < need) throw new Error('La tarjeta está llena.');
    cls.forEach((n, i) => this.setFat(n, i + 1 < cls.length ? cls[i + 1] : 0xFFFF));
    let pos = 0;
    for (const n of cls) for (let i = 0; i < SPC; i++) { const b = new Uint8Array(SECT); b.set(data.subarray(pos, pos + SECT)); this.write(this.clusterLba(n) + i, b); pos += SECT; }
    for (const lba of this.dirSectors(0)) {
      const blk = Uint8Array.from(this.read(lba));
      for (let o = 0; o < SECT; o += 32) {
        if (blk[o] !== 0 && blk[o] !== 0xE5) continue;
        const ent = new Uint8Array(32); ent.set([...base.padEnd(8)].map(c => c.charCodeAt(0)), 0); ent.set([...ext.padEnd(3)].map(c => c.charCodeAt(0)), 8);
        ent[11] = 0x20; const dv = new DataView(ent.buffer); const now = new Date();
        const t = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), dt = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
        dv.setUint16(14, t, true); dv.setUint16(16, dt, true); dv.setUint16(18, dt, true); dv.setUint16(22, t, true); dv.setUint16(24, dt, true);
        dv.setUint16(26, cls[0] || 0, true); dv.setUint32(28, data.length, true);
        blk.set(ent, o); this.write(lba, blk); return full;
      }
    }
    throw new Error('El directorio raíz está lleno.');
  }
  usedBytes(){ return this.list().filter(e => !e.dir).reduce((a, e) => a + e.size, 0); }
}
