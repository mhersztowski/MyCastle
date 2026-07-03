# MinisC — Minimal C Bytecode VM for Arduino

MinisC is a stack-based virtual machine embedded in an Arduino sketch that executes scripts compiled from a C-like language. Scripts are uploaded OTA via MQTT — no reflashing required.

## Architecture overview

```
PC (Node.js compiler)                    ESP32 (Arduino firmware)
┌────────────────────────┐               ┌─────────────────────────────┐
│  script.c              │               │  MinisVM (C++ object)       │
│    ↓ tokenize          │               │                             │
│  Token[]               │               │  registerNative("delay"...) │
│    ↓ parse             │   .mbc binary │  registerNative("gpio_w"..) │
│  AST                   │ ─────MQTT───▶ │  load(bytecode, len)        │
│    ↓ codegen           │               │  run(50000 cycles/tick)     │
│  bytecode instructions │               │                             │
│    ↓ pack              │               │  ← calls native C++ fns ←  │
│  script.mbc            │               └─────────────────────────────┘
└────────────────────────┘
```

## Language reference

### Types

| Type     | Description                          | Default |
|----------|--------------------------------------|---------|
| `int`    | 32-bit signed integer                | `0`     |
| `float`  | 32-bit IEEE-754 float                | `0.0`   |
| `bool`   | Boolean                              | `false` |
| `string` | Immutable string (max 47 chars)      | `""`    |
| `void`   | Return type only — no value          | —       |

Array variants: `int[]`, `float[]`, `bool[]`, `string[]`

### Variable declarations

```c
int x = 5;
float pi = 3.14159;
bool active = true;
string name = "sensor";

// Arrays (fixed size, max 16 elements)
int readings[8];
float temps[4];
```

### Operators

```
Arithmetic:   + - * / %
Comparison:   == != < <= > >=
Logical:      && || !
Bitwise:      & | ^ ~ << >>
Assignment:   = += -= *= /= %=
Increment:    ++ --   (prefix and postfix)
```

### Control flow

```c
// Conditionals
if (x > 10) {
    gpio_write(LED, true);
} else if (x > 5) {
    gpio_write(LED, false);
} else {
    delay(100);
}

// While loop
while (analog_read(A0) < 512) {
    delay(10);
}

// For loop
for (int i = 0; i < 8; i++) {
    readings[i] = analog_read(A0);
}

// Loop control
break;
continue;
```

### Functions

```c
// Declaration (must be at top level)
int average(int a, int b) {
    return (a + b) / 2;
}

void blink(int pin, int times) {
    for (int i = 0; i < times; i++) {
        gpio_write(pin, true);
        delay(200);
        gpio_write(pin, false);
        delay(200);
    }
}

// Calling
int avg = average(100, 200);
blink(13, 3);
```

### Type casts

```c
float f = (float)myInt;
int   i = (int)myFloat;
string s = (string)42;     // → "42"
```

### Not supported (intentional)

- Pointers, malloc/free
- `struct`, `union`, `typedef`
- `#include`, `#define`
- `switch/case`
- Variable-length arrays (size must be a literal or known-at-compile-time expression)

---

## Example script

```c
// Sensor monitor — reads ADC, publishes when threshold exceeded
int threshold = 400;
int pin_led   = 13;
int count     = 0;

int check_sensor(int pin, int limit) {
    int val = analog_read(pin);
    if (val > limit) {
        count += 1;
        mqtt_pub_int("sensor/alert", val);
        return 1;
    }
    return 0;
}

// Top-level code = implicit main loop body (runs once)
gpio_write(pin_led, false);

for (int i = 0; i < 100; i++) {
    if (check_sensor(34, threshold)) {
        gpio_write(pin_led, true);
        delay(500);
        gpio_write(pin_led, false);
    }
    delay(50);
}

mqtt_pub_int("sensor/count", count);
```

---

## Native function stdlib

Registered in `setup_vm()` of the Arduino sketch. **Order must match `natives.ts`.**

| Index | Function              | Signature                            | Description                       |
|-------|-----------------------|--------------------------------------|-----------------------------------|
| 0     | `gpio_write`          | `(int pin, bool val) → void`         | digitalWrite                      |
| 1     | `gpio_read`           | `(int pin) → int`                    | digitalRead                       |
| 2     | `analog_read`         | `(int pin) → int`                    | analogRead (0–4095)               |
| 3     | `delay`               | `(int ms) → void`                    | delay(ms)                         |
| 4     | `millis`              | `() → int`                           | millis()                          |
| 5     | `print_int`           | `(int v) → void`                     | Serial.println(int)               |
| 6     | `print_float`         | `(float v) → void`                   | Serial.println(float)             |
| 7     | `abs_i`               | `(int v) → int`                      | abs()                             |
| 8     | `abs_f`               | `(float v) → float`                  | fabsf()                           |
| 9     | `min_i`               | `(int a, int b) → int`               | min()                             |
| 10    | `max_i`               | `(int a, int b) → int`               | max()                             |
| 11    | `map_i`               | `(int v, int il, int ih, int ol, int oh) → int` | Arduino map()        |
| 12    | `constrain`           | `(int v, int lo, int hi) → int`      | constrain()                       |
| 13    | `random`              | `(int lo, int hi) → int`             | random(lo, hi)                    |
| 14    | `mqtt_pub_int`        | `(string topic, int v) → void`       | publish int telemetry             |
| 15    | `mqtt_pub_flt`        | `(string topic, float v) → void`     | publish float telemetry           |
| 16    | `mqtt_pub_str`        | `(string topic, string v) → void`    | publish string message            |
| 17    | `print_str`           | `(string v) → void`                  | Serial.print(const char*)         |

> `print_str` is appended at index 17 (not grouped with `print_int`/`print_float`)
> so indices 0–16 stay backward-compatible with already-deployed sketches — the
> native index is baked into the bytecode operand.

Reference C++ implementation for `setup_vm()`:

```cpp
Value native_print_str(Value* args, uint8_t argc) {
    // String args arrive as pool refs — resolve via activeStr(), not args[0].ref.
    Serial.print(MinisVM::activeStr(args[0]));
    return Value::makeNull();
}
// ...register in the SAME order as natives.ts (index 17):
vm.registerNative("print_str", native_print_str, 1, T_NULL);
```

> The same `MinisVM::activeStr(args[i])` call is how any string-consuming native
> (e.g. `mqtt_pub_str`) must read its string arguments — native functions receive
> only pool refs, never `char*`.

---

## Compiler usage

```bash
cd libs/MinisC/compiler
npm install
npx ts-node src/index.ts script.c                # → script.mbc
npx ts-node src/index.ts script.c --disasm       # compile + print disassembly
npx ts-node src/index.ts script.c --hex          # compile + print C hex array
npx ts-node src/index.ts script.mbc --disasm-only # disassemble existing .mbc
```

---

## VM internals

### Bytecode format (`.mbc`)

```
Header [8 bytes]:
  magic[2]      = 0x4D 0x43 ('MC')
  version[1]    = 0x01
  flags[1]      = 0x00
  global_count  = uint8
  func_count    = uint8
  reserved[2]

Int pool:    count[2] + int32_LE[] × n
Float pool:  count[2] + float32_LE[] × n
String pool: count[2] + (len[1] + bytes) × n  (NOT null-terminated)

Function table:  for each function →
  param_count[1]
  local_count[1]
  code_size[2]
  bytecode[code_size]   (jump targets = absolute offsets in prog[])
```

### Instruction format

Every instruction is **exactly 3 bytes**:
```
[opcode: 1 byte] [operand: 2 bytes, little-endian]
```

PC always advances by 3, except on jump instructions.

### Memory layout (RAM)

| Component          | Size                          |
|--------------------|-------------------------------|
| Operand stack      | 64 × 8 = 512 B                |
| Call frames        | 16 × 4 = 64 B                 |
| Global variables   | 32 × 8 = 256 B                |
| String const pool  | 32 × 48 = 1536 B              |
| String rt pool     | 8 × 48 = 384 B                |
| Array pool         | 8 × 16 × 8 = 1024 B           |
| Native registry    | 64 × 8 = 512 B                |
| **Total VM**       | **~4.4 KB**                   |

Bytecode for a 100-line script: ~400–700 B.

### Limits

| Resource               | Default limit |
|------------------------|---------------|
| Stack depth            | 64 values     |
| Call depth             | 16 frames     |
| Global variables       | 32            |
| Script functions       | 16            |
| Native functions       | 64            |
| String constants       | 32            |
| Runtime strings        | 8 (no GC — never freed) |
| Arrays                 | 8             |
| Elements per array     | 16            |
| String max length      | 47 chars      |

All limits are `#define`-overridable before including `MinisC.h`.

### Calling convention

1. Caller pushes arguments left-to-right
2. `CALL func_idx` — VM creates a new frame, args become `local[0..n-1]`
3. Extra locals initialized to `null`
4. `RETURN_VAL` — pops return value, restores sp to before args, pushes return value
5. `RETURN` — same but no return value

### String memory model

- String constants (from bytecode pool) are copied to `str_const[]` during `load()` — referenced directly, never freed
- Runtime strings (`I2S`, `F2S`, `B2S`, `STR_CAT`) use `str_rt[]` slots — **never freed in v1**
- Scripts must avoid unbounded string creation in loops

---

## Adding a new native function

1. Implement the function in your Arduino sketch:
```cpp
Value native_my_func(Value* args, uint8_t argc) {
    int result = doSomething(args[0].i);
    return Value::makeInt(result);
}
```

2. Register it in `setup_vm()`:
```cpp
vm.registerNative("my_func", native_my_func, 1, T_INT);
```

3. Add to `compiler/src/natives.ts` in the same position:
```typescript
{ name: 'my_func', argc: 1, retType: 'int' },
```

The native index in the bytecode equals the array index in `NATIVES[]`, which must match the registration order in `setup_vm()`.

---

## File structure

```
libs/MinisC/
  library.properties
  keywords.txt
  src/
    MinisC.h          umbrella include
    MinisOpcodes.h    opcode enum (3-byte instruction format)
    MinisValue.h      Value type (tagged union: int/float/bool/string/array/null)
    MinisNatives.h    NativeDef type and NativeFn typedef
    MinisVM.h         MinisVM class declaration
    MinisVM.cpp       VM implementation (~650 lines)
  examples/
    BasicScript/
      BasicScript.ino  MQTT-based script loader example
  compiler/
    package.json
    tsconfig.json
    src/
      opcodes.ts     Op enum (matches MinisOpcodes.h)
      ast.ts         AST node type definitions
      lexer.ts       Tokenizer
      parser.ts      Recursive descent parser
      codegen.ts     AST → bytecode (single-pass)
      packer.ts      Binary serialization + disassembler
      natives.ts     Native function registry (must match Arduino sketch)
      index.ts       CLI entry point
```
