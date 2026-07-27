// Arduino.cpp — WASM implementation of Arduino API
// All hardware calls bridge to JavaScript via EM_JS macros.
// The JS side sets callbacks on the Module object:
//   Module.onSerialOutput(str)           — called for Serial.print/write
//   Module.onPinMode(pin, mode)          — called for pinMode
//   Module.onDigitalWrite(pin, val)      — called for digitalWrite
//   Module.onDigitalRead(pin) → int      — called for digitalRead (return 0/1)
//   Module.onAnalogWrite(pin, val)       — called for analogWrite
//   Module.onAnalogRead(pin) → int       — called for analogRead (0-1023)

#include "Arduino.h"
#include <emscripten.h>
#include <deque>
#include <string>

// ── EM_JS bridge functions ────────────────────────────────────────────────────

EM_JS(void, em_pin_mode, (int pin, int mode), {
  if (typeof Module.onPinMode === 'function') Module.onPinMode(pin, mode);
});

EM_JS(void, em_digital_write, (int pin, int val), {
  if (typeof Module.onDigitalWrite === 'function') Module.onDigitalWrite(pin, val);
});

EM_JS(int, em_digital_read, (int pin), {
  if (typeof Module.onDigitalRead === 'function') return Module.onDigitalRead(pin)|0;
  return 0;
});

EM_JS(void, em_analog_write, (int pin, int val), {
  if (typeof Module.onAnalogWrite === 'function') Module.onAnalogWrite(pin, val);
});

EM_JS(int, em_analog_read, (int pin), {
  if (typeof Module.onAnalogRead === 'function') return Module.onAnalogRead(pin)|0;
  return 0;
});

EM_JS(void, em_serial_output, (const char* s), {
  if (typeof Module.onSerialOutput === 'function') Module.onSerialOutput(UTF8ToString(s));
});

// ── Serial input FIFO ─────────────────────────────────────────────────────────
static std::deque<char> g_serial_in;
static int g_peek_cache = -1;

extern "C" {

void arduino_serial_push(const char* data, int len) {
  for (int i = 0; i < len; i++) {
    g_serial_in.push_back(data[i]);
  }
}

int arduino_serial_available() {
  return (int)g_serial_in.size();
}

} // extern "C"

// ── Display / canvas bridge ───────────────────────────────────────────────────
// Blit an RGBA8888 framebuffer to the browser <canvas>. The byte order in WASM
// (little-endian) for a uint32 packed as (r | g<<8 | b<<16 | a<<24) is r,g,b,a —
// exactly what ImageData expects, so the JS side can putImageData() directly.
EM_JS(void, em_canvas_present, (const uint32_t* ptr, int w, int h), {
  if (typeof Module.onCanvasPresent !== 'function') return;
  var bytes = w * h * 4;
  // Widok na stertę zamiast kopii — przy 60 FPS kopiowanie całego framebuffera
  // co klatkę to czysta strata. Odbiorca MUSI zużyć dane synchronicznie
  // (renderer wrzuca je od razu do tekstury); gdy trzyma je na później,
  // sam robi kopię — patrz `pendingFrameRef` w CppWasmRuntime.
  var data = HEAPU8.subarray(ptr, ptr + bytes);
  Module.onCanvasPresent(data, w, h);
});

struct MinisPointerEvent { int type; int x; int y; };
static std::deque<MinisPointerEvent> g_canvas_events;

extern "C" {

void minis_canvas_present(const uint32_t* pixels, int width, int height) {
  em_canvas_present(pixels, width, height);
}

void minis_canvas_push_event(int type, int x, int y) {
  g_canvas_events.push_back({ type, x, y });
}

int minis_canvas_poll(int* type, int* x, int* y) {
  if (g_canvas_events.empty()) return 0;
  MinisPointerEvent e = g_canvas_events.front();
  g_canvas_events.pop_front();
  if (type) *type = e.type;
  if (x)    *x = e.x;
  if (y)    *y = e.y;
  return 1;
}

} // extern "C"

// ── Digital I/O ───────────────────────────────────────────────────────────────
void pinMode(uint8_t pin, uint8_t mode) { em_pin_mode(pin, mode); }
void digitalWrite(uint8_t pin, uint8_t val) { em_digital_write(pin, val); }
int  digitalRead(uint8_t pin)    { return em_digital_read(pin); }
int  digitalPinToInterrupt(uint8_t pin) { return pin; }

// ── Analog I/O ────────────────────────────────────────────────────────────────
int  analogRead(uint8_t pin)     { return em_analog_read(pin); }
void analogWrite(uint8_t pin, int val) { em_analog_write(pin, val); }
void analogReadResolution(uint8_t)  {}
void analogWriteResolution(uint8_t) {}
void analogReference(uint8_t)       {}

// ── Time ──────────────────────────────────────────────────────────────────────
static double g_start_ms = 0.0;

unsigned long millis() {
  if (g_start_ms == 0.0) g_start_ms = emscripten_get_now();
  return (unsigned long)(emscripten_get_now() - g_start_ms);
}

unsigned long micros() {
  if (g_start_ms == 0.0) g_start_ms = emscripten_get_now();
  return (unsigned long)((emscripten_get_now() - g_start_ms) * 1000.0);
}

// delay() suspends the WASM coroutine via Asyncify — requires -s ASYNCIFY=1
void delay(unsigned long ms) {
  emscripten_sleep(ms);
}

void delayMicroseconds(unsigned int us) {
  if (us >= 1000) emscripten_sleep(us / 1000);
  // Sub-millisecond delays are just yielded — no true µs sleep in browser
}

// ── Random ───────────────────────────────────────────────────────────────────
long random(long maxVal)              { return rand() % maxVal; }
long random(long minVal, long maxVal) { return minVal + rand() % (maxVal - minVal); }
void randomSeed(unsigned long seed)   { srand((unsigned int)seed); }

// ── HardwareSerial ───────────────────────────────────────────────────────────

size_t HardwareSerial::print(const char* s) {
  if (!s) return 0;
  em_serial_output(s);
  return strlen(s);
}

size_t HardwareSerial::print(char c) {
  char buf[2] = { c, 0 };
  em_serial_output(buf);
  return 1;
}

static void itoa_base(long v, char* buf, int base) {
  if (base == 10) { snprintf(buf, 32, "%ld", v); return; }
  if (base == 16) { snprintf(buf, 32, "%lx", v); return; }
  if (base == 8)  { snprintf(buf, 32, "%lo", v); return; }
  // BIN
  if (v == 0) { strcpy(buf, "0"); return; }
  char tmp[65]; int i = 0;
  unsigned long uv = (unsigned long)v;
  while (uv) { tmp[i++] = (uv & 1) ? '1' : '0'; uv >>= 1; }
  for (int j = 0; j < i; j++) buf[j] = tmp[i-1-j];
  buf[i] = 0;
}

size_t HardwareSerial::print(int n, int base) {
  char buf[64]; itoa_base(n, buf, base); return print(buf);
}
size_t HardwareSerial::print(unsigned int n, int base) {
  char buf[64]; snprintf(buf, sizeof(buf), (base==16?"%x":"%u"), n); return print(buf);
}
size_t HardwareSerial::print(long n, int base) {
  char buf[64]; itoa_base(n, buf, base); return print(buf);
}
size_t HardwareSerial::print(unsigned long n, int base) {
  char buf[64]; snprintf(buf, sizeof(buf), (base==16?"%lx":"%lu"), n); return print(buf);
}
size_t HardwareSerial::print(double n, int digits) {
  char buf[64]; snprintf(buf, sizeof(buf), "%.*f", digits, n); return print(buf);
}

size_t HardwareSerial::write(uint8_t b) {
  char buf[2] = { (char)b, 0 };
  em_serial_output(buf);
  return 1;
}

size_t HardwareSerial::write(const uint8_t* buf, size_t size) {
  std::string s((const char*)buf, size);
  em_serial_output(s.c_str());
  return size;
}

int HardwareSerial::available() {
  return (int)g_serial_in.size();
}

int HardwareSerial::read() {
  if (g_serial_in.empty()) return -1;
  char c = g_serial_in.front();
  g_serial_in.pop_front();
  return (unsigned char)c;
}

int HardwareSerial::peek() {
  if (g_serial_in.empty()) return -1;
  return (unsigned char)g_serial_in.front();
}

String HardwareSerial::readString() {
  std::string s;
  while (!g_serial_in.empty()) {
    s += g_serial_in.front();
    g_serial_in.pop_front();
  }
  return String(s.c_str());
}

String HardwareSerial::readStringUntil(char term) {
  std::string s;
  while (!g_serial_in.empty()) {
    char c = g_serial_in.front();
    g_serial_in.pop_front();
    if (c == term) break;
    s += c;
  }
  return String(s.c_str());
}

int HardwareSerial::readBytes(char* buf, int length) {
  int n = 0;
  while (n < length && !g_serial_in.empty()) {
    buf[n++] = g_serial_in.front();
    g_serial_in.pop_front();
  }
  return n;
}

int HardwareSerial::readBytesUntil(char term, char* buf, int length) {
  int n = 0;
  while (n < length && !g_serial_in.empty()) {
    char c = g_serial_in.front();
    g_serial_in.pop_front();
    if (c == term) break;
    buf[n++] = c;
  }
  return n;
}

// ── stdio unbuffering ─────────────────────────────────────────────────────────
// Emscripten may use full buffering for stdout when not connected to a real tty.
// Force unbuffered mode so printf() immediately triggers Module.print callback.
__attribute__((constructor))
static void _arduino_stdio_init() {
  setvbuf(stdout, NULL, _IONBF, 0);
  setvbuf(stderr, NULL, _IONBF, 0);
}

// ── Global instances ──────────────────────────────────────────────────────────
HardwareSerial Serial;
HardwareSerial Serial1;
HardwareSerial Serial2;

TwoWire Wire;
TwoWire Wire1;

SPIClass SPI;
