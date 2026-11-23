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

  ultrasonido: {
    title: 'Ultrasonido HC-SR04 (distancia)',
    build(){
      return {
        comps: [{ id: 1, type: 'sr04', x: 800, y: 120, rot: 0, name: 'US1', props: { cm: 30 } }],
        wires: [
          { id: 10, a: 'C1:VCC', b: 'B:5V', pts: [[779, 260], [620, 260], [620, 640], [282.8, 640]], color: RED },
          { id: 11, a: 'C1:TRIG', b: 'B:D9', pts: [[793, 200], [296.8, 200]], color: SIG[0] },
          { id: 12, a: 'C1:ECHO', b: 'B:D10', pts: [[807, 190], [279.2, 190]], color: SIG[1] },
          { id: 13, a: 'C1:GND', b: 'B:GND.2', pts: [[821, 275], [640, 275], [640, 660], [300.4, 660]], color: GND },
        ],
        counters: { sr04: 1 },
      };
    },
    code: `// Sensor ultrasónico HC-SR04
// Mueve el control "Distancia al objeto" del sensor y mira el monitor serie.

const int TRIG = 9;
const int ECHO = 10;

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);      // pulso de 10 µs
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);

  long us = pulseIn(ECHO, HIGH, 40000UL);  // duración del eco
  float cm = us / 58.0;

  Serial.print("Distancia: ");
  Serial.print(cm, 1);
  Serial.println(" cm");
  delay(300);
}
`,
  },
  dht: {
    title: 'Temperatura y humedad DHT22',
    build(){
      return {
        comps: [{ id: 1, type: 'dht', x: 760, y: 110, rot: 0, name: 'DHT1', props: { model: 'DHT22', temp: 24, hum: 55 } }],
        wires: [
          { id: 10, a: 'C1:VCC', b: 'B:5V', pts: [[746, 260], [620, 260], [620, 640], [282.8, 640]], color: RED },
          { id: 11, a: 'C1:DATA', b: 'B:D2', pts: [[760, 190], [428.8, 190]], color: SIG[0] },
          { id: 12, a: 'C1:GND', b: 'B:GND.2', pts: [[774, 275], [640, 275], [640, 660], [300.4, 660]], color: GND },
        ],
        counters: { dht: 1 },
      };
    },
    code: `// Sensor DHT22 con la librería "DHT sensor library" de Adafruit (incluida)
// Cambia la temperatura y la humedad en el panel del sensor.
#include <DHT.h>

DHT dht(2, DHT22);   // pin de datos, modelo (DHT11 o DHT22)

void setup() {
  Serial.begin(9600);
  dht.begin();
}

void loop() {
  delay(2000);                     // el DHT22 mide cada 2 s
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (isnan(h) || isnan(t)) {
    Serial.println("Error al leer el sensor");
    return;
  }
  Serial.print("Temperatura: ");
  Serial.print(t, 1);
  Serial.print(" C   Humedad: ");
  Serial.print(h, 1);
  Serial.println(" %");
}
`,
  },
  pir: {
    title: 'Sensor de movimiento PIR',
    build(){
      const c = ledOnPin('D13', 'verde');
      c.comps.push({ id: 3, type: 'pir', x: 900, y: 330, rot: 0, name: 'PIR1', props: { hold: 3 } });
      c.wires.push({ id: 13, a: 'C3:VCC', b: 'B:5V', pts: [[886, 400], [886, 640], [282.8, 640]], color: RED });
      c.wires.push({ id: 14, a: 'C3:OUT', b: 'B:D2', pts: [[900, 420], [660, 420], [660, 190], [428.8, 190]], color: SIG[1] });
      c.wires.push({ id: 15, a: 'C3:GND', b: 'B:GND.2', pts: [[914, 410], [930, 410], [930, 660], [300.4, 660]], color: GND });
      return { ...c, counters: { res: 1, led: 1, pir: 1 } };
    },
    code: `// Sensor PIR: haz clic en la cúpula blanca para simular movimiento.
const int PIR = 2;
const int LED = 13;

void setup() {
  pinMode(PIR, INPUT);
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  static int antes = LOW;
  int ahora = digitalRead(PIR);
  digitalWrite(LED, ahora);
  if (ahora != antes) {
    Serial.println(ahora == HIGH ? "¡Movimiento!" : "Sin movimiento");
    antes = ahora;
  }
}
`,
  },
  joystick: {
    title: 'Joystick KY-023',
    build(){
      return {
        comps: [{ id: 1, type: 'joy', x: 820, y: 400, rot: 0, name: 'JOY1', props: { x: 0, y: 0, pressed: false } }],
        wires: [
          { id: 10, a: 'C1:GND', b: 'B:GND.2', pts: [[700, 372], [700, 660], [300.4, 660]], color: GND },
          { id: 11, a: 'C1:V5', b: 'B:5V', pts: [[690, 386], [690, 640], [282.8, 640]], color: RED },
          { id: 12, a: 'C1:VRx', b: 'B:A0', pts: [[680, 400], [680, 620], [363.2, 620]], color: SIG[2] },
          { id: 13, a: 'C1:VRy', b: 'B:A1', pts: [[670, 414], [670, 610], [380.8, 610]], color: SIG[1] },
          { id: 14, a: 'C1:SW', b: 'B:D2', pts: [[660, 428], [660, 190], [428.8, 190]], color: SIG[0] },
        ],
        counters: { joy: 1 },
      };
    },
    code: `// Joystick: arrástralo con el ratón. Clic en el centro = pulsador.
const int EJE_X = A0;
const int EJE_Y = A1;
const int BOTON = 2;

void setup() {
  pinMode(BOTON, INPUT_PULLUP);
  Serial.begin(9600);
}

void loop() {
  int x = analogRead(EJE_X);   // 0..1023, centro ≈ 512
  int y = analogRead(EJE_Y);
  bool pulsado = digitalRead(BOTON) == LOW;
  Serial.print("X=");
  Serial.print(x);
  Serial.print("  Y=");
  Serial.print(y);
  Serial.println(pulsado ? "  [pulsado]" : "");
  delay(150);
}
`,
  },
  alarma: {
    title: 'Alarma de llama y gas',
    build(){
      return {
        comps: [
          { id: 1, type: 'flame', x: 720, y: 360, rot: 0, name: 'FLM1', props: { level: 0, threshold: 0.5 } },
          { id: 2, type: 'gas', x: 900, y: 360, rot: 0, name: 'GAS1', props: { ppm: 300, threshold: 1000 } },
          { id: 3, type: 'buzzer', x: 820, y: 110, rot: 0, name: 'BZ1', props: {} },
        ],
        wires: [
          { id: 10, a: 'C1:AO', b: 'B:A0', pts: [[699, 620], [363.2, 620]], color: SIG[2] },
          { id: 11, a: 'C1:GND', b: 'B:GND.2', pts: [[713, 660], [300.4, 660]], color: GND },
          { id: 12, a: 'C1:VCC', b: 'B:5V', pts: [[727, 640], [282.8, 640]], color: RED },
          { id: 13, a: 'C2:VCC', b: 'C1:VCC', pts: [[879, 640]], color: RED },
          { id: 14, a: 'C2:GND', b: 'C1:GND', pts: [[893, 660]], color: GND },
          { id: 15, a: 'C2:AO', b: 'B:A1', pts: [[921, 600], [380.8, 600]], color: SIG[1] },
          { id: 16, a: 'C3:p', b: 'B:D8', pts: [[810, 180], [314.4, 180]], color: SIG[0] },
          { id: 17, a: 'C3:n', b: 'B:GND.1', pts: [[830, 170], [207.6, 170]], color: GND },
        ],
        counters: { flame: 1, gas: 1, buzzer: 1 },
      };
    },
    code: `// Alarma: suena si hay llama o mucho gas.
// Sube la "Intensidad de la llama" o la "Concentración de gas" en sus paneles.
const int LLAMA = A0;   // baja cuando hay llama
const int GAS = A1;     // sube con el gas
const int ZUMBADOR = 8;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int llama = analogRead(LLAMA);
  int gas = analogRead(GAS);
  bool alarma = llama < 400 || gas > 500;
  if (alarma) tone(ZUMBADOR, 1500); else noTone(ZUMBADOR);
  Serial.print("llama=");
  Serial.print(llama);
  Serial.print("  gas=");
  Serial.print(gas);
  Serial.println(alarma ? "  ALARMA" : "");
  delay(250);
}
`,
  },
  rele: {
    title: 'Módulo relé con lámpara a batería',
    build(){
      return {
        comps: [
          { id: 1, type: 'relay', x: 760, y: 130, rot: 0, name: 'RELE1', props: { trigger: 'low' } },
          { id: 2, type: 'battery', x: 1010, y: 420, rot: 0, name: 'BAT1', props: { volts: 9 } },
          { id: 3, type: 'res', x: 900, y: 290, rot: 0, name: 'R1', props: { ohms: 470 } },
          { id: 4, type: 'led', x: 900, y: 400, rot: 0, name: 'LED1', props: { color: 'amarillo' } },
        ],
        wires: [
          { id: 10, a: 'C1:VCC', b: 'B:5V', pts: [[660, 116], [640, 116], [640, 640], [282.8, 640]], color: RED },
          { id: 11, a: 'C1:GND', b: 'B:GND.1', pts: [[650, 130], [650, 170], [207.6, 170]], color: GND },
          { id: 12, a: 'C1:IN', b: 'B:D7', pts: [[660, 144], [660, 190], [342.8, 190]], color: SIG[0] },
          { id: 13, a: 'C1:COM', b: 'C2:p', pts: [[998, 130]], color: RED },
          { id: 14, a: 'C1:NO', b: 'C3:b', pts: [[960, 116], [960, 290]], color: SIG[3] },
          { id: 15, a: 'C3:a', b: 'C4:a', pts: [[852, 340], [890, 340]], color: SIG[3] },
          { id: 16, a: 'C4:k', b: 'C2:n', pts: [[910, 470], [1022, 470]], color: GND },
        ],
        counters: { relay: 1, battery: 1, res: 1, led: 1 },
      };
    },
    code: `// Módulo relé (activo en LOW): enciende una lámpara alimentada por una batería aparte.
const int RELE = 7;

void setup() {
  pinMode(RELE, OUTPUT);
  digitalWrite(RELE, HIGH);   // apagado (el módulo se activa con LOW)
  Serial.begin(9600);
}

void loop() {
  digitalWrite(RELE, LOW);
  Serial.println("Relé activado: lámpara encendida");
  delay(1500);
  digitalWrite(RELE, HIGH);
  Serial.println("Relé en reposo: lámpara apagada");
  delay(1500);
}
`,
  },
  motor: {
    title: 'Motor DC con driver L298N',
    build(){
      return {
        comps: [
          { id: 1, type: 'l298n', x: 830, y: 300, rot: 0, name: 'DRV1', props: { jumperA: false, jumperB: true } },
          { id: 2, type: 'motor', x: 680, y: 110, rot: 0, name: 'M1', props: {} },
          { id: 3, type: 'battery', x: 1030, y: 110, rot: 0, name: 'BAT1', props: { volts: 9 } },
          { id: 4, type: 'pot', x: 1000, y: 470, rot: 0, name: 'POT1', props: { ohms: 10000, pos: 0.7 } },
        ],
        wires: [
          { id: 10, a: 'C1:OUT1', b: 'C2:p', pts: [[700, 280], [600, 280], [600, 100]], color: SIG[3] },
          { id: 11, a: 'C1:OUT2', b: 'C2:n', pts: [[700, 302], [590, 302], [590, 120]], color: SIG[4] },
          { id: 12, a: 'C3:p', b: 'C1:VS', pts: [[1018, 40], [764, 40], [764, 420]], color: RED },
          { id: 13, a: 'C3:n', b: 'C1:GND', pts: [[1042, 30], [780, 30], [780, 430]], color: GND },
          { id: 14, a: 'C1:GND', b: 'B:GND.2', pts: [[780, 660], [300.4, 660]], color: GND },
          { id: 15, a: 'C1:ENA', b: 'B:D5', pts: [[820, 610], [610, 610], [610, 180], [377.6, 180]], color: SIG[0] },
          { id: 16, a: 'C1:IN1', b: 'B:D7', pts: [[834, 600], [620, 600], [620, 190], [342.8, 190]], color: SIG[1] },
          { id: 17, a: 'C1:IN2', b: 'B:D8', pts: [[848, 590], [630, 590], [630, 200], [314.4, 200]], color: SIG[2] },
          { id: 18, a: 'C4:p1', b: 'B:5V', pts: [[980, 640], [282.8, 640]], color: RED },
          { id: 19, a: 'C4:w', b: 'B:A0', pts: [[1000, 650], [363.2, 650]], color: SIG[2] },
          { id: 20, a: 'C4:p3', b: 'B:GND.3', pts: [[1020, 670], [318, 670]], color: GND },
        ],
        counters: { l298n: 1, motor: 1, battery: 1, pot: 1 },
      };
    },
    code: `// Motor DC con L298N: el potenciómetro elige velocidad y sentido.
// Mitad izquierda = un sentido, mitad derecha = el otro, centro = detenido.
const int ENA = 5;   // PWM (velocidad)
const int IN1 = 7;
const int IN2 = 8;

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int v = analogRead(A0) - 512;          // -512..511
  int velocidad = constrain(abs(v) / 2, 0, 255);
  digitalWrite(IN1, v > 0 ? HIGH : LOW);
  digitalWrite(IN2, v < 0 ? HIGH : LOW);
  analogWrite(ENA, abs(v) < 40 ? 0 : velocidad);
  Serial.print("velocidad: ");
  Serial.println(v > 0 ? velocidad : -velocidad);
  delay(200);
}
`,
  },
  oled: {
    title: 'Pantalla OLED SSD1306 (I2C)',
    build(){
      return {
        comps: [
          { id: 1, type: 'oled', x: 820, y: 400, rot: 0, name: 'OLED1', props: { address: 0x3C } },
          { id: 2, type: 'pot', x: 1010, y: 150, rot: 0, name: 'POT1', props: { ohms: 10000, pos: 0.4 } },
        ],
        wires: [
          { id: 10, a: 'C1:GND', b: 'B:GND.2', pts: [[799, 320], [700, 320], [700, 660], [300.4, 660]], color: GND },
          { id: 11, a: 'C1:VCC', b: 'B:5V', pts: [[813, 310], [690, 310], [690, 640], [282.8, 640]], color: RED },
          { id: 12, a: 'C1:SCL', b: 'B:A5', pts: [[827, 300], [680, 300], [680, 620], [433.6, 620]], color: SIG[1] },
          { id: 13, a: 'C1:SDA', b: 'B:A4', pts: [[841, 290], [670, 290], [670, 610], [416, 610]], color: SIG[2] },
          { id: 14, a: 'C2:p1', b: 'B:5V', pts: [[990, 230], [990, 640]], color: RED },
          { id: 15, a: 'C2:w', b: 'B:A0', pts: [[1010, 240], [1010, 650], [363.2, 650]], color: SIG[0] },
          { id: 16, a: 'C2:p3', b: 'B:GND.3', pts: [[1030, 250], [1030, 670], [318, 670]], color: GND },
        ],
        counters: { oled: 1, pot: 1 },
      };
    },
    code: `// OLED 128x64 con Adafruit SSD1306 + Adafruit GFX (incluidas)
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 pantalla(128, 64, &Wire, -1);

void setup() {
  Serial.begin(9600);
  if (!pantalla.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("No se encontró la pantalla");
    while (true) {}
  }
}

void loop() {
  int valor = analogRead(A0);
  pantalla.clearDisplay();
  pantalla.setTextColor(SSD1306_WHITE);
  pantalla.setTextSize(1);
  pantalla.setCursor(0, 0);
  pantalla.println("Banco Uno");
  pantalla.setTextSize(2);
  pantalla.setCursor(0, 18);
  pantalla.print("A0: ");
  pantalla.println(valor);
  pantalla.drawRect(0, 46, 128, 14, SSD1306_WHITE);
  pantalla.fillRect(2, 48, map(valor, 0, 1023, 0, 124), 10, SSD1306_WHITE);
  pantalla.display();
  delay(100);
}
`,
  },
  matriz: {
    title: 'Matriz LED 8×8 MAX7219',
    build(){
      return {
        comps: [{ id: 1, type: 'max7219', x: 880, y: 380, rot: 0, name: 'MTX1', props: {} }],
        wires: [
          { id: 10, a: 'C1:VCC', b: 'B:5V', pts: [[700, 352], [700, 640], [282.8, 640]], color: RED },
          { id: 11, a: 'C1:GND', b: 'B:GND.2', pts: [[690, 366], [690, 660], [300.4, 660]], color: GND },
          { id: 12, a: 'C1:DIN', b: 'B:D12', pts: [[680, 380], [680, 180], [261.6, 180]], color: SIG[0] },
          { id: 13, a: 'C1:CS', b: 'B:D10', pts: [[670, 394], [670, 190], [296.8, 190]], color: SIG[1] },
          { id: 14, a: 'C1:CLK', b: 'B:D11', pts: [[660, 408], [660, 200], [279.2, 200]], color: SIG[2] },
        ],
        counters: { max7219: 1 },
      };
    },
    code: `// Matriz 8x8 con MAX7219 y la librería LedControl (incluida)
#include <LedControl.h>

LedControl matriz(12, 11, 10, 1);   // DIN, CLK, CS, cantidad de módulos

const byte CARA[8] = {
  B00111100, B01000010, B10100101, B10000001,
  B10100101, B10011001, B01000010, B00111100
};

void setup() {
  matriz.shutdown(0, false);   // sale del modo de bajo consumo
  matriz.setIntensity(0, 6);
  matriz.clearDisplay(0);
}

void loop() {
  for (int f = 0; f < 8; f++) matriz.setRow(0, f, CARA[f]);
  delay(1500);
  matriz.clearDisplay(0);
  for (int f = 0; f < 8; f++) {
    for (int c = 0; c < 8; c++) { matriz.setLed(0, f, c, true); delay(20); }
  }
  delay(500);
}
`,
  },
  bluetooth: {
    title: 'Bluetooth HC-05 (control desde el celular)',
    build(){
      const c = ledOnPin('D13', 'azul');
      c.comps.push({ id: 3, type: 'hc05', x: 900, y: 360, rot: 0, name: 'BT1', props: { baud: 9600 } });
      c.wires.push({ id: 13, a: 'C3:VCC', b: 'B:5V', pts: [[879, 640], [282.8, 640]], color: RED });
      c.wires.push({ id: 14, a: 'C3:GND', b: 'B:GND.2', pts: [[893, 660], [300.4, 660]], color: GND });
      c.wires.push({ id: 15, a: 'C3:TXD', b: 'B:D10', pts: [[907, 450], [650, 450], [650, 190], [296.8, 190]], color: SIG[1] });
      c.wires.push({ id: 16, a: 'C3:RXD', b: 'B:D11', pts: [[921, 460], [640, 460], [640, 200], [279.2, 200]], color: SIG[2] });
      return { ...c, counters: { res: 1, led: 1, hc05: 1 } };
    },
    code: `// HC-05 con SoftwareSerial: escribe en el panel "Celular (Bluetooth)".
// "1" enciende el LED, "0" lo apaga; el resto se repite en el monitor serie.
#include <SoftwareSerial.h>

SoftwareSerial bt(10, 11);   // RX (va a TXD del módulo), TX (va a RXD)
const int LED = 13;

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
  bt.begin(9600);
  bt.println("Hola desde el Arduino. Envia 1 o 0.");
}

void loop() {
  if (bt.available()) {
    char c = bt.read();
    if (c == '1') { digitalWrite(LED, HIGH); bt.println("LED encendido"); }
    else if (c == '0') { digitalWrite(LED, LOW); bt.println("LED apagado"); }
    Serial.write(c);
  }
}
`,
  },
  nano: {
    title: 'Nano: potenciómetro en A7 y LED',
    board: 'nano',
    build(){
      return {
        comps: [
          { id: 1, type: 'res', x: 560, y: 560, rot: 0, name: 'R1', props: { ohms: 220 } },
          { id: 2, type: 'led', x: 680, y: 500, rot: 0, name: 'LED1', props: { color: 'verde' } },
          { id: 3, type: 'pot', x: 560, y: 180, rot: 0, name: 'POT1', props: { ohms: 10000, pos: 0.3 } },
        ],
        wires: [
          { id: 10, a: 'B:D3', b: 'C1:a', pts: [], color: SIG[0] },
          { id: 11, a: 'C1:b', b: 'C2:a', pts: [], color: SIG[0] },
          { id: 12, a: 'C2:k', b: 'B:GND.2', pts: [[690, 600], [283.6, 600]], color: GND },
          { id: 13, a: 'C3:p1', b: 'B:5V', pts: [[540, 270], [283.6, 270]], color: RED },
          { id: 14, a: 'C3:w', b: 'B:A7', pts: [[560, 285], [266, 285]], color: SIG[2] },
          { id: 15, a: 'C3:p3', b: 'B:GND.1', pts: [[580, 300], [318.8, 300]], color: GND },
        ],
        counters: { res: 1, led: 1, pot: 1 },
      };
    },
    code: `// Arduino Nano: A6 y A7 son entradas solo analógicas (no sirven con digitalRead).
// El potenciómetro en A7 regula el brillo del LED en D3 (PWM).

const int PIN_LED = 3;
const int PIN_POT = A7;

void setup() {
  pinMode(PIN_LED, OUTPUT);
  Serial.begin(9600);
  Serial.println("Arduino Nano listo");
}

void loop() {
  int lectura = analogRead(PIN_POT);
  analogWrite(PIN_LED, lectura / 4);
  Serial.print("A7 = ");
  Serial.println(lectura);
  delay(250);
}
`,
  },
  mega: {
    title: 'Mega: secuencia de LEDs en 22–28 y potenciómetro en A8',
    board: 'mega',
    build(){
      const comps = [], wires = []; let w = 10;
      [22, 24, 26, 28].forEach((pin, i) => {
        const y = 150 + i * 120;
        comps.push({ id: 1 + i * 2, type: 'res', x: 880, y, rot: 0, name: 'R' + (i + 1), props: { ohms: 220 } });
        comps.push({ id: 2 + i * 2, type: 'led', x: 990, y: y - 50, rot: 0, name: 'LED' + (i + 1), props: { color: ['rojo', 'amarillo', 'verde', 'azul'][i] } });
        wires.push({ id: w++, a: 'B:D' + pin, b: 'C' + (1 + i * 2) + ':a', pts: [], color: SIG[i] });
        wires.push({ id: w++, a: 'C' + (1 + i * 2) + ':b', b: 'C' + (2 + i * 2) + ':a', pts: [], color: SIG[i] });
        wires.push({ id: w++, a: 'C' + (2 + i * 2) + ':k', b: 'B:GND.4', pts: [[1000, y + 10], [1060, y + 10], [1060, 640], [770, 640], [770, 535.2]], color: GND });
      });
      comps.push({ id: 9, type: 'pot', x: 1200, y: 300, rot: 0, name: 'POT1', props: { ohms: 10000, pos: 0.5 } });
      wires.push({ id: w++, a: 'C9:p1', b: 'B:5V.2', pts: [[1180, 380], [1120, 380], [1120, 200], [790, 200], [790, 236]], color: RED });
      wires.push({ id: w++, a: 'C9:w', b: 'B:A8', pts: [[1200, 670], [494, 670]], color: SIG[4] });
      wires.push({ id: w++, a: 'C9:p3', b: 'B:GND.5', pts: [[1220, 655], [800, 655], [800, 535.2]], color: GND });
      return { comps, wires, counters: { res: 4, led: 4, pot: 1 } };
    },
    code: `// Arduino Mega 2560: 54 pines digitales, 16 entradas analógicas y 4 puertos serie.
// Los LEDs de los pines 22, 24, 26 y 28 se encienden en secuencia;
// el potenciómetro en A8 regula la velocidad.

const int LEDS[] = {22, 24, 26, 28};
const int N = 4;

void setup() {
  for (int i = 0; i < N; i++) pinMode(LEDS[i], OUTPUT);
  Serial.begin(9600);
  Serial.println("Arduino Mega listo");
}

void loop() {
  int pausa = map(analogRead(A8), 0, 1023, 40, 600);
  for (int i = 0; i < N; i++) {
    digitalWrite(LEDS[i], HIGH);
    delay(pausa);
    digitalWrite(LEDS[i], LOW);
  }
  Serial.print("pausa = ");
  Serial.print(pausa);
  Serial.println(" ms");
}
`,
  },
  megaSerial1: {
    title: 'Mega: Bluetooth HC-05 en Serial1 (pines 18 y 19)',
    board: 'mega',
    build(){
      return {
        comps: [
          { id: 1, type: 'res', x: 880, y: 140, rot: 0, name: 'R1', props: { ohms: 220 } },
          { id: 2, type: 'led', x: 990, y: 80, rot: 0, name: 'LED1', props: { color: 'azul' } },
          { id: 3, type: 'hc05', x: 1000, y: 360, rot: 0, name: 'BT1', props: { baud: 9600 } },
        ],
        wires: [
          { id: 10, a: 'B:D13', b: 'C1:a', pts: [[225.2, 130], [800, 130], [800, 140]], color: SIG[0] },
          { id: 11, a: 'C1:b', b: 'C2:a', pts: [], color: SIG[0] },
          { id: 12, a: 'C2:k', b: 'B:GND.1', pts: [[1000, 170], [1000, 110], [207.6, 110]], color: GND },
          { id: 13, a: 'C3:VCC', b: 'B:5V', pts: [[979, 660], [262.8, 660]], color: RED },
          { id: 14, a: 'C3:GND', b: 'B:GND.2', pts: [[993, 675], [280.4, 675]], color: GND },
          { id: 15, a: 'C3:TXD', b: 'B:D19', pts: [[1007, 470], [1080, 470], [1080, 160], [579.6, 160]], color: SIG[1] },
          { id: 16, a: 'C3:RXD', b: 'B:D18', pts: [[1021, 480], [1100, 480], [1100, 150], [562, 150]], color: SIG[2] },
        ],
        counters: { res: 1, led: 1, hc05: 1 },
      };
    },
    code: `// Mega: el HC-05 va al segundo puerto serie por hardware (Serial1: TX1 = 18, RX1 = 19),
// así el monitor serie (Serial, USB) queda libre. Escribe en el panel "Celular (Bluetooth)":
// "1" enciende el LED, "0" lo apaga.

const int LED = 13;

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(9600);    // monitor serie
  Serial1.begin(9600);   // Bluetooth
  Serial1.println("Hola desde el Mega. Envia 1 o 0.");
  Serial.println("Esperando datos por Bluetooth...");
}

void loop() {
  if (Serial1.available()) {
    char c = Serial1.read();
    if (c == '1') { digitalWrite(LED, HIGH); Serial1.println("LED encendido"); }
    else if (c == '0') { digitalWrite(LED, LOW); Serial1.println("LED apagado"); }
    Serial.print("Recibido: ");
    Serial.println(c);
  }
}
`,
  },
  semaforo: {
    title: 'Semáforo (módulo de 3 LEDs)',
    build(){
      return {
        comps: [{ id: 1, type: 'traffic', x: 800, y: 300, rot: 0, name: 'SEM1', props: {} }],
        wires: [
          { id: 10, a: 'C1:R', b: 'B:D10', pts: [], color: '#e53935' },
          { id: 11, a: 'C1:Y', b: 'B:D9', pts: [], color: SIG[0] },
          { id: 12, a: 'C1:G', b: 'B:D8', pts: [], color: SIG[2] },
          { id: 13, a: 'C1:GND', b: 'B:GND.1', pts: [], color: GND },
        ],
        counters: { traffic: 1 },
      };
    },
    code: `// Semáforo: el módulo ya trae las resistencias, se conecta directo a los pines.
const int ROJO = 10, AMARILLO = 9, VERDE = 8;

void luz(int r, int a, int v, int ms) {
  digitalWrite(ROJO, r); digitalWrite(AMARILLO, a); digitalWrite(VERDE, v);
  delay(ms);
}

void setup() {
  pinMode(ROJO, OUTPUT); pinMode(AMARILLO, OUTPUT); pinMode(VERDE, OUTPUT);
}

void loop() {
  luz(HIGH, LOW, LOW, 3000);   // rojo
  luz(HIGH, HIGH, LOW, 800);   // rojo + amarillo
  luz(LOW, LOW, HIGH, 3000);   // verde
  for (int i = 0; i < 3; i++) { luz(LOW, LOW, HIGH, 300); luz(LOW, LOW, LOW, 300); } // verde titila
  luz(LOW, HIGH, LOW, 1000);   // amarillo
}
`,
  },
  riego: {
    title: 'Riego automático (humedad de suelo + relé)',
    build(){
      return {
        comps: [
          { id: 1, type: 'soil', x: 760, y: 470, rot: 0, name: 'SUELO1', props: { hum: 30, threshold: 50 } },
          { id: 2, type: 'relay2', x: 880, y: 160, rot: 0, name: 'RELE1', props: { trigger: 'low' } },
        ],
        wires: [
          { id: 10, a: 'C1:VCC', b: 'B:5V', pts: [], color: RED },
          { id: 11, a: 'C1:GND', b: 'B:GND.2', pts: [], color: GND },
          { id: 12, a: 'C1:AO', b: 'B:A0', pts: [], color: SIG[2] },
          { id: 13, a: 'C2:VCC', b: 'B:5V', pts: [], color: RED },
          { id: 14, a: 'C2:GND', b: 'B:GND.1', pts: [], color: GND },
          { id: 15, a: 'C2:IN1', b: 'B:D7', pts: [], color: SIG[1] },
        ],
        counters: { soil: 1, relay2: 1 },
      };
    },
    code: `// Riego automático: si la tierra está seca se activa la bomba (relé 1).
// Cambia la humedad con el control del sensor y mira el relé y el monitor serie.
const int SENSOR = A0;
const int BOMBA = 7;      // IN1 del módulo de relés (se activa con LOW)
const int SECO = 700;     // por encima de este valor la tierra está seca

void setup() {
  pinMode(BOMBA, OUTPUT);
  digitalWrite(BOMBA, HIGH); // relé apagado
  Serial.begin(9600);
}

void loop() {
  int lectura = analogRead(SENSOR);   // seco ≈ 1023, mojado ≈ 400
  bool regar = lectura > SECO;
  digitalWrite(BOMBA, regar ? LOW : HIGH);
  Serial.print("Humedad: ");
  Serial.print(lectura);
  Serial.println(regar ? "  -> regando" : "  -> ok");
  delay(500);
}
`,
  },
  contador7: {
    title: 'Contador en TM1637 (4 dígitos)',
    build(){
      return {
        comps: [{ id: 1, type: 'tm1637', x: 820, y: 300, rot: 0, name: 'TM1', props: {} }],
        wires: [
          { id: 10, a: 'C1:CLK', b: 'B:D2', pts: [], color: SIG[0] },
          { id: 11, a: 'C1:DIO', b: 'B:D3', pts: [], color: SIG[1] },
          { id: 12, a: 'C1:VCC', b: 'B:5V', pts: [], color: RED },
          { id: 13, a: 'C1:GND', b: 'B:GND.2', pts: [], color: GND },
        ],
        counters: { tm1637: 1 },
      };
    },
    code: `// Contador en un display TM1637 de 4 dígitos (librería TM1637Display).
#include <TM1637Display.h>

TM1637Display pantalla(2, 3); // CLK, DIO
int n = 0;

void setup() {
  pantalla.setBrightness(5);
}

void loop() {
  pantalla.showNumberDecEx(n, 0b01000000, true); // con los dos puntos encendidos
  n = (n + 1) % 10000;
  delay(200);
}
`,
  },
  teclado: {
    title: 'Teclado 4x4 (librería Keypad)',
    build(){
      const w = [], rows = ['D9', 'D8', 'D7', 'D6'], cols = ['D5', 'D4', 'D3', 'D2'];
      rows.forEach((p, i) => w.push({ id: 10 + i, a: 'C1:R' + (i + 1), b: 'B:' + p, pts: [], color: SIG[0] }));
      cols.forEach((p, i) => w.push({ id: 20 + i, a: 'C1:C' + (i + 1), b: 'B:' + p, pts: [], color: SIG[1] }));
      return { comps: [{ id: 1, type: 'keypad', x: 820, y: 320, rot: 0, name: 'KP1', props: { key: -1 } }], wires: w, counters: { keypad: 1 } };
    },
    code: `// Teclado matricial 4x4: muestra cada tecla en el monitor serie.
// Haz clic (y mantén) sobre una tecla del teclado.
#include <Keypad.h>

const byte FILAS = 4, COLUMNAS = 4;
char teclas[FILAS][COLUMNAS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'}
};
byte pinesFilas[FILAS] = {9, 8, 7, 6};
byte pinesColumnas[COLUMNAS] = {5, 4, 3, 2};
Keypad teclado = Keypad(makeKeymap(teclas), pinesFilas, pinesColumnas, FILAS, COLUMNAS);

void setup() {
  Serial.begin(9600);
  Serial.println("Pulsa una tecla");
}

void loop() {
  char t = teclado.getKey();
  if (t) {
    Serial.print("Tecla: ");
    Serial.println(t);
  }
}
`,
  },
  encoder: {
    title: 'Encoder rotativo KY-040',
    build(){
      return {
        comps: [{ id: 1, type: 'encoder', x: 820, y: 300, rot: 0, name: 'ENC1', props: { pos: 0, pressed: false, contact: false, latch: false, bounce: false } }],
        wires: [
          { id: 10, a: 'C1:CLK', b: 'B:D2', pts: [], color: SIG[0] },
          { id: 11, a: 'C1:DT', b: 'B:D3', pts: [], color: SIG[1] },
          { id: 12, a: 'C1:SW', b: 'B:D4', pts: [], color: SIG[2] },
          { id: 13, a: 'C1:VCC', b: 'B:5V', pts: [], color: RED },
          { id: 14, a: 'C1:GND', b: 'B:GND.2', pts: [], color: GND },
        ],
        counters: { encoder: 1 },
      };
    },
    code: `// Encoder rotativo: gira con las flechas ↺ ↻ y pulsa la perilla para volver a cero.
const int CLK = 2, DT = 3, SW = 4;
int posicion = 0;
int ultimoClk;

void setup() {
  pinMode(CLK, INPUT);
  pinMode(DT, INPUT);
  pinMode(SW, INPUT_PULLUP);
  Serial.begin(9600);
  ultimoClk = digitalRead(CLK);
}

void loop() {
  int clk = digitalRead(CLK);
  if (clk != ultimoClk && clk == LOW) {          // flanco de bajada de CLK
    if (digitalRead(DT) != clk) posicion++;      // sentido horario
    else posicion--;                             // antihorario
    Serial.print("Posición: ");
    Serial.println(posicion);
  }
  ultimoClk = clk;
  if (digitalRead(SW) == LOW) {
    posicion = 0;
    Serial.println("Cero");
    delay(200);
  }
}
`,
  },
  controlIR: {
    title: 'Control remoto IR (IRremote)',
    build(){
      return {
        comps: [
          { id: 1, type: 'irrx', x: 800, y: 330, rot: 0, name: 'IRX1', props: {} },
          { id: 2, type: 'irremote', x: 960, y: 300, rot: 0, name: 'CTRL1', props: {} },
        ],
        wires: [
          { id: 10, a: 'C1:S', b: 'B:D11', pts: [], color: SIG[0] },
          { id: 11, a: 'C1:VCC', b: 'B:5V', pts: [], color: RED },
          { id: 12, a: 'C1:GND', b: 'B:GND.2', pts: [], color: GND },
        ],
        counters: { irrx: 1, irremote: 1 },
      };
    },
    code: `// Control remoto IR: muestra el código de cada botón y prende el LED 13 con el botón 1.
#include <IRremote.hpp>

const int RECEPTOR = 11;

void setup() {
  Serial.begin(9600);
  pinMode(LED_BUILTIN, OUTPUT);
  IrReceiver.begin(RECEPTOR);
  Serial.println("Apunta el control y pulsa un botón");
}

void loop() {
  if (IrReceiver.decode()) {
    uint8_t cmd = IrReceiver.decodedIRData.command;
    Serial.print("Código: 0x");
    Serial.println(cmd, HEX);
    if (cmd == 0x0C) digitalWrite(LED_BUILTIN, HIGH);  // botón 1
    if (cmd == 0x16) digitalWrite(LED_BUILTIN, LOW);   // botón 0
    IrReceiver.resume();
  }
}
`,
  },
  reloj: {
    title: 'Reloj DS1302 (fecha y hora)',
    build(){
      return {
        comps: [{ id: 1, type: 'ds1302', x: 820, y: 300, rot: 0, name: 'RTC1', props: {} }],
        wires: [
          { id: 10, a: 'C1:VCC', b: 'B:5V', pts: [], color: RED },
          { id: 11, a: 'C1:GND', b: 'B:GND.2', pts: [], color: GND },
          { id: 12, a: 'C1:CLK', b: 'B:D5', pts: [], color: SIG[0] },
          { id: 13, a: 'C1:DAT', b: 'B:D4', pts: [], color: SIG[1] },
          { id: 14, a: 'C1:RST', b: 'B:D2', pts: [], color: SIG[2] },
        ],
        counters: { ds1302: 1 },
      };
    },
    code: `// Reloj DS1302: muestra la fecha y la hora cada segundo (librería Rtc by Makuna).
#include <ThreeWire.h>
#include <RtcDS1302.h>

ThreeWire cables(4, 5, 2);        // DAT, CLK, RST
RtcDS1302<ThreeWire> reloj(cables);

void setup() {
  Serial.begin(9600);
  reloj.Begin();
  if (reloj.GetIsWriteProtected()) reloj.SetIsWriteProtected(false);
  if (!reloj.GetIsRunning()) reloj.SetIsRunning(true);
  RtcDateTime compilado = RtcDateTime(__DATE__, __TIME__);
  if (!reloj.IsDateTimeValid() || reloj.GetDateTime() < compilado) reloj.SetDateTime(compilado);
}

void loop() {
  RtcDateTime t = reloj.GetDateTime();
  char texto[24];
  snprintf(texto, sizeof(texto), "%02u/%02u/%04u %02u:%02u:%02u",
           t.Day(), t.Month(), t.Year(), t.Hour(), t.Minute(), t.Second());
  Serial.println(texto);
  delay(1000);
}
`,
  },
  pasoapaso: {
    title: 'Motor paso a paso 28BYJ-48 (ULN2003)',
    build(){
      return {
        comps: [{ id: 1, type: 'stepper', x: 860, y: 300, rot: 0, name: 'M1', props: {} }],
        wires: [
          { id: 10, a: 'C1:IN1', b: 'B:D8', pts: [], color: SIG[0] },
          { id: 11, a: 'C1:IN2', b: 'B:D9', pts: [], color: SIG[1] },
          { id: 12, a: 'C1:IN3', b: 'B:D10', pts: [], color: SIG[2] },
          { id: 13, a: 'C1:IN4', b: 'B:D11', pts: [], color: SIG[3] },
          { id: 14, a: 'C1:VCC', b: 'B:5V', pts: [], color: RED },
          { id: 15, a: 'C1:GND', b: 'B:GND.2', pts: [], color: GND },
        ],
        counters: { stepper: 1 },
      };
    },
    code: `// Motor 28BYJ-48: un cuarto de vuelta a cada lado (librería Stepper).
#include <Stepper.h>

const int PASOS_POR_VUELTA = 2048;
Stepper motor(PASOS_POR_VUELTA, 8, 10, 9, 11); // IN1, IN3, IN2, IN4

void setup() {
  motor.setSpeed(12);   // rpm (el 28BYJ-48 llega a unas 15)
  Serial.begin(9600);
}

void loop() {
  Serial.println("Horario 90 grados");
  motor.step(PASOS_POR_VUELTA / 4);
  delay(500);
  Serial.println("Antihorario 90 grados");
  motor.step(-PASOS_POR_VUELTA / 4);
  delay(500);
}
`,
  },
  rfid: {
    title: 'Lector RFID RC522',
    build(){
      return {
        comps: [{ id: 1, type: 'rc522', x: 840, y: 260, rot: 0, name: 'RFID1', props: { card: 'tarjeta', near: false } }],
        wires: [
          { id: 10, a: 'C1:SDA', b: 'B:D10', pts: [], color: SIG[0] },
          { id: 11, a: 'C1:SCK', b: 'B:D13', pts: [], color: SIG[1] },
          { id: 12, a: 'C1:MOSI', b: 'B:D11', pts: [], color: SIG[2] },
          { id: 13, a: 'C1:MISO', b: 'B:D12', pts: [], color: SIG[3] },
          { id: 14, a: 'C1:RST', b: 'B:D9', pts: [], color: SIG[4] },
          { id: 15, a: 'C1:GND', b: 'B:GND.2', pts: [], color: GND },
          { id: 16, a: 'C1:V33', b: 'B:3V3', pts: [], color: RED },
        ],
        counters: { rc522: 1 },
      };
    },
    code: `// Lector RFID RC522: muestra el UID de la tarjeta y abre la "puerta" (LED 13) si es la autorizada.
// Haz clic en la tarjeta para acercarla al lector. Cambia de tarjeta en el panel de propiedades.
#include <SPI.h>
#include <MFRC522.h>

MFRC522 lector(10, 9);   // SDA (SS), RST
byte autorizada[4] = {0x93, 0x3A, 0x7C, 0x1D};

void setup() {
  Serial.begin(9600);
  SPI.begin();
  lector.PCD_Init();
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.println("Acerca una tarjeta...");
}

void loop() {
  if (!lector.PICC_IsNewCardPresent() || !lector.PICC_ReadCardSerial()) return;
  Serial.print("UID:");
  bool ok = lector.uid.size == 4;
  for (byte i = 0; i < lector.uid.size; i++) {
    Serial.print(lector.uid.uidByte[i] < 0x10 ? " 0" : " ");
    Serial.print(lector.uid.uidByte[i], HEX);
    if (i < 4 && lector.uid.uidByte[i] != autorizada[i]) ok = false;
  }
  Serial.println(ok ? "  -> acceso permitido" : "  -> acceso denegado");
  digitalWrite(LED_BUILTIN, ok ? HIGH : LOW);
  lector.PICC_HaltA();
}
`,
  },
  temperatura: {
    title: 'Termómetro DS18B20 (1-Wire)',
    build(){
      return {
        comps: [
          { id: 1, type: 'ds18b20', x: 820, y: 330, rot: 0, name: 'T1', props: { temp: 23.5, pullup: false } },
          { id: 2, type: 'res', x: 900, y: 230, rot: 90, name: 'R1', props: { ohms: 4700 } },
        ],
        wires: [
          { id: 10, a: 'C1:GND', b: 'B:GND.2', pts: [], color: GND },
          { id: 11, a: 'C1:DQ', b: 'B:D2', pts: [], color: SIG[0] },
          { id: 12, a: 'C1:VDD', b: 'B:5V', pts: [], color: RED },
          { id: 13, a: 'C2:a', b: 'C1:DQ', pts: [], color: SIG[0] },
          { id: 14, a: 'C2:b', b: 'B:5V', pts: [], color: RED },
        ],
        counters: { ds18b20: 1, res: 1 },
      };
    },
    code: `// Termómetro DS18B20 (librerías OneWire y DallasTemperature).
// La línea de datos necesita una resistencia de 4,7 kΩ a 5V.
#include <OneWire.h>
#include <DallasTemperature.h>

OneWire bus(2);
DallasTemperature sensores(&bus);

void setup() {
  Serial.begin(9600);
  sensores.begin();
  Serial.print("Sensores encontrados: ");
  Serial.println(sensores.getDeviceCount());
}

void loop() {
  sensores.requestTemperatures();
  float t = sensores.getTempCByIndex(0);
  Serial.print("Temperatura: ");
  Serial.print(t);
  Serial.println(" C");
  delay(1000);
}
`,
  },
  esp32web: {
    title: 'ESP32: servidor web que prende un LED',
    board: 'esp32',
    build(){
      return {
        comps: [
          { id: 1, type: 'led', x: 720, y: 250, rot: 0, name: 'LED1', props: { color: 'verde' } },
          { id: 2, type: 'res', x: 640, y: 210, rot: 0, name: 'R1', props: { ohms: 220 } },
          { id: 3, type: 'pot', x: 140, y: 330, rot: 0, name: 'POT1', props: { ohms: 10000, pos: 0.5 } },
        ],
        wires: [
          { id: 10, a: 'B:D26', b: 'C2:a', pts: [], color: SIG[0] },
          { id: 11, a: 'C2:b', b: 'C1:a', pts: [], color: SIG[0] },
          { id: 12, a: 'C1:k', b: 'B:GND.2', pts: [], color: GND },
          { id: 13, a: 'C3:w', b: 'B:D34', pts: [], color: SIG[1] },
          { id: 14, a: 'C3:p3', b: 'B:GND.1', pts: [], color: GND },
          { id: 15, a: 'C3:p1', b: 'B:3V3', pts: [], color: RED },
        ],
        counters: { led: 1, res: 1, pot: 1 },
      };
    },
    code: `// ESP32: página web para prender y apagar un LED y ver un potenciómetro.
// La página aparece en el panel «Navegador» (el WiFi es simulado).
#include <WiFi.h>
#include <WebServer.h>

const char* RED = "MiCasa";
const char* CLAVE = "12345678";
const int LED = 26;
const int POT = 34;

WebServer server(80);
bool encendido = false;

void pagina() {
  String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width'>"
    "<style>body{font-family:sans-serif;text-align:center;padding:16px}"
    "a{display:inline-block;padding:12px 22px;margin:6px;border-radius:8px;color:#fff;text-decoration:none}"
    ".on{background:#2e7d32}.off{background:#c62828}</style></head><body>"
    "<h2>ESP32 &middot; Servidor web</h2>";
  html += "<p>LED: <b>" + String(encendido ? "ENCENDIDO" : "APAGADO") + "</b></p>";
  html += "<a class='on' href='/on'>Encender</a><a class='off' href='/off'>Apagar</a>";
  html += "<p>Potenciómetro: <b id='pot'>" + String(analogRead(POT)) + "</b> / 4095</p>";
  html += "<script>setInterval(function(){fetch('/pot').then(r=>r.text()).then(t=>document.getElementById('pot').textContent=t)},1000)</script>";
  html += "</body></html>";
  server.send(200, "text/html", html);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED, OUTPUT);
  WiFi.begin(RED, CLAVE);
  Serial.print("Conectando a ");
  Serial.print(RED);
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Conectado. IP: ");
  Serial.println(WiFi.localIP());

  server.on("/", pagina);
  server.on("/on", []() { encendido = true; digitalWrite(LED, HIGH); pagina(); });
  server.on("/off", []() { encendido = false; digitalWrite(LED, LOW); pagina(); });
  server.on("/pot", []() { server.send(200, "text/plain", String(analogRead(POT))); });
  server.begin();
}

void loop() {
  server.handleClient();
}
`,
  },
  esp32pwm: {
    title: 'ESP32: brillo con LEDC y botón BOOT',
    board: 'esp32',
    build(){ return { comps: [], wires: [], counters: {} }; },
    code: `// ESP32: el LED azul de la placa (GPIO2) se enciende y apaga suave con LEDC.
// Mantén pulsado el botón BOOT de la placa (GPIO0) para que parpadee rápido.
const int LED = 2;
const int BOOT = 0;
volatile int pulsaciones = 0;

void IRAM_ATTR alPulsar() { pulsaciones++; }

void setup() {
  Serial.begin(115200);
  ledcAttach(LED, 5000, 8);          // pin, frecuencia, resolución (API 3.x)
  pinMode(BOOT, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(BOOT), alPulsar, FALLING);
  Serial.printf("Chip %s a %u MHz\\n", ESP.getChipModel(), ESP.getCpuFreqMHz());
}

void loop() {
  bool rapido = digitalRead(BOOT) == LOW;
  for (int b = 0; b <= 255; b += 5) { ledcWrite(LED, b); delay(rapido ? 2 : 10); }
  for (int b = 255; b >= 0; b -= 5) { ledcWrite(LED, b); delay(rapido ? 2 : 10); }
  Serial.printf("Pulsaciones de BOOT: %d\\n", pulsaciones);
}
`,
  },
  esp32bt: {
    title: 'ESP32: Bluetooth con el celular',
    board: 'esp32',
    build(){ return { comps: [], wires: [], counters: {} }; },
    code: `// ESP32: escribe "1" o "0" desde el panel Celular para prender o apagar el LED azul (GPIO2).
#include <BluetoothSerial.h>

BluetoothSerial SerialBT;
const int LED = 2;

void setup() {
  Serial.begin(115200);
  pinMode(LED, OUTPUT);
  SerialBT.begin("ESP32-Banco");
  Serial.println("Bluetooth listo. Empareja el celular con ESP32-Banco");
}

void loop() {
  if (SerialBT.available()) {
    char c = SerialBT.read();
    if (c == '1') { digitalWrite(LED, HIGH); SerialBT.println("LED encendido"); }
    if (c == '0') { digitalWrite(LED, LOW); SerialBT.println("LED apagado"); }
    Serial.print("Recibido: ");
    Serial.println(c);
  }
}
`,
  },
  esp32cam: {
    title: 'ESP32-CAM: tomar fotos desde el navegador',
    board: 'esp32cam',
    build(){ return { comps: [], wires: [], counters: {} }; },
    code: `// ESP32-CAM (AI-Thinker): página con un botón para sacar una foto con flash.
// La cámara está simulada: la foto es una imagen de prueba con la resolución elegida.
#include <WiFi.h>
#include <WebServer.h>
#include "esp_camera.h"
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

const char* RED = "MiCasa";
const char* CLAVE = "12345678";
const int FLASH = 4;     // LED flash de la placa
const int LED_ROJO = 33; // LED rojo de la placa (se prende en LOW)

WebServer server(80);
int fotos = 0;

void pagina() {
  String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width'>"
    "<style>body{font-family:sans-serif;text-align:center;background:#222;color:#eee}"
    "button{font-size:18px;padding:10px 20px;margin:8px;border:0;border-radius:8px;background:#e69138;color:#fff}"
    "img{max-width:100%;border:2px solid #555;border-radius:6px}</style></head><body>"
    "<h2>ESP32-CAM</h2><img id='foto' src='/capture'><br>"
    "<button onclick=\\"document.getElementById('foto').src='/capture?t='+Date.now()\\">Tomar foto</button>"
    "<p>Fotos sacadas: <b id='n'>" + String(fotos) + "</b></p></body></html>";
  server.send(200, "text/html", html);
}

void capturar() {
  digitalWrite(FLASH, HIGH);
  delay(80);
  camera_fb_t* fb = esp_camera_fb_get();
  digitalWrite(FLASH, LOW);
  if (!fb) { server.send(500, "text/plain", "Error de la camara"); return; }
  fotos++;
  Serial.printf("Foto %d: %ux%u, %u bytes\\n", fotos, fb->width, fb->height, fb->len);
  server.sendHeader("Content-Disposition", "inline; filename=foto.jpg");
  server.send_P(200, "image/jpeg", (const char*)fb->buf, fb->len);
  esp_camera_fb_return(fb);
}

void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // desactiva el detector de baja tensión
  Serial.begin(115200);
  pinMode(FLASH, OUTPUT);
  pinMode(LED_ROJO, OUTPUT);

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = 5;  config.pin_d1 = 18; config.pin_d2 = 19; config.pin_d3 = 21;
  config.pin_d4 = 36; config.pin_d5 = 39; config.pin_d6 = 34; config.pin_d7 = 35;
  config.pin_xclk = 0; config.pin_pclk = 22; config.pin_vsync = 25; config.pin_href = 23;
  config.pin_sccb_sda = 26; config.pin_sccb_scl = 27;
  config.pin_pwdn = 32; config.pin_reset = -1;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_VGA;
  config.jpeg_quality = 12;
  config.fb_count = 1;
  if (esp_camera_init(&config) != ESP_OK) { Serial.println("No se encontro la camara"); return; }

  WiFi.begin(RED, CLAVE);
  Serial.print("Conectando");
  while (WiFi.status() != WL_CONNECTED) { delay(300); Serial.print("."); digitalWrite(LED_ROJO, !digitalRead(LED_ROJO)); }
  digitalWrite(LED_ROJO, LOW); // conectado: LED rojo fijo
  Serial.print("\\nCamara lista en http://");
  Serial.println(WiFi.localIP());

  server.on("/", pagina);
  server.on("/capture", capturar);
  server.begin();
}

void loop() {
  server.handleClient();
}
`,
  },
  esp32s3rgb: {
    title: 'ESP32-S3: LED RGB, potenciómetro y BOOT',
    board: 'esp32s3',
    build(){
      return {
        comps: [{ id: 1, type: 'pot', x: 660, y: 470, rot: 0, name: 'POT1', props: { ohms: 10000, pos: 0.5 } }],
        wires: [
          { id: 10, a: 'C1:w', b: 'B:D1', pts: [], color: SIG[1] },
          { id: 11, a: 'C1:p1', b: 'B:3V3', pts: [], color: RED },
          { id: 12, a: 'C1:p3', b: 'B:GND.3', pts: [], color: GND },
        ],
        counters: { pot: 1 },
      };
    },
    code: `// ESP32-S3: el potenciómetro (GPIO1) regula el brillo del LED RGB de la placa (GPIO48)
// y el botón BOOT (GPIO0) cambia de color.
const int POT = 1;
volatile int color = 0;
const uint8_t COLORES[][3] = { {255, 0, 0}, {0, 255, 0}, {0, 0, 255}, {255, 160, 0}, {180, 0, 255} };
const char* NOMBRES[] = { "rojo", "verde", "azul", "naranja", "violeta" };

void IRAM_ATTR cambiar() { color = (color + 1) % 5; }

void setup() {
  Serial.begin(115200);
  pinMode(0, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(0), cambiar, FALLING);
  Serial.printf("Chip: %s\\n", ESP.getChipModel());
}

void loop() {
  int lectura = analogRead(POT);            // 0-4095
  int brillo = map(lectura, 0, 4095, 0, 255);
  const uint8_t* c = COLORES[color];
  neopixelWrite(RGB_BUILTIN, c[0] * brillo / 255, c[1] * brillo / 255, c[2] * brillo / 255);
  Serial.printf("Color %s, brillo %d (pot %d)\\n", NOMBRES[color], brillo, lectura);
  delay(250);
}
`,
  },
  esp32c3: {
    title: 'ESP32-C3: LED que respira y LED RGB',
    board: 'esp32c3',
    build(){
      return {
        comps: [
          { id: 1, type: 'led', x: 150, y: 330, rot: 0, name: 'LED1', props: { color: 'amarillo' } },
          { id: 2, type: 'res', x: 230, y: 280, rot: 0, name: 'R1', props: { ohms: 220 } },
        ],
        wires: [
          { id: 10, a: 'B:D2', b: 'C2:b', pts: [], color: SIG[0] },
          { id: 11, a: 'C2:a', b: 'C1:a', pts: [], color: SIG[0] },
          { id: 12, a: 'C1:k', b: 'B:GND.2', pts: [], color: GND },
        ],
        counters: { led: 1, res: 1 },
      };
    },
    code: `// ESP32-C3: un LED en GPIO2 sube y baja de brillo con LEDC; el LED RGB de la placa (GPIO8)
// parpadea en blanco con digitalWrite(RGB_BUILTIN). Mantén pulsado BOOT (GPIO9) para pausar.
const int LED = 2;
const int BOOT = 9;
volatile int pulsaciones = 0;
void IRAM_ATTR contar() { pulsaciones++; }

void setup() {
  Serial.begin(115200);
  ledcAttach(LED, 5000, 8);          // API 3.x: pin, frecuencia, resolución
  pinMode(BOOT, INPUT_PULLUP);
  attachInterrupt(BOOT, contar, FALLING);
  Serial.printf("%s con %d núcleo\\n", ESP.getChipModel(), ESP.getChipCores());
}

void loop() {
  if (digitalRead(BOOT) == LOW) { delay(20); return; }
  for (int d = 0; d <= 255; d += 5) { ledcWrite(LED, d); delay(8); }
  digitalWrite(RGB_BUILTIN, HIGH);
  for (int d = 255; d >= 0; d -= 5) { ledcWrite(LED, d); delay(8); }
  digitalWrite(RGB_BUILTIN, LOW);
  Serial.printf("Ciclo listo, BOOT pulsado %d veces\\n", pulsaciones);
}
`,
  },
  neopixel: {
    title: 'Tira y aro NeoPixel (WS2812B)',
    build(){
      return {
        comps: [
          { id: 1, type: 'neostrip', x: 640, y: 110, rot: 0, name: 'NEO1', props: { n: 10 } },
          { id: 2, type: 'neoring', x: 820, y: 330, rot: 0, name: 'ARO1', props: { n: 10 } },
        ],
        wires: [
          { id: 10, a: 'B:D6', b: 'C1:DIN', pts: [], color: SIG[0] },
          { id: 11, a: 'B:5V', b: 'C1:VCC', pts: [], color: RED },
          { id: 12, a: 'B:GND.1', b: 'C1:GND', pts: [], color: GND },
          { id: 13, a: 'B:D5', b: 'C2:DIN', pts: [], color: SIG[1] },
          { id: 14, a: 'C1:VCC', b: 'C2:VCC', pts: [], color: RED },
          { id: 15, a: 'C1:GND', b: 'C2:GND', pts: [], color: GND },
        ],
        counters: { neostrip: 1, neoring: 1 },
      };
    },
    code: `// Tira y aro NeoPixel (WS2812B) con la librería Adafruit_NeoPixel
// La tira (pin 6) muestra un arcoíris que avanza; el aro (pin 5) una luz que gira.
// Cambia la cantidad de LED en el panel de cada componente (tira: 1 a 15, aro: 1 a 10).
#include <Adafruit_NeoPixel.h>

const int N_TIRA = 10, N_ARO = 10;
Adafruit_NeoPixel tira(N_TIRA, 6, NEO_GRB + NEO_KHZ800);
Adafruit_NeoPixel aro(N_ARO, 5, NEO_GRB + NEO_KHZ800);

void setup() {
  tira.begin();
  aro.begin();
  tira.setBrightness(80);   // 0..255: menos brillo, menos consumo
  aro.setBrightness(80);
}

uint16_t tono = 0;
int pos = 0;

void loop() {
  for (int i = 0; i < N_TIRA; i++) {
    tira.setPixelColor(i, tira.gamma32(tira.ColorHSV(tono + i * 65536L / N_TIRA)));
  }
  tira.show();

  aro.clear();
  aro.setPixelColor(pos, aro.Color(0, 120, 255));
  aro.setPixelColor((pos + N_ARO - 1) % N_ARO, aro.Color(0, 20, 60));
  aro.show();

  pos = (pos + 1) % N_ARO;
  tono += 2048;
  delay(80);
}
`,
  },
};
