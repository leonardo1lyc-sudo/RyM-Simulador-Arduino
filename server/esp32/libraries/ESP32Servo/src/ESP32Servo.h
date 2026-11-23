// ESP32Servo (modo compatible): misma API, implementada con la librería Servo.
#pragma once
#include <Arduino.h>
#include <Servo.h>
#define setPeriodHertz(hz) attached()
class ESP32PWM {
public:
  static void allocateTimer(int) {}
  static bool hasPwm(int) { return true; }
  void attachPin(uint8_t pin, double freq, uint8_t res = 10) { ledcAttach(pin, (uint32_t)freq, res); _pin = pin; _res = res; }
  void writeScaled(double v) { ledcWrite(_pin, (uint32_t)(v * ((1UL << _res) - 1))); }
  void write(uint32_t duty) { ledcWrite(_pin, duty); }
  void detachPin(int pin) { ledcDetach(pin); }
private:
  uint8_t _pin = 0, _res = 10;
};
