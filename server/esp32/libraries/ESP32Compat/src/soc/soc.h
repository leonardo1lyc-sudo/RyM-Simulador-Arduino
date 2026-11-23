#pragma once
// Registros del ESP32: no existen en el modo compatible; las escrituras se ignoran.
#define WRITE_PERI_REG(addr, val) ((void)(addr), (void)(val))
#define READ_PERI_REG(addr) (0UL)
#define SET_PERI_REG_MASK(addr, mask) ((void)(addr))
#define CLEAR_PERI_REG_MASK(addr, mask) ((void)(addr))
