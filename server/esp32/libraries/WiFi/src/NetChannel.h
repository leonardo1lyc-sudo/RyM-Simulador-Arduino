// Canal interno con el simulador (Serial3 a 500 kbaud, sin pines en la placa).
// El panel Navegador envía una petición HTTP en texto; la respuesta va entre 0x02 y 0x04.
#pragma once
#include <Arduino.h>
namespace netch {
  void poll();                    // lee bytes pendientes
  bool hasRequest();              // hay una petición completa sin responder
  const char *request();          // texto de la petición (cabeceras + cuerpo)
  int requestLength();
  int &readPos();                 // posición de lectura para WiFiClient
  void respond(const uint8_t *b, size_t n); // escribe parte de la respuesta (abre con 0x02 la primera vez)
  void end();                     // cierra la respuesta (0x04) y libera la petición
  bool responding();
}
