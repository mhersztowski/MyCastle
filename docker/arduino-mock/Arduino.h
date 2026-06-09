#pragma once
// Arduino.h — WASM mock for Emscripten builds
// Provides the Arduino API surface mapped to JavaScript callbacks via EM_JS.

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#error "This mock is only for Emscripten/WASM builds"
#endif

#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>
#include <ctype.h>

// ── Core types ────────────────────────────────────────────────────────────────
typedef bool     boolean;
typedef uint8_t  byte;
typedef uint16_t word;

// ── Pin constants ─────────────────────────────────────────────────────────────
#define INPUT         0
#define OUTPUT        1
#define INPUT_PULLUP  2
#define INPUT_PULLDOWN 3

#define LOW  0
#define HIGH 1

// ── Math macros ───────────────────────────────────────────────────────────────
#define PI          3.1415926535897932384626433832795
#define HALF_PI     1.5707963267948966192313216916398
#define TWO_PI      6.283185307179586476925286766559
#define DEG_TO_RAD  0.017453292519943295769236907684886
#define RAD_TO_DEG  57.295779513082320876798154814105
#define EULER       2.718281828459045235360287471352

#undef  min
#undef  max
#undef  abs
template<typename T> inline T min(T a, T b) { return a < b ? a : b; }
template<typename T> inline T max(T a, T b) { return a > b ? a : b; }
template<typename T> inline T abs(T x)      { return x < 0 ? -x : x; }

#define constrain(v,lo,hi) ((v)<(lo)?(lo):((v)>(hi)?(hi):(v)))
#define sq(x)              ((x)*(x))
#define radians(deg)       ((deg)*DEG_TO_RAD)
#define degrees(rad)       ((rad)*RAD_TO_DEG)

inline long map(long v, long il, long ih, long ol, long oh) {
  return (v - il) * (oh - ol) / (ih - il) + ol;
}

// ── Bit/byte ops ──────────────────────────────────────────────────────────────
#define bitRead(v,b)       (((v)>>(b))&0x01)
#define bitSet(v,b)        ((v)|=(1UL<<(b)))
#define bitClear(v,b)      ((v)&=~(1UL<<(b)))
#define bitWrite(v,b,bv)   ((bv)?bitSet(v,b):bitClear(v,b))
#define bit(b)             (1UL<<(b))
#define lowByte(w)         ((uint8_t)((w)&0xff))
#define highByte(w)        ((uint8_t)((w)>>8))

// ── PROGMEM / Flash (no-op in WASM) ──────────────────────────────────────────
#define PROGMEM
#define F(s)                   (s)
#define PSTR(s)                (s)
#define pgm_read_byte(p)       (*(const uint8_t*)(p))
#define pgm_read_word(p)       (*(const uint16_t*)(p))
#define pgm_read_dword(p)      (*(const uint32_t*)(p))
#define pgm_read_float(p)      (*(const float*)(p))
#define strlen_P               strlen
#define strcpy_P               strcpy
#define strncpy_P              strncpy
#define strcmp_P               strcmp
#define memcpy_P               memcpy

// ── Interrupts (no-op) ────────────────────────────────────────────────────────
#define CHANGE  1
#define FALLING 2
#define RISING  3
inline void attachInterrupt(uint8_t, void(*)(), int) {}
inline void detachInterrupt(uint8_t) {}
inline void interrupts()   {}
inline void noInterrupts() {}

// ── Digital I/O ───────────────────────────────────────────────────────────────
void pinMode(uint8_t pin, uint8_t mode);
void digitalWrite(uint8_t pin, uint8_t val);
int  digitalRead(uint8_t pin);
int  digitalPinToInterrupt(uint8_t pin);

// ── Analog I/O ────────────────────────────────────────────────────────────────
int  analogRead(uint8_t pin);
void analogWrite(uint8_t pin, int val);
void analogReadResolution(uint8_t bits);
void analogWriteResolution(uint8_t bits);
void analogReference(uint8_t mode);

// ── Time ──────────────────────────────────────────────────────────────────────
unsigned long millis();
unsigned long micros();
void          delay(unsigned long ms);
void          delayMicroseconds(unsigned int us);

// ── Random ───────────────────────────────────────────────────────────────────
long random(long maxVal);
long random(long minVal, long maxVal);
void randomSeed(unsigned long seed);

// ── Characters ───────────────────────────────────────────────────────────────
inline bool isAlpha(int c)         { return isalpha(c) != 0; }
inline bool isAlphaNumeric(int c)  { return isalnum(c) != 0; }
inline bool isDigit(int c)         { return isdigit(c) != 0; }
inline bool isSpace(int c)         { return isspace(c) != 0; }
inline bool isPunct(int c)         { return ispunct(c) != 0; }
inline bool isUpperCase(int c)     { return isupper(c) != 0; }
inline bool isLowerCase(int c)     { return islower(c) != 0; }
inline bool isAscii(int c)         { return (c & 0x80) == 0; }
inline int  toUpperCase(int c)     { return toupper(c); }
inline int  toLowerCase(int c)     { return tolower(c); }

// ── Tone (no-op) ──────────────────────────────────────────────────────────────
inline void tone(uint8_t, unsigned int, unsigned long = 0) {}
inline void noTone(uint8_t) {}

// ── Shift (no-op stubs) ───────────────────────────────────────────────────────
#define LSBFIRST 0
#define MSBFIRST 1
inline uint8_t shiftIn(uint8_t, uint8_t, uint8_t)              { return 0; }
inline void    shiftOut(uint8_t, uint8_t, uint8_t, uint8_t)    {}
inline unsigned long pulseIn(uint8_t, uint8_t, unsigned long = 1000000UL) { return 0; }

// ── String & Serial ───────────────────────────────────────────────────────────
#include "WString.h"
#include "HardwareSerial.h"
#include "Wire.h"
#include "SPI.h"

// ── Exported WASM entry points (called from JS) ───────────────────────────────
extern "C" {
  // Push raw bytes into the software serial-input FIFO
  void arduino_serial_push(const char* data, int len);
  int  arduino_serial_available();
}

// ── User sketch declarations (defined in .ino → .cpp) ────────────────────────
// extern "C" so EXPORTED_FUNCTIONS=['_setup','_loop'] can find them without C++ mangling
extern "C" void setup();
extern "C" void loop();
