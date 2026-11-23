#include "BluetoothSerial.h"
bool BluetoothSerial::begin(const String &name, bool) { Serial1.begin(115200); _on = true; esp32_net_event("B", name.c_str()); return true; }
