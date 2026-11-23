// Emulación de las placas AVR con avr8js: ATmega328P (Uno, Nano) y ATmega2560 (Mega).
import {
  CPU, avrInstruction, AVRIOPort, PinState,
  portAConfig, portBConfig, portCConfig, portDConfig, portEConfig, portFConfig, portGConfig, portHConfig, portJConfig, portKConfig, portLConfig,
  AVRTimer, timer0Config, timer1Config, timer2Config, AVRUSART, usart0Config,
  AVRADC, adcConfig, ADCMuxInputType, ADCReference, AVRTWI, twiConfig, AVRSPI, spiConfig, AVREEPROM, EEPROMMemoryBackend, eepromConfig, AVRClock, clockConfig,
} from 'avr8js';

export const FREQ = 16e6;
export { PinState };

export function loadHex(source, target){
  let base = 0; // registros de dirección extendida (tipo 02 y 04) para programas de más de 64 KB
  for (const line of source.split('\n')) {
    if (line[0] !== ':') continue;
    const type = line.substr(7, 2);
    if (type === '02') { base = parseInt(line.substr(9, 4), 16) << 4; continue; }
    if (type === '04') { base = parseInt(line.substr(9, 4), 16) << 16; continue; }
    if (type !== '00') continue;
    const bytes = parseInt(line.substr(1, 2), 16);
    const addr = base + parseInt(line.substr(3, 4), 16);
    for (let i = 0; i < bytes; i++) if (addr + i < target.length) target[addr + i] = parseInt(line.substr(9 + i * 2, 2), 16);
  }
}

/* ---------- ATmega2560: periféricos con sus direcciones y vectores propios ---------- */
const PORTS_2560 = { A: portAConfig, B: portBConfig, C: portCConfig, D: portDConfig, E: portEConfig, F: portFConfig, G: portGConfig, H: portHConfig, J: portJConfig, K: portKConfig, L: portLConfig };
const extInt = (index, interrupt) => ({ EICR: index < 4 ? 0x69 : 0x6a, EIMSK: 0x3d, EIFR: 0x3c, index, iscOffset: (index & 3) * 2, interrupt });
const megaPorts = {
  ...PORTS_2560,
  B: { ...portBConfig, pinChange: { PCIE: 0, PCICR: 0x68, PCIFR: 0x3b, PCMSK: 0x6b, pinChangeInterrupt: 0x12, mask: 0xff, offset: 0 } },
  K: { ...portKConfig, pinChange: { PCIE: 2, PCICR: 0x68, PCIFR: 0x3b, PCMSK: 0x6d, pinChangeInterrupt: 0x16, mask: 0xff, offset: 0 } },
  C: { ...portCConfig, pinChange: undefined },
  D: { ...portDConfig, pinChange: undefined, externalInterrupts: [extInt(0, 0x02), extInt(1, 0x04), extInt(2, 0x06), extInt(3, 0x08)] },
  E: { ...portEConfig, externalInterrupts: [null, null, null, null, extInt(4, 0x0a), extInt(5, 0x0c), extInt(6, 0x0e), extInt(7, 0x10)] },
};
const P = n => PORTS_2560[n].PORT;
const bitsC = { TOV: 1, OCFA: 2, OCFB: 4, OCFC: 8, TOIE: 1, OCIEA: 2, OCIEB: 4, OCIEC: 8 };
const timer16 = (base, tifr, timsk, vec, [pa, ba], [pb, bb], [pc, bc], [pt, bt]) => ({
  ...timer1Config, ...bitsC,
  captureInterrupt: vec, compAInterrupt: vec + 2, compBInterrupt: vec + 4, compCInterrupt: vec + 6, ovfInterrupt: vec + 8,
  TIFR: tifr, TIMSK: timsk, TCCRA: base, TCCRB: base + 1, TCCRC: base + 2, TCNT: base + 4, ICR: base + 6, OCRA: base + 8, OCRB: base + 10, OCRC: base + 12,
  compPortA: P(pa), compPinA: ba, compPortB: P(pb), compPinB: bb, compPortC: P(pc), compPinC: bc,
  externalClockPort: pt ? P(pt) : 0, externalClockPin: bt || 0,
});
const MEGA_TIMERS = [
  { ...timer0Config, compAInterrupt: 0x2a, compBInterrupt: 0x2c, ovfInterrupt: 0x2e, compPortA: P('B'), compPinA: 7, compPortB: P('G'), compPinB: 5, externalClockPort: P('D'), externalClockPin: 7 },
  timer16(0x80, 0x36, 0x6f, 0x20, ['B', 5], ['B', 6], ['B', 7], ['D', 6]),
  { ...timer2Config, compAInterrupt: 0x1a, compBInterrupt: 0x1c, ovfInterrupt: 0x1e, compPortA: P('B'), compPinA: 4, compPortB: P('H'), compPinB: 6 },
  timer16(0x90, 0x38, 0x71, 0x3e, ['E', 3], ['E', 4], ['E', 5], ['E', 6]),
  timer16(0xa0, 0x39, 0x72, 0x52, ['H', 3], ['H', 4], ['H', 5], ['H', 7]),
  timer16(0x120, 0x3a, 0x73, 0x5c, ['L', 3], ['L', 4], ['L', 5], ['L', 2]),
];
const usart = (base, vec) => ({ rxCompleteInterrupt: vec, dataRegisterEmptyInterrupt: vec + 2, txCompleteInterrupt: vec + 4, UCSRA: base, UCSRB: base + 1, UCSRC: base + 2, UBRRL: base + 4, UBRRH: base + 5, UDR: base + 6 });
const megaChannels = { 0x1e: { type: ADCMuxInputType.Constant, voltage: 1.1 }, 0x1f: { type: ADCMuxInputType.Constant, voltage: 0 } };
for (let i = 0; i < 8; i++) { megaChannels[i] = { type: ADCMuxInputType.SingleEnded, channel: i }; megaChannels[0x20 + i] = { type: ADCMuxInputType.SingleEnded, channel: 8 + i }; }

export const MCUS = {
  atmega328p: {
    flash: 0x8000, sram: 8192, eeprom: 1024,
    ports: { B: portBConfig, C: portCConfig, D: portDConfig },
    timers: [timer0Config, timer1Config, timer2Config],
    usarts: [usart0Config],
    adc: adcConfig, twi: twiConfig, spi: spiConfig, eepromCfg: eepromConfig,
  },
  atmega2560: {
    flash: 0x40000, sram: 8192 + 0x100, eeprom: 4096,
    ports: megaPorts,
    timers: MEGA_TIMERS,
    usarts: [usart(0xc0, 0x32), usart(0xc8, 0x48), usart(0xd0, 0x66), usart(0x130, 0x6c)],
    adc: { ...adcConfig, adcInterrupt: 0x3a, numChannels: 16, muxInputMask: 0x3f, muxChannels: megaChannels, adcReferences: [ADCReference.AREF, ADCReference.AVCC, ADCReference.Internal1V1, ADCReference.Internal2V56] },
    twi: { ...twiConfig, twiInterrupt: 0x4e }, spi: { ...spiConfig, spiInterrupt: 0x30 }, eepromCfg: { ...eepromConfig, eepromReadyInterrupt: 0x3c },
  },
};

/* ---------- placa genérica ---------- */
// spec: { mcu, pins: [[puerto, bit] | null, …] (índice = número de pin Arduino), analog: {pin: canal ADC} }
export class Board {
  constructor(hex, spec){
    const M = MCUS[spec.mcu]; this.spec = spec;
    this.program = new Uint16Array(M.flash / 2);
    loadHex(hex, new Uint8Array(this.program.buffer));
    this.cpu = new CPU(this.program, M.sram);
    this.timers = M.timers.map(t => new AVRTimer(this.cpu, t));
    this.ports = {}; for (const [n, cfg] of Object.entries(M.ports)) this.ports[n] = new AVRIOPort(this.cpu, cfg);
    this.usarts = M.usarts.map(u => new AVRUSART(this.cpu, u, FREQ));
    this.usart = this.usarts[0];
    this.adc = new AVRADC(this.cpu, M.adc);
    this.twi = new AVRTWI(this.cpu, M.twi, FREQ);
    this.spi = new AVRSPI(this.cpu, M.spi, FREQ);
    this.eeprom = new AVREEPROM(this.cpu, new EEPROMMemoryBackend(M.eeprom), M.eepromCfg);
    this.clock = new AVRClock(this.cpu, FREQ, clockConfig);
    this.pinMap = spec.pins; this.analog = spec.analog;
    this.n = spec.pins.length;
    this.state = new Array(this.n).fill(PinState.Input);
    this.byPort = {}; // puerto -> [[bit, pin]]
    spec.pins.forEach((pb, p) => { if (pb) (this.byPort[pb[0]] = this.byPort[pb[0]] || []).push([pb[1], p]); });
    this.pinListeners = [];
    this.rxQueues = this.usarts.map(() => []);
    for (const name of Object.keys(this.byPort)) this.ports[name].addListener(() => this.portChanged(name));
    // onSerial(byte, n): byte enviado por el puerto serie n (0 = Serial/USB, 1-3 = Serial1-3 del Mega)
    this.usarts.forEach((u, i) => { u.onByteTransmit = b => this.onSerial && this.onSerial(b, i); u.onRxComplete = () => this.feedRx(i); });
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
  pinState(p){ const pb = this.pinMap[p]; return pb ? this.ports[pb[0]].pinState(pb[1]) : PinState.Input; }
  setInput(p, high){ const pb = this.pinMap[p]; if (pb) this.ports[pb[0]].setPin(pb[1], !!high); }
  setAnalog(p, volts){ const ch = this.analog[p]; if (ch !== undefined) this.adc.channelValues[ch] = volts; }
  portChanged(name){
    const port = this.ports[name];
    for (const [b, p] of this.byPort[name]) {
      const s = port.pinState(b);
      if (s !== this.state[p]) { const old = this.state[p]; this.state[p] = s; for (const l of this.pinListeners) l(p, s, old, this.cpu.cycles); }
    }
  }
  serialWrite(bytes, n = 0){ if (!this.usarts[n]) return; this.rxQueues[n].push(...bytes); this.feedRx(n); }
  feedRx(n){ const q = this.rxQueues[n], u = this.usarts[n]; if (q.length && !u.rxBusy) { if (u.writeByte(q[0])) q.shift(); } }
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
      for (let i = 0; i < this.rxQueues.length; i++) if (this.rxQueues[i].length) this.feedRx(i);
    }
  }
}
