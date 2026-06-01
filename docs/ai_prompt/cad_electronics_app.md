# AI Prompt: Electronics — Writing `.elec.json` schematic files

You are writing electronics schematic files for the **Electronics** tab of `app/cad-app`.
The canvas renders an interactive breadboard-style diagram using SVG.
Files use the `ElectronicsSchema` format stored as `.elec.json` on the CAD server.

---

## File identity

| Field | Value |
|-------|-------|
| Extension | `.elec.json` |
| Server path | `/users/{userId}/projects/{name}.elec.json` |
| Format root | `ElectronicsSchema` |

An electronics file is independent of `.cad.json` and `.scene.json` — it does not share data with the CAD or Scene 3D tabs.

---

## Top-level structure

```json
{
  "version": 1,
  "components": [ /* ComponentPlacement[] */ ],
  "wires": [ /* Wire[] */ ]
}
```

- `version` is the integer `1` (not a string).
- `components` — placed parts on the canvas.
- `wires` — polylines connecting component pins.

---

## Grid system

All positions and sizes use **grid units**. One grid unit = one breadboard hole pitch = 2.54 mm real scale. The canvas is rendered at 20 px/grid unit internally, but you always work in grid units.

- The canvas coordinate system has **X → right**, **Y → down** (SVG convention).
- The canvas is arbitrarily large — place components at any positive grid coordinates.
- Typical canvas origin is near `(0, 0)`. Leave a small margin (1–2 units) from the edge.

---

## `ComponentPlacement` — placing a part

```json
{
  "id": "unique-string",
  "partId": "resistor",
  "x": 10,
  "y": 5,
  "rotation": 0,
  "showPinLabels": false,
  "userLabel": "R1 330Ω"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Must be unique across all components in the file |
| `partId` | string | yes | Must match an ID from the Part Library (see below) |
| `x` | number | yes | Top-left anchor, grid units — X axis |
| `y` | number | yes | Top-left anchor, grid units — Y axis |
| `rotation` | number | yes | Degrees, clockwise, SVG y-down frame. Use `0`, `90`, `180`, or `270`. |
| `showPinLabels` | bool | no | Renders pin labels on the canvas. Default `false`. Set `true` for sensor/IC modules to show signal names. |
| `userLabel` | string | no | Free-text annotation above the component (e.g. `"R1 330Ω"`, `"U1"`, `"LED D1"`) |

### Rotation behaviour

Rotation rotates the component **clockwise** around its top-left anchor.
After rotation the bounding box is re-anchored so the visual top-left stays at `(x, y)`.
For most layouts use `rotation: 0`. Use `rotation: 90` to orient resistors/capacitors vertically.

---

## `Wire` — connecting pins

```json
{
  "id": "unique-string",
  "points": [
    { "x": 14.5, "y": 5.5 },
    { "x": 20.5, "y": 5.5 }
  ],
  "color": "#ef5350"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Must be unique across all wires in the file |
| `points` | `WirePoint[]` | Ordered waypoints in grid units. Minimum 2 points. |
| `color` | string | Hex color. Use a color from the Wire Colors palette (see below). |

### Wire Colors palette

Use these colors by convention:

| Color | Hex | Typical use |
|-------|-----|-------------|
| Red | `#ef5350` | VCC / power |
| Black | `#000000` | GND |
| Blue | `#42a5f5` | Digital signal |
| Green | `#66bb6a` | Data / I2C SDA |
| Orange | `#ffa726` | Analog signal |
| Yellow | `#ffee58` | I2C SCL / clock |
| Cyan | `#26c6da` | PWM / second data |
| Purple | `#ab47bc` | Special / interrupt |
| White | `#ffffff` | General / misc |

### Computing wire endpoints (pin world coordinates)

A wire must start and end exactly at a **pin world center**. For rotation `0`:

```
pin_world_x = component.x + pin.x + 0.5
pin_world_y = component.y + pin.y + 0.5
```

The `+ 0.5` centers the wire endpoint in the pin's grid cell.

For non-zero rotation, the formula is more complex (apply clockwise rotation matrix then add the bounding-box re-anchor offset). Keep `rotation: 0` unless you specifically need a rotated part, and the math stays simple.

Wire segments should be **orthogonal** (horizontal or vertical) where possible. Add intermediate waypoints to route around other components:

```json
"points": [
  { "x": 14.5, "y": 5.5 },
  { "x": 14.5, "y": 3.0 },
  { "x": 20.5, "y": 3.0 },
  { "x": 20.5, "y": 7.5 }
]
```

---

## Part Library — all available `partId` values

### Boards

#### `breadboard-830`
830-point solderless breadboard with power rails.
Size: **65 × 17** grid units.

```
Power rail pins (grid coords from top-left):
  vcc-top-l  (1, 0)   gnd-top-l  (1, 1)
  vcc-top-r  (63, 0)  gnd-top-r  (63, 1)
  vcc-bot-l  (1, 15)  gnd-bot-l  (1, 16)
  vcc-bot-r  (63, 15) gnd-bot-r  (63, 16)
```

The breadboard hole grid snaps automatically in the editor. For wires, use any `.5`-offset grid point inside the main area (rows a–e: y ≈ 3–7, rows f–j: y ≈ 9–13, 1-indexed from component top-left).

---

### Microcontrollers

#### `arduino-nano`
ATmega328P Arduino Nano, DIP package.
Size: **4 × 15** grid units.
Left pins (x=0), right pins (x=3), y = 0–14.

| Row (y) | Left pin (x=0) | Right pin (x=3) |
|---------|---------------|-----------------|
| 0 | TX1 | D13 |
| 1 | RX0 | 3V3 |
| 2 | RST | REF |
| 3 | GND | A0 |
| 4 | D2 | A1 |
| 5 | D3 | A2 |
| 6 | D4 | A3 |
| 7 | D5 | A4 |
| 8 | D6 | A5 |
| 9 | D7 | A6 |
| 10 | D8 | A7 |
| 11 | D9 | 5V |
| 12 | D10 | RST |
| 13 | D11 | GND |
| 14 | D12 | VIN |

#### `esp32-devkit`
ESP32 dual-core Wi-Fi/BT, 38-pin DIP.
Size: **4 × 19** grid units.
Left pins (x=0), right pins (x=3), y = 0–18.

| Row (y) | Left pin (x=0) | Right pin (x=3) |
|---------|---------------|-----------------|
| 0 | 3V3 | GND |
| 1 | EN | D23 |
| 2 | VP (input-only) | D22 |
| 3 | VN (input-only) | TX0 |
| 4 | D34 | RX0 |
| 5 | D35 | D21 |
| 6 | D32 | D19 |
| 7 | D33 | D18 |
| 8 | D25 | D5 |
| 9 | D26 | D17 |
| 10 | D27 | D16 |
| 11 | D14 | D4 |
| 12 | D12 | D0 |
| 13 | D13 | D2 |
| 14 | GND | D15 |
| 15 | D15 | D8 |
| 16 | D2 | D7 |
| 17 | D4 | D6 |
| 18 | RX2 | D5 |

#### `wemos-d1-mini`
ESP8266 Wi-Fi development board, DIP.
Size: **4 × 8** grid units.
Left pins (x=0), right pins (x=3), y = 0–7.

| Row (y) | Left pin (x=0) | Right pin (x=3) |
|---------|---------------|-----------------|
| 0 | RST | TX |
| 1 | A0 | RX |
| 2 | D0 | D1 |
| 3 | D5 | D2 |
| 4 | D6 | D3 |
| 5 | D7 | D4 |
| 6 | D8 | GND |
| 7 | 3V3 | 5V |

#### `esp32-s3-pico`
ESP32-S3 Pico dev board, wide DIP.
Size: **7 × 20** grid units.
Left pins (x=0), right pins (x=6), y = 0–19.

| Row (y) | Left pin (x=0) | Right pin (x=6) |
|---------|---------------|-----------------|
| 0 | GP11 | VBUS |
| 1 | GP12 | VSYS |
| 2 | GND | GND |
| 3 | GP13 | 3V3_EN |
| 4 | GP14 | 3V3(OUT) |
| 5 | GP15 | GP10 |
| 6 | GP16 | GP9 |
| 7 | GND | GND |
| 8 | GP17 | GP8 |
| 9 | GP18 | GP7 |
| 10 | GP33 | RUN |
| 11 | GP34 | GP6 |
| 12 | GND | GND |
| 13 | GP35 | GP5 |
| 14 | GP36 | GP4 |
| 15 | GP37 | GP2 |
| 16 | GP38 | GP1 |
| 17 | GND | GND |
| 18 | GP39 | GP41 |
| 19 | GP40 | GP42 |

---

### Passive components

#### `resistor`
Generic through-hole axial resistor.
Size: **5 × 1** grid units.

| Pin id | x | y | Label |
|--------|---|---|-------|
| p1 | 0 | 0 | P1 |
| p2 | 4 | 0 | P2 |

#### `capacitor-ceramic`
Ceramic disc capacitor (non-polarized).
Size: **3 × 1** grid units.

| Pin id | x | y | Label |
|--------|---|---|-------|
| p1 | 0 | 0 | 1 |
| p2 | 2 | 0 | 2 |

#### `potentiometer`
Single-turn through-hole potentiometer.
Size: **5 × 3** grid units.

| Pin id | x | y | Label |
|--------|---|---|-------|
| p1 | 1 | 2 | P1 |
| wiper | 2 | 2 | W |
| p2 | 3 | 2 | P2 |

---

### Active components

#### `led-red` / `led-green` / `led-blue`
5mm through-hole LED. Size: **3 × 1** grid units.
Current flows from anode (+) to cathode (−).

| Pin id | x | y | Label |
|--------|---|---|-------|
| cathode | 0 | 0 | − |
| anode | 2 | 0 | + |

Typical use: connect anode through a 330Ω resistor to the MCU pin, cathode to GND.

#### `push-button`
6mm tactile push button, 4-pin (A1/A2 = one side, B1/B2 = other side).
Size: **3 × 3** grid units.

| Pin id | x | y | Notes |
|--------|---|---|-------|
| a1 | 0 | 0 | Side A |
| a2 | 2 | 0 | Side A |
| b1 | 0 | 2 | Side B |
| b2 | 2 | 2 | Side B |

A1 and A2 are internally connected; B1 and B2 are internally connected. Pressing the button bridges A to B.

#### `npn-transistor`
Generic NPN BJT (TO-92, e.g. 2N2222, BC547).
Size: **3 × 2** grid units.

| Pin id | x | y | Label |
|--------|---|---|-------|
| emitter | 0 | 1 | E |
| base | 1 | 1 | B |
| collector | 2 | 1 | C |

#### `joystick-ps`
2-axis analog thumbstick module with button (KY-023).
Size: **5 × 6** grid units.
All 5 pins on the bottom edge at y=5.

| Pin id | x | y | Label |
|--------|---|---|-------|
| gnd | 0 | 5 | GND |
| vcc | 1 | 5 | +5V |
| vrx | 2 | 5 | VRx |
| vry | 3 | 5 | VRy |
| sw | 4 | 5 | SW |

---

### Sensors

#### `dht22`
DHT22 temperature & humidity sensor.
Size: **4 × 5** grid units. All pins on the left (x=0).

| Pin id | x | y | Label |
|--------|---|---|-------|
| vcc | 0 | 1 | VCC |
| data | 0 | 2 | DATA |
| nc | 0 | 3 | NC |
| gnd | 0 | 4 | GND |

#### `dht11`
DHT11 temperature & humidity sensor.
Size: **4 × 5** grid units. All pins on the left (x=0).

| Pin id | x | y | Label |
|--------|---|---|-------|
| VCC | 0 | 1 | VCC |
| DATA | 0 | 2 | DATA |
| NC | 0 | 3 | NC |
| GND | 0 | 4 | GND |

#### `hc_sr04`
HC-SR04 ultrasonic distance sensor.
Size: **4 × 5** grid units. All pins on the left (x=0).

| Pin id | x | y | Label |
|--------|---|---|-------|
| VCC | 0 | 1 | VCC |
| TRIG | 0 | 2 | TRIG |
| ECHO | 0 | 3 | ECHO |
| GND | 0 | 4 | GND |

#### `ky_018`
KY-018 photoresistor sensor.
Size: **4 × 5** grid units. All pins on the left (x=0).

| Pin id | x | y | Label |
|--------|---|---|-------|
| S | 0 | 1 | S (signal) |
| VCC | 0 | 2 | VCC |
| GND | 0 | 3 | GND |

#### `tcrt5000`
TCRT5000 IR reflective sensor.
Size: **4 × 5** grid units. All pins on the left (x=0).

| Pin id | x | y | Label |
|--------|---|---|-------|
| A0 | 0 | 1 | A0 |
| D0 | 0 | 2 | D0 |
| GND | 0 | 3 | GND |
| VCC | 0 | 4 | VCC |

#### `ath20_bmp280`
ATH20 + BMP280 combined temperature/humidity/pressure sensor. I2C interface.
Size: **4 × 5** grid units. All pins on the left (x=0).

| Pin id | x | y | Label |
|--------|---|---|-------|
| VCC | 0 | 1 | VCC |
| SDA | 0 | 2 | SDA |
| GND | 0 | 3 | GND |
| SCL | 0 | 4 | SCL |

---

### Displays

#### `oled-i2c`
0.96" OLED display, I2C, 128×64. 4-pin header at bottom edge.
Size: **6 × 8** grid units.

| Pin id | x | y | Label |
|--------|---|---|-------|
| gnd | 1 | 7 | GND |
| vcc | 2 | 7 | VCC |
| scl | 3 | 7 | SCL |
| sda | 4 | 7 | SDA |

#### `lcd1602i2c`
LCD 16×2 display, I2C interface. 4-pin header at bottom edge.
Size: **6 × 8** grid units.

| Pin id | x | y | Label |
|--------|---|---|-------|
| SCL | 1 | 7 | SCL |
| SDA | 2 | 7 | SDA |
| VCC | 3 | 7 | VCC |
| GND | 4 | 7 | GND |

#### `max72198`
MAX7219 8×8 LED matrix driver. SPI interface.
Size: **5 × 5** grid units. All pins on the left (x=0).

| Pin id | x | y | Label |
|--------|---|---|-------|
| CLK | 0 | 1 | CLK |
| CS | 0 | 2 | CS |
| DIN | 0 | 3 | DIN |
| GND | 0 | 4 | GND |
| VCC | 0 | 5 | VCC |

---

## Pin world coordinate calculation

For a component placed at `(cx, cy)` with `rotation: 0`, the wire endpoint for a pin at local `(px, py)` is:

```
wire_x = cx + px + 0.5
wire_y = cy + py + 0.5
```

**Example:** `arduino-nano` placed at `(5, 2)`. The D2 pin is at row y=4, x=0 (left side):
```
wire_x = 5 + 0 + 0.5 = 5.5
wire_y = 2 + 4 + 0.5 = 6.5
```

For the right side of `arduino-nano` (x = width−1 = 3), D13 at row y=0:
```
wire_x = 5 + 3 + 0.5 = 8.5
wire_y = 2 + 0 + 0.5 = 2.5
```

For sensors/ICs with all pins on the left edge (x=0), pin at y=2:
```
component at (20, 5)  →  wire endpoint: (20.5, 7.5)
```

---

## Layout guidelines

### Spacing between components

- Leave at least 1–2 grid units between component bodies.
- DIP microcontrollers are 4 units wide — they straddle a breadboard gap naturally when `x` aligns with the gap.
- Sensor modules (4 wide) should be placed to the right of the MCU with a gap of 2+ units.

### Typical layout pattern

```
┌──────────────────────────────────────────────────────────────────┐
│  MCU (x=5, y=5)      Sensors/modules (x=20+, y=5)               │
│  [arduino-nano]      [dht22]  [oled-i2c]                         │
│                                                                   │
│  Passives inline with signal paths (x between MCU and modules)   │
│  [resistor]  [led]                                               │
│                                                                   │
│  Power/GND wires along top and bottom                            │
└──────────────────────────────────────────────────────────────────┘
```

### Wire routing

- Route power (VCC/GND) first — horizontal wires near top/bottom.
- Route signal wires as short L-shaped paths: go vertical to clear the component, then horizontal.
- Use intermediate waypoints to avoid crossing component bodies visually.

---

## Complete example: Arduino Nano + LED + resistor

LED blink circuit: Arduino D2 → 330Ω resistor → LED anode → LED cathode → GND.

```json
{
  "version": 1,
  "components": [
    {
      "id": "nano1",
      "partId": "arduino-nano",
      "x": 5, "y": 3,
      "rotation": 0,
      "userLabel": "U1 Arduino Nano"
    },
    {
      "id": "r1",
      "partId": "resistor",
      "x": 14, "y": 7,
      "rotation": 0,
      "userLabel": "R1 330Ω"
    },
    {
      "id": "led1",
      "partId": "led-red",
      "x": 21, "y": 7,
      "rotation": 0,
      "userLabel": "D1 LED"
    }
  ],
  "wires": [
    {
      "id": "w-d2-r1",
      "points": [
        { "x": 5.5, "y": 7.5 },
        { "x": 14.5, "y": 7.5 }
      ],
      "color": "#42a5f5"
    },
    {
      "id": "w-r1-led",
      "points": [
        { "x": 18.5, "y": 7.5 },
        { "x": 21.5, "y": 7.5 }
      ],
      "color": "#42a5f5"
    },
    {
      "id": "w-led-gnd",
      "points": [
        { "x": 21.5, "y": 7.5 },
        { "x": 21.5, "y": 12.0 },
        { "x": 5.5,  "y": 12.0 },
        { "x": 5.5,  "y": 6.5 }
      ],
      "color": "#000000"
    }
  ]
}
```

Wire math:
- Arduino Nano at `(5, 3)`, D2 pin at left (x=0, y=4) → wire starts at `(5.5, 7.5)`
- Resistor at `(14, 7)`, pin p1 (x=0, y=0) → wire ends at `(14.5, 7.5)` ✓
- Resistor pin p2 (x=4, y=0) → `(18.5, 7.5)`
- LED at `(21, 7)`, anode (x=2, y=0) → `(23.5, 7.5)` — *would need an extra wire segment*
- LED cathode (x=0, y=0) → `(21.5, 7.5)`
- Arduino GND (left, y=3) → `(5.5, 6.5)`

---

## Complete example: ESP32 + DHT22 + OLED

I2C sensor display: read temperature/humidity from DHT22, show on OLED.

```json
{
  "version": 1,
  "components": [
    {
      "id": "esp1",
      "partId": "esp32-devkit",
      "x": 3, "y": 2,
      "rotation": 0,
      "userLabel": "U1 ESP32"
    },
    {
      "id": "dht1",
      "partId": "dht22",
      "x": 18, "y": 4,
      "rotation": 0,
      "showPinLabels": true,
      "userLabel": "U2 DHT22"
    },
    {
      "id": "oled1",
      "partId": "oled-i2c",
      "x": 18, "y": 13,
      "rotation": 0,
      "showPinLabels": true,
      "userLabel": "U3 OLED"
    }
  ],
  "wires": [
    {
      "id": "w-3v3-dht-vcc",
      "points": [
        { "x": 3.5, "y": 2.5 },
        { "x": 18.5, "y": 2.5 },
        { "x": 18.5, "y": 5.5 }
      ],
      "color": "#ef5350"
    },
    {
      "id": "w-gnd-dht",
      "points": [
        { "x": 3.5, "y": 16.5 },
        { "x": 18.5, "y": 16.5 },
        { "x": 18.5, "y": 8.5 }
      ],
      "color": "#000000"
    },
    {
      "id": "w-d21-sda-oled",
      "points": [
        { "x": 6.5, "y": 7.5 },
        { "x": 14.0, "y": 7.5 },
        { "x": 14.0, "y": 21.5 },
        { "x": 22.5, "y": 21.5 }
      ],
      "color": "#66bb6a"
    },
    {
      "id": "w-d22-scl-oled",
      "points": [
        { "x": 6.5, "y": 4.5 },
        { "x": 12.0, "y": 4.5 },
        { "x": 12.0, "y": 20.5 },
        { "x": 21.5, "y": 20.5 }
      ],
      "color": "#ffee58"
    }
  ]
}
```

---

## Rules and anti-patterns

### Must do
- `version` is always the integer `1` (not `"1"`).
- All `id` values must be unique within their array (`components` ids unique; `wires` ids unique).
- `partId` must exactly match a Part Library id (see table above).
- `rotation` must be `0`, `90`, `180`, or `270`.
- Wire `points` must have at least 2 elements.
- Wire endpoint coordinates must land exactly on a pin world center — use the `cx + px + 0.5` formula.
- Use semantic wire colors: red for VCC/power, black for GND, blue/green for digital signals.

### Must not do
- **Do not** use `partId` values that are not in the Part Library list.
- **Do not** leave a floating pin world coordinate that does not align to a component pin.
- **Do not** use negative `x`/`y` positions for components — keep everything at positive coordinates.
- **Do not** overlap components (check that `x + width` of one does not exceed `x` of the next).
- **Do not** use decimal positions for component anchors — always integer grid units for `x` and `y`.
- **Do not** write `.5`-offset for component positions — only wire waypoints use `.5`.

### Common pitfalls

| Mistake | Fix |
|---------|-----|
| Wire endpoint doesn't snap to pin | Recompute: `cx + pin.x + 0.5` and `cy + pin.y + 0.5` |
| Wrong partId causes invisible component | Copy `id` exactly from the Part Library table |
| Components overlap | Add at least `component_width + 2` gap between adjacent anchors |
| DIP pin row count off-by-one | Row indices start at `y=0`; a 15-row DIP uses y=0..14 |
| Left vs right pin x column wrong | Left pins: `x = 0`; right pins: `x = width − 1` |
| Sensor pin y wrong | Sensors start at `y=1` (y=0 is the module top bezel with no pins) |
| Wire goes wrong direction | Y increases downward (SVG convention) |

---

## Part Library quick-reference

| `partId` | Category | Size (w×h) | Key pins |
|----------|----------|-----------|----------|
| `breadboard-830` | board | 65×17 | power rail corners |
| `arduino-nano` | microcontroller | 4×15 | L:TX1..D12 / R:D13..VIN |
| `esp32-devkit` | microcontroller | 4×19 | L:3V3,EN,D32..D4 / R:GND,D23..D5 |
| `wemos-d1-mini` | microcontroller | 4×8 | L:RST..3V3 / R:TX..5V |
| `esp32-s3-pico` | microcontroller | 7×20 | L:GP11..GP40 / R:VBUS..GP42 |
| `resistor` | passive | 5×1 | p1(0,0) p2(4,0) |
| `capacitor-ceramic` | passive | 3×1 | p1(0,0) p2(2,0) |
| `potentiometer` | passive | 5×3 | p1(1,2) wiper(2,2) p2(3,2) |
| `led-red` | active | 3×1 | cathode−(0,0) anode+(2,0) |
| `led-green` | active | 3×1 | cathode−(0,0) anode+(2,0) |
| `led-blue` | active | 3×1 | cathode−(0,0) anode+(2,0) |
| `push-button` | active | 3×3 | a1(0,0) a2(2,0) b1(0,2) b2(2,2) |
| `npn-transistor` | active | 3×2 | E(0,1) B(1,1) C(2,1) |
| `joystick-ps` | active | 5×6 | GND(0,5) VCC(1,5) VRx(2,5) VRy(3,5) SW(4,5) |
| `dht22` | sensor | 4×5 | VCC(0,1) DATA(0,2) NC(0,3) GND(0,4) |
| `dht11` | sensor | 4×5 | VCC(0,1) DATA(0,2) NC(0,3) GND(0,4) |
| `hc_sr04` | sensor | 4×5 | VCC(0,1) TRIG(0,2) ECHO(0,3) GND(0,4) |
| `ky_018` | sensor | 4×5 | S(0,1) VCC(0,2) GND(0,3) |
| `tcrt5000` | sensor | 4×5 | A0(0,1) D0(0,2) GND(0,3) VCC(0,4) |
| `ath20_bmp280` | sensor | 4×5 | VCC(0,1) SDA(0,2) GND(0,3) SCL(0,4) |
| `oled-i2c` | display | 6×8 | GND(1,7) VCC(2,7) SCL(3,7) SDA(4,7) |
| `lcd1602i2c` | display | 6×8 | SCL(1,7) SDA(2,7) VCC(3,7) GND(4,7) |
| `max72198` | display | 5×5 | CLK(0,1) CS(0,2) DIN(0,3) GND(0,4) VCC(0,5) |
