// Ejemplos: circuito + sketch
const GND = '#212121', RED = '#e53935', SIG = ['#f9a825', '#1565c0', '#2e7d32', '#ef6c00', '#8e24aa'];

const ledOnPin = (pin, color = 'rojo') => ({
  comps: [
    { id: 1, type: 'res', x: 620, y: 150, rot: 0, name: 'R1', props: { ohms: 220 } },
    { id: 2, type: 'led', x: 720, y: 90, rot: 0, name: 'LED1', props: { color } },
  ],
  wires: [
    { id: 10, a: 'B:' + pin, b: 'C1:a', pts: [], color: SIG[0] },
    { id: 11, a: 'C1:b', b: 'C2:a', pts: [], color: SIG[0] },
    { id: 12, a: 'C2:k', b: 'B:GND.1', pts: [[730, 178], [207.6, 178]], color: GND },
  ],
});

export const EXAMPLES = {
  completo: {
    title: 'Potenciómetro, botón y LED',
    build(){
      const c = ledOnPin('D9');
      c.comps.push({ id: 3, type: 'btn', x: 740, y: 330, rot: 0, name: 'BTN1', props: { pressed: false, latch: false, bounce: true } });
      c.wires.push({ id: 13, a: 'B:D2', b: 'C3:a', pts: [[428.8, 190], [660, 190], [660, 330]], color: SIG[1] });
      c.wires.push({ id: 14, a: 'C3:b', b: 'B:GND.3', pts: [[810, 330], [810, 620], [318, 620]], color: GND });
      c.comps.push({ id: 4, type: 'pot', x: 920, y: 460, rot: 0, name: 'POT1', props: { ohms: 10000, pos: 0.65 } });
      c.wires.push({ id: 15, a: 'C4:p1', b: 'B:5V', pts: [[900, 640], [282.8, 640]], color: RED });
      c.wires.push({ id: 16, a: 'C4:w', b: 'B:A0', pts: [[920, 655], [363.2, 655]], color: SIG[2] });
      c.wires.push({ id: 17, a: 'C4:p3', b: 'B:GND.2', pts: [[940, 670], [300.4, 670]], color: GND });
      return { ...c, counters: { res: 1, led: 1, btn: 1, pot: 1 } };
    },
    code: `// Potenciómetro, botón y LED
// Gira el potenciómetro para regular el brillo (PWM) del LED.
// Mantén pulsado el botón para encenderlo al máximo.

const int PIN_LED = 9;     // pin con PWM (~)
const int PIN_BOTON = 2;
const int PIN_POT = A0;

void setup() {
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BOTON, INPUT_PULLUP);  // suelto = HIGH, pulsado = LOW
  Serial.begin(9600);
  Serial.println("Listo");
}

void loop() {
  int lectura = analogRead(PIN_POT);           // 0..1023
  int brillo = map(lectura, 0, 1023, 0, 255);  // 0..255

  if (digitalRead(PIN_BOTON) == LOW) {
    brillo = 255;
  }
  analogWrite(PIN_LED, brillo);

  Serial.print("pot = ");
  Serial.print(lectura);
  Serial.print("   brillo = ");
  Serial.println(brillo);
  delay(200);
}
`,
  },
  lcd: {
    title: 'Pantalla LCD 16×2 (LiquidCrystal)',
    build(){
      const L = 'C1:';
      const wires = [
        ['VSS', 'B:GND.1', GND, [[708, 178], [207.6, 178]]], ['VDD', 'B:5V', RED, [[723, 300], [600, 300], [600, 620], [282.8, 620]]],
        ['V0', L + 'VSS', GND, [[738, 318], [708, 318]]], ['RS', 'B:D12', SIG[0], []], ['RW', L + 'VSS', GND, [[768, 310], [708, 310]]], ['E', 'B:D11', SIG[1], []],
        ['D4', 'B:D5', SIG[2], []], ['D5', 'B:D4', SIG[3], []], ['D6', 'B:D3', SIG[4], []], ['D7', 'B:D2', SIG[0], []],
        ['A', L + 'VDD', RED, [[918, 300], [723, 300]]], ['K', 'B:GND.1', GND, [[933, 178], [207.6, 178]]],
      ];
      return {
        comps: [{ id: 1, type: 'lcd', x: 820, y: 430, rot: 0, name: 'LCD1', props: {} }],
        wires: wires.map(([t, p, color, pts], i) => ({ id: 10 + i, a: L + t, b: p, pts, color })),
        counters: { lcd: 1 },
      };
    },
    code: `// Pantalla LCD 16x2 en modo de 4 bits con la librería LiquidCrystal
#include <LiquidCrystal.h>

//                RS  E  D4 D5 D6 D7
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

byte corazon[8] = {
  0b00000, 0b01010, 0b11111, 0b11111,
  0b11111, 0b01110, 0b00100, 0b00000
};

void setup() {
  lcd.createChar(0, corazon);
  lcd.begin(16, 2);
  lcd.print("Hola, Arduino ");
  lcd.write(byte(0));
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print("Segundos: ");
  lcd.print(millis() / 1000);
  delay(250);
}
`,
  },
  servo: {
    title: 'Servo controlado con potenciómetro',
    build(){
      return {
        comps: [
          { id: 1, type: 'servo', x: 830, y: 140, rot: 0, name: 'SERVO1', props: {} },
          { id: 2, type: 'pot', x: 900, y: 420, rot: 0, name: 'POT1', props: { ohms: 10000, pos: 0.3 } },
        ],
        wires: [
          { id: 10, a: 'C1:gnd', b: 'B:GND.1', pts: [[700, 126], [700, 178], [207.6, 178]], color: '#6b3e1f' },
          { id: 11, a: 'C1:vcc', b: 'B:5V', pts: [[680, 140], [680, 620], [282.8, 620]], color: RED },
          { id: 12, a: 'C1:sig', b: 'B:D9', pts: [[720, 154], [720, 190], [295.6, 190]], color: '#f28c28' },
          { id: 13, a: 'C2:p1', b: 'B:5V', pts: [[880, 640], [282.8, 640]], color: RED },
          { id: 14, a: 'C2:w', b: 'B:A0', pts: [[900, 655], [363.2, 655]], color: SIG[2] },
          { id: 15, a: 'C2:p3', b: 'B:GND.2', pts: [[920, 670], [300.4, 670]], color: GND },
        ],
        counters: { servo: 1, pot: 1 },
      };
    },
    code: `// Servo controlado con un potenciómetro (librería Servo)
#include <Servo.h>

Servo brazo;

void setup() {
  brazo.attach(9);         // señal en el pin 9
  Serial.begin(9600);
}

void loop() {
  int lectura = analogRead(A0);
  int angulo = map(lectura, 0, 1023, 0, 180);
  brazo.write(angulo);
  Serial.print("Ángulo: ");
  Serial.println(angulo);
  delay(50);
}
`,
  },
  i2c: {
    title: 'LCD I2C (necesita LiquidCrystal_I2C)',
    build(){
      return {
        comps: [{ id: 1, type: 'lcdi2c', x: 860, y: 400, rot: 0, name: 'LCD1', props: { address: 0x27 } }],
        wires: [
          { id: 10, a: 'C1:GND', b: 'B:GND.2', pts: [[640, 379], [640, 640], [300.4, 640]], color: GND },
          { id: 11, a: 'C1:VCC', b: 'B:5V', pts: [[620, 393], [620, 620], [282.8, 620]], color: RED },
          { id: 12, a: 'C1:SDA', b: 'B:A4', pts: [[600, 407], [600, 600], [433.6, 600]], color: SIG[1] },
          { id: 13, a: 'C1:SCL', b: 'B:A5', pts: [[580, 421], [580, 590], [451.2, 590]], color: SIG[0] },
        ],
        counters: { lcdi2c: 1 },
      };
    },
    code: `// LCD 16x2 con módulo I2C (PCF8574, dirección 0x27)
// Necesita la librería LiquidCrystal_I2C: descárgala como .zip
// (por ejemplo desde GitHub) y cárgala en la pestaña Librerías.
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Banco Uno + I2C");
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print("t = ");
  lcd.print(millis() / 100 / 10.0, 1);
  lcd.print(" s   ");
  delay(100);
}
`,
  },
  rgb: {
    title: 'LED RGB y fotorresistencia',
    build(){
      return {
        comps: [
          { id: 1, type: 'res', x: 620, y: 70, rot: 0, name: 'R1', props: { ohms: 220 } },
          { id: 2, type: 'res', x: 620, y: 110, rot: 0, name: 'R2', props: { ohms: 220 } },
          { id: 3, type: 'res', x: 620, y: 150, rot: 0, name: 'R3', props: { ohms: 220 } },
          { id: 4, type: 'rgb', x: 780, y: 90, rot: 0, name: 'RGB1', props: {} },
          { id: 5, type: 'ldr', x: 860, y: 380, rot: 0, name: 'LDR1', props: { lux: 20 } },
          { id: 6, type: 'res', x: 860, y: 470, rot: 0, name: 'R4', props: { ohms: 10000 } },
        ],
        wires: [
          { id: 10, a: 'B:D9', b: 'C1:a', pts: [], color: '#e53935' },
          { id: 11, a: 'B:D10', b: 'C2:a', pts: [], color: '#2e7d32' },
          { id: 12, a: 'B:D11', b: 'C3:a', pts: [], color: '#1565c0' },
          { id: 13, a: 'C1:b', b: 'C4:r', pts: [[700, 70], [700, 150], [759, 150]], color: '#e53935' },
          { id: 14, a: 'C2:b', b: 'C4:g', pts: [[690, 110], [690, 165], [787, 165]], color: '#2e7d32' },
          { id: 15, a: 'C3:b', b: 'C4:b', pts: [[680, 180], [801, 180]], color: '#1565c0' },
          { id: 16, a: 'C4:k', b: 'B:GND.1', pts: [[773, 192], [207.6, 192]], color: GND },
          { id: 17, a: 'C5:a', b: 'B:5V', pts: [[790, 380], [790, 630], [282.8, 630]], color: RED },
          { id: 18, a: 'C5:b', b: 'C6:b', pts: [[940, 380], [940, 470]], color: SIG[0] },
          { id: 19, a: 'C6:a', b: 'B:GND.2', pts: [[780, 470], [780, 645], [300.4, 645]], color: GND },
          { id: 20, a: 'C6:b', b: 'B:A0', pts: [[960, 470], [960, 660], [363.2, 660]], color: SIG[0] },
        ],
        counters: { res: 4, rgb: 1, ldr: 1 },
      };
    },
    code: `// LED RGB que cambia de color y se apaga cuando hay mucha luz.
// Cambia la luz de la fotorresistencia en sus propiedades.

const int R = 9, G = 10, B = 11;

void color(int r, int g, int b) {
  analogWrite(R, r);
  analogWrite(G, g);
  analogWrite(B, b);
}

void setup() {
  Serial.begin(9600);
}

void loop() {
  int luz = analogRead(A0);       // más luz = valor más alto
  Serial.print("luz = ");
  Serial.println(luz);
  if (luz > 800) {               // de día: apagado
    color(0, 0, 0);
    delay(200);
    return;
  }
  for (int i = 0; i < 256; i += 5) { color(255 - i, i, 0); delay(10); }
  for (int i = 0; i < 256; i += 5) { color(0, 255 - i, i); delay(10); }
  for (int i = 0; i < 256; i += 5) { color(i, 0, 255 - i); delay(10); }
}
`,
  },
  blink: {
    title: 'Parpadeo (Blink)',
    build(){ return { ...ledOnPin('D13'), counters: { res: 1, led: 1 } }; },
    code: `// Parpadeo: el LED integrado (L) y el LED externo en el pin 13.

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
`,
  },
};
