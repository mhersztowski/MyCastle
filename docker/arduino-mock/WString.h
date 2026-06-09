#pragma once
// WString.h — minimal Arduino String class for WASM builds
#include <string>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define DEC 10
#define HEX 16
#define OCT 8
#define BIN 2

// itoa/ltoa are GNU extensions not available in Emscripten — provide portable replacements
static inline void _wstr_int_to_buf(long v, char* buf, int base) {
  if (base == 10) { snprintf(buf, 32, "%ld", v); return; }
  if (base == 16) { snprintf(buf, 32, "%lx", v); return; }
  if (base == 8)  { snprintf(buf, 32, "%lo", v); return; }
  // generic base: build digit by digit
  if (v == 0) { buf[0]='0'; buf[1]=0; return; }
  const char* digits = "0123456789abcdefghijklmnopqrstuvwxyz";
  char tmp[64]; int i = 0; bool neg = (base==10 && v<0);
  unsigned long u = neg ? (unsigned long)(-v) : (unsigned long)v;
  while (u) { tmp[i++] = digits[u % base]; u /= base; }
  if (neg) tmp[i++] = '-';
  for (int j=0;j<i;j++) buf[j]=tmp[i-1-j]; buf[i]=0;
}
static inline void _wstr_uint_to_buf(unsigned long v, char* buf, int base) {
  if (base == 10) { snprintf(buf, 32, "%lu", v); return; }
  if (base == 16) { snprintf(buf, 32, "%lx", v); return; }
  if (base == 8)  { snprintf(buf, 32, "%lo", v); return; }
  if (v == 0) { buf[0]='0'; buf[1]=0; return; }
  const char* digits = "0123456789abcdefghijklmnopqrstuvwxyz";
  char tmp[64]; int i = 0;
  while (v) { tmp[i++] = digits[v % base]; v /= base; }
  for (int j=0;j<i;j++) buf[j]=tmp[i-1-j]; buf[i]=0;
}

class String {
public:
  std::string _s;

  String()                          : _s() {}
  String(const char* s)             : _s(s ? s : "") {}
  String(const String& o)           : _s(o._s) {}
  String(String&& o)                : _s(std::move(o._s)) {}
  explicit String(char c)           : _s(1, c) {}
  explicit String(unsigned char v, int base = DEC)  { char buf[32]; _wstr_uint_to_buf((unsigned long)v, buf, base); _s = buf; }
  explicit String(int v, int base = DEC)             { char buf[32]; _wstr_int_to_buf((long)v, buf, base); _s = buf; }
  explicit String(unsigned int v, int base = DEC)    { char buf[32]; _wstr_uint_to_buf((unsigned long)v, buf, base); _s = buf; }
  explicit String(long v, int base = DEC)            { char buf[32]; _wstr_int_to_buf(v, buf, base); _s = buf; }
  explicit String(unsigned long v, int base = DEC)   { char buf[32]; _wstr_uint_to_buf(v, buf, base); _s = buf; }
  explicit String(float v, int dec = 2)  { char buf[64]; snprintf(buf, sizeof(buf), "%.*f", dec, (double)v); _s = buf; }
  explicit String(double v, int dec = 2) { char buf[64]; snprintf(buf, sizeof(buf), "%.*f", dec, v); _s = buf; }

  String& operator=(const String& o) { _s = o._s; return *this; }
  String& operator=(const char* s)   { _s = s ? s : ""; return *this; }

  String  operator+(const String& o) const { String r; r._s = _s + o._s; return r; }
  String  operator+(const char* s)   const { String r; r._s = _s + (s ? s : ""); return r; }
  String& operator+=(const String& o) { _s += o._s; return *this; }
  String& operator+=(const char* s)   { _s += (s ? s : ""); return *this; }
  String& operator+=(char c)          { _s += c; return *this; }

  bool operator==(const String& o) const { return _s == o._s; }
  bool operator==(const char* s)   const { return _s == (s ? s : ""); }
  bool operator!=(const String& o) const { return _s != o._s; }
  bool operator!=(const char* s)   const { return _s != (s ? s : ""); }
  bool operator< (const String& o) const { return _s <  o._s; }
  bool operator> (const String& o) const { return _s >  o._s; }

  unsigned int length()       const { return (unsigned int)_s.size(); }
  bool         isEmpty()      const { return _s.empty(); }
  const char*  c_str()        const { return _s.c_str(); }

  char charAt(unsigned int i) const { return i < _s.size() ? _s[i] : 0; }
  char operator[](unsigned int i) const { return charAt(i); }
  char& operator[](unsigned int i) { return _s[i]; }

  int indexOf(char c, unsigned int from = 0)             const { auto p = _s.find(c, from);    return p == std::string::npos ? -1 : (int)p; }
  int indexOf(const String& s, unsigned int from = 0)    const { auto p = _s.find(s._s, from); return p == std::string::npos ? -1 : (int)p; }
  int lastIndexOf(char c)                                const { auto p = _s.rfind(c);          return p == std::string::npos ? -1 : (int)p; }
  int lastIndexOf(const String& s)                       const { auto p = _s.rfind(s._s);       return p == std::string::npos ? -1 : (int)p; }

  String substring(unsigned int from, unsigned int to) const { return String(_s.substr(from, to - from).c_str()); }
  String substring(unsigned int from)                  const { return String(_s.substr(from).c_str()); }

  bool startsWith(const String& s) const { return _s.rfind(s._s, 0) == 0; }
  bool endsWith(const String& s)   const { return _s.size() >= s._s.size() && _s.compare(_s.size() - s._s.size(), s._s.size(), s._s) == 0; }
  bool equals(const String& s)     const { return _s == s._s; }
  bool equalsIgnoreCase(const String& s) const {
    if (_s.size() != s._s.size()) return false;
    for (size_t i = 0; i < _s.size(); i++)
      if (tolower((uint8_t)_s[i]) != tolower((uint8_t)s._s[i])) return false;
    return true;
  }

  void replace(const String& from, const String& to) {
    size_t pos = 0;
    while ((pos = _s.find(from._s, pos)) != std::string::npos) {
      _s.replace(pos, from._s.size(), to._s);
      pos += to._s.size();
    }
  }
  void remove(unsigned int idx, unsigned int cnt = 1) { _s.erase(idx, cnt); }
  void trim()  { while (!_s.empty() && isspace((uint8_t)_s.front())) _s.erase(0,1); while (!_s.empty() && isspace((uint8_t)_s.back())) _s.pop_back(); }
  void toLowerCase() { for (auto& c : _s) c = tolower((uint8_t)c); }
  void toUpperCase() { for (auto& c : _s) c = toupper((uint8_t)c); }
  void concat(const String& o) { _s += o._s; }
  void concat(const char* s)   { _s += (s ? s : ""); }
  void concat(char c)          { _s += c; }

  long  toInt()    const { return atol(_s.c_str()); }
  float toFloat()  const { return (float)atof(_s.c_str()); }
  double toDouble()const { return atof(_s.c_str()); }

  void getBytes(unsigned char* buf, unsigned int bufsize, unsigned int idx = 0) const {
    if (!bufsize) return;
    unsigned int len = _s.size() - idx;
    if (len >= bufsize) len = bufsize - 1;
    memcpy(buf, _s.c_str() + idx, len);
    buf[len] = 0;
  }
  void toCharArray(char* buf, unsigned int bufsize, unsigned int idx = 0) const {
    getBytes((unsigned char*)buf, bufsize, idx);
  }

  operator bool() const { return !_s.empty(); }
};

inline String operator+(const char* l, const String& r) {
  String s(l); s += r; return s;
}
