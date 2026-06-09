#pragma once
// Wire.h — I2C stub for WASM builds
#include <stdint.h>
#include <stddef.h>

class TwoWire {
public:
  void begin()                      {}
  void begin(uint8_t addr)          { (void)addr; }
  void begin(int addr)              { (void)addr; }
  void setClock(uint32_t freq)      { (void)freq; }
  void beginTransmission(uint8_t)   {}
  void beginTransmission(int)       {}
  uint8_t endTransmission(bool = true) { return 4; } // 4 = other error (not connected)
  uint8_t requestFrom(uint8_t, uint8_t, bool = true) { return 0; }
  uint8_t requestFrom(int, int)     { return 0; }
  size_t  write(uint8_t)            { return 1; }
  size_t  write(const uint8_t*, size_t n) { return n; }
  int     available()               { return 0; }
  int     read()                    { return -1; }
  int     peek()                    { return -1; }
  void    flush()                   {}
  void    onReceive(void(*)(int))   {}
  void    onRequest(void(*)())      {}
};

extern TwoWire Wire;
extern TwoWire Wire1;
