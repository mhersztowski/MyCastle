#pragma once
// HardwareSerial.h — Arduino Serial mock for WASM/Emscripten builds
// All output goes to JavaScript via EM_JS callbacks set on the Module object.
// Serial input is fed from JS by calling arduino_serial_push().

#include <stdint.h>
#include <stddef.h>
#include <string>
#include "WString.h"

class HardwareSerial {
public:
  void begin(unsigned long baud) { (void)baud; }
  void end() {}

  // ── Output ────────────────────────────────────────────────────────────────
  size_t print(const char* s);
  size_t print(char c);
  size_t print(int n, int base = 10);
  size_t print(unsigned int n, int base = 10);
  size_t print(long n, int base = 10);
  size_t print(unsigned long n, int base = 10);
  size_t print(double n, int digits = 2);
  size_t print(const String& s)         { return print(s.c_str()); }

  size_t println(const char* s)         { size_t r = print(s); r += print("\r\n"); return r; }
  size_t println(char c)                { size_t r = print(c); r += print("\r\n"); return r; }
  size_t println(int n, int base = 10)  { size_t r = print(n, base); r += print("\r\n"); return r; }
  size_t println(unsigned int n, int base = 10) { size_t r = print(n, base); r += print("\r\n"); return r; }
  size_t println(long n, int base = 10) { size_t r = print(n, base); r += print("\r\n"); return r; }
  size_t println(unsigned long n, int base = 10) { size_t r = print(n, base); r += print("\r\n"); return r; }
  size_t println(double n, int digits = 2) { size_t r = print(n, digits); r += print("\r\n"); return r; }
  size_t println(const String& s)       { return println(s.c_str()); }
  size_t println()                      { return print("\r\n"); }

  // ── Input ─────────────────────────────────────────────────────────────────
  int  available();
  int  read();
  int  peek();
  void flush() {}

  // Read until timeout (returns what's in the buffer)
  String readString();
  String readStringUntil(char terminator);
  int    readBytes(char* buf, int length);
  int    readBytesUntil(char terminator, char* buf, int length);

  void   setTimeout(unsigned long ms) { (void)ms; }

  // ── Write raw bytes ───────────────────────────────────────────────────────
  size_t write(uint8_t b);
  size_t write(const uint8_t* buf, size_t size);

  operator bool() const { return true; }
};

extern HardwareSerial Serial;
extern HardwareSerial Serial1;
extern HardwareSerial Serial2;
