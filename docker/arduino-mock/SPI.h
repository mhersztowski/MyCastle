#pragma once
// SPI.h — SPI stub for WASM builds
#include <stdint.h>
#include <stddef.h>

#define SPI_MODE0 0
#define SPI_MODE1 1
#define SPI_MODE2 2
#define SPI_MODE3 3

struct SPISettings {
  SPISettings() {}
  SPISettings(uint32_t, uint8_t, uint8_t) {}
};

class SPIClass {
public:
  void begin()                  {}
  void begin(uint8_t, uint8_t, uint8_t, uint8_t) {}
  void end()                    {}
  void beginTransaction(SPISettings) {}
  void endTransaction()         {}
  uint8_t transfer(uint8_t)     { return 0; }
  uint16_t transfer16(uint16_t) { return 0; }
  void transfer(void*, size_t)  {}
  void setBitOrder(uint8_t)     {}
  void setDataMode(uint8_t)     {}
  void setClockDivider(uint8_t) {}
};

extern SPIClass SPI;
