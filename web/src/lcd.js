// Controlador HD44780 (LCD de caracteres) y adaptador I2C PCF8574.
export class HD44780 {
  constructor(cols = 16, rows = 2){
    this.cols = cols; this.rows = rows;
    this.reset();
  }
  reset(){
    this.ddram = new Uint8Array(128).fill(0x20);
    this.cgram = new Uint8Array(64);
    this.ac = 0; this.inc = 1; this.shiftOnWrite = false; this.scroll = 0;
    this.displayOn = false; this.cursor = false; this.blink = false;
    this.eightBit = true; this.twoLines = false; this.nibble = null; this.target = 'dd';
    this.version = 0;
  }
  // E bajó con un bus de 4 bits (solo D4..D7 conectados)
  pulse4(rs, nibble){
    if (this.eightBit) { this.write(rs, (nibble & 0xF) << 4); return; }
    if (this.nibble === null) this.nibble = nibble & 0xF;
    else { const v = (this.nibble << 4) | (nibble & 0xF); this.nibble = null; this.write(rs, v); }
  }
  pulse8(rs, byte){ this.write(rs, byte & 0xFF); }
  write(rs, v){ if (rs) this.data(v); else this.command(v); this.version++; }
  command(c){
    if (c & 0x80) { this.target = 'dd'; this.ac = c & 0x7F; }
    else if (c & 0x40) { this.target = 'cg'; this.ac = c & 0x3F; }
    else if (c & 0x20) { this.eightBit = !!(c & 0x10); this.twoLines = !!(c & 0x08); this.nibble = null; }
    else if (c & 0x10) { const right = !!(c & 0x04); if (c & 0x08) this.scroll += right ? -1 : 1; else this.moveAc(right ? 1 : -1); }
    else if (c & 0x08) { this.displayOn = !!(c & 4); this.cursor = !!(c & 2); this.blink = !!(c & 1); }
    else if (c & 0x04) { this.inc = (c & 2) ? 1 : -1; this.shiftOnWrite = !!(c & 1); }
    else if (c & 0x02) { this.ac = 0; this.scroll = 0; this.target = 'dd'; }
    else if (c & 0x01) { this.ddram.fill(0x20); this.ac = 0; this.scroll = 0; this.inc = 1; this.target = 'dd'; }
  }
  moveAc(d){
    if (this.target === 'cg') { this.ac = (this.ac + d) & 0x3F; return; }
    let a = this.ac + d;
    if (this.twoLines) { if (a === 0x28) a = 0x40; else if (a === 0x68) a = 0x00; else if (a === 0x3F) a = 0x27; else if (a === -1) a = 0x67; }
    this.ac = a & 0x7F;
  }
  data(v){
    if (this.target === 'cg') { this.cgram[this.ac & 0x3F] = v; this.moveAc(this.inc); return; }
    this.ddram[this.ac] = v; this.moveAc(this.inc);
    if (this.shiftOnWrite) this.scroll += this.inc;
  }
  // Código del carácter visible en (col, fila)
  charAt(col, row){
    const base = row === 0 ? 0x00 : row === 1 ? 0x40 : row === 2 ? 0x14 : 0x54;
    const span = this.twoLines || this.rows > 1 ? 40 : 80;
    const off = ((col + this.scroll) % span + span) % span;
    return this.ddram[(base + off) & 0x7F];
  }
  cursorPos(){
    if (this.target !== 'dd') return null;
    const row = this.ac >= 0x40 ? 1 : 0; const col = ((this.ac & 0x3F) - this.scroll + 40) % 40;
    return col < this.cols ? { col, row } : null;
  }
}

// Mochila I2C PCF8574: P0=RS P1=RW P2=E P3=luz P4..P7=D4..D7
export class PCF8574Lcd {
  constructor(lcd, address = 0x27){ this.lcd = lcd; this.address = address; this.out = 0xFF; this.backlight = true; }
  write(v){
    const prevE = this.out & 0x04; this.out = v;
    this.backlight = !!(v & 0x08);
    if (prevE && !(v & 0x04) && !(v & 0x02)) this.lcd.pulse4(v & 0x01, v >> 4);
    this.lcd.version++;
  }
  read(){ return this.out; }
}

// Bus I2C que reparte los eventos del TWI del ATmega328P entre los dispositivos conectados.
export class I2CBus {
  constructor(twi){
    this.twi = twi; this.devices = []; this.current = null; this.writing = true;
    twi.eventHandler = this;
  }
  start(){ this.twi.completeStart(); }
  stop(){ this.current = null; this.twi.completeStop(); }
  connectToSlave(addr, write){
    this.current = this.devices.find(d => d.address === addr && d.ready()) || null;
    this.writing = write;
    this.twi.completeConnect(!!this.current);
  }
  writeByte(v){ if (this.current) this.current.write(v); this.twi.completeWrite(!!this.current); }
  readByte(){ this.twi.completeRead(this.current ? this.current.read() : 0xFF); }
}
