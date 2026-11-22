// Emulación del ATmega328P (Arduino Uno) con avr8js.
import {
  CPU, avrInstruction, AVRIOPort, portBConfig, portCConfig, portDConfig, PinState,
  AVRTimer, timer0Config, timer1Config, timer2Config, AVRUSART, usart0Config,
  AVRADC, adcConfig, AVRTWI, twiConfig, AVRSPI, spiConfig, AVREEPROM, EEPROMMemoryBackend, eepromConfig, AVRClock, clockConfig,
} from 'avr8js';

export const FREQ = 16e6;
export { PinState };

export function loadHex(source, target){
  for (const line of source.split('\n')) {
    if (line[0] !== ':' || line.substr(7, 2) !== '00') continue;
    const bytes = parseInt(line.substr(1, 2), 16);
    const addr = parseInt(line.substr(3, 4), 16);
    for (let i = 0; i < bytes; i++) target[addr + i] = parseInt(line.substr(9 + i * 2, 2), 16);
  }
}

// Pin Arduino -> [puerto, bit]
const PIN_MAP = [];
for (let p = 0; p < 8; p++) PIN_MAP[p] = ['D', p];
for (let p = 8; p < 14; p++) PIN_MAP[p] = ['B', p - 8];
for (let p = 14; p < 20; p++) PIN_MAP[p] = ['C', p - 14];

export class Uno {
  constructor(hex){
    this.program = new Uint16Array(0x8000 / 2);
    loadHex(hex, new Uint8Array(this.program.buffer));
    this.cpu = new CPU(this.program);
    this.timers = [new AVRTimer(this.cpu, timer0Config), new AVRTimer(this.cpu, timer1Config), new AVRTimer(this.cpu, timer2Config)];
    this.ports = { B: new AVRIOPort(this.cpu, portBConfig), C: new AVRIOPort(this.cpu, portCConfig), D: new AVRIOPort(this.cpu, portDConfig) };
    this.usart = new AVRUSART(this.cpu, usart0Config, FREQ);
    this.adc = new AVRADC(this.cpu, adcConfig);
    this.twi = new AVRTWI(this.cpu, twiConfig, FREQ);
    this.spi = new AVRSPI(this.cpu, spiConfig, FREQ);
    this.eeprom = new AVREEPROM(this.cpu, new EEPROMMemoryBackend(1024));
    this.clock = new AVRClock(this.cpu, FREQ, clockConfig);
    this.state = new Array(20).fill(PinState.Input);
    this.pinListeners = [];
    this.rxQueue = [];
    for (const [name, port] of Object.entries(this.ports)) {
      port.addListener(() => this.portChanged(name));
    }
    this.usart.onByteTransmit = b => this.onSerial && this.onSerial(b);
    this.usart.onRxComplete = () => this.feedRx();
    this.stopAt = Infinity;
    this.events = []; // eventos programados por los dispositivos, ordenados por ciclo
    this.spi.onByte = v => { const r = this.onSpi ? this.onSpi(v) : 0xFF; this.cpu.addClockEvent(() => this.spi.completeTransfer(r & 0xFF), this.spi.transferCycles); };
  }
  schedule(at, fn){
    const e = { at: Math.max(at, this.cpu.cycles), fn }; const ev = this.events;
    let i = ev.length; while (i > 0 && ev[i - 1].at > e.at) i--; ev.splice(i, 0, e);
    if (e.at < this.stopAt) this.stopAt = Math.max(e.at, this.cpu.cycles + 1); // acorta el bloque en curso
  }
  get cycles(){ return this.cpu.cycles; }
  pinState(p){ const [n, b] = PIN_MAP[p]; return this.ports[n].pinState(b); }
  setInput(p, high){ const [n, b] = PIN_MAP[p]; this.ports[n].setPin(b, !!high); }
  setAnalog(p, volts){ if (p >= 14 && p < 20) this.adc.channelValues[p - 14] = volts; }
  portChanged(name){
    const base = name === 'D' ? 0 : name === 'B' ? 8 : 14;
    const count = name === 'B' || name === 'C' ? 6 : 8;
    for (let i = 0; i < count; i++) {
      const p = base + i; const s = this.ports[name].pinState(i);
      if (s !== this.state[p]) { const old = this.state[p]; this.state[p] = s; for (const l of this.pinListeners) l(p, s, old, this.cpu.cycles); }
    }
  }
  serialWrite(bytes){ this.rxQueue.push(...bytes); this.feedRx(); }
  feedRx(){ if (this.rxQueue.length && !this.usart.rxBusy) { if (this.usart.writeByte(this.rxQueue[0])) this.rxQueue.shift(); } }
  // Ejecuta hasta el ciclo indicado; `hook` se llama cada `slice` ciclos para actualizar entradas.
  runUntil(target, slice, hook){
    const cpu = this.cpu;
    const ev = this.events;
    while (cpu.cycles < target) {
      let stop = Math.min(target, cpu.cycles + slice);
      if (ev.length && ev[0].at < stop) stop = Math.max(ev[0].at, cpu.cycles + 1);
      this.stopAt = stop;
      while (cpu.cycles < this.stopAt) { avrInstruction(cpu); cpu.tick(); }
      this.stopAt = Infinity;
      while (ev.length && ev[0].at <= cpu.cycles) ev.shift().fn(cpu.cycles);
      if (hook) hook(cpu.cycles);
      if (this.rxQueue.length) this.feedRx();
    }
  }
}
