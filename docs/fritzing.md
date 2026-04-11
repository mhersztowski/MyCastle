# Electronics / Breadboard Visualization

The **Electronics** tab in `cad-app` provides a Fritzing-like breadboard visualization tool.
It lets you drag components onto a canvas, connect them with colored wires, and save/load
the resulting schematic as a `.elec.json` file.

> **Scope**: This is a *visualization* tool only — no netlist, no PCB layout, no electrical
> rules check (ERC/DRC). Use it to document how modules are wired together on a breadboard.

---

## User Guide

### Modes

| Mode | Shortcut | Description |
|------|----------|-------------|
| Select | V | Click to select a component or wire; drag to move a component |
| Wire | W | Click to start a wire, click again to add waypoints, double-click or click a pin to finish |
| Place | (auto) | Activated when you click a component in the library panel |

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Esc` | Cancel current action (wire, placement) / deselect |
| `Delete` / `Backspace` | Remove selected component or wire |
| `Ctrl+Z` | Undo last placed item |
| `V` | Switch to Select mode |
| `W` | Switch to Wire mode |

### Mouse / touch

| Gesture | Action |
|---------|--------|
| Scroll wheel | Zoom in/out toward cursor |
| Middle mouse drag | Pan canvas |
| Right mouse drag | Pan canvas |
| Click on component (select mode) | Select |
| Drag selected component | Move |
| Click on wire (select mode) | Select |

### Placing components

1. Click a part in the **Components** panel on the left.
2. Move to the canvas — the part ghost follows your cursor, snapping to the grid.
3. Click to place. The part stays selected; click again to place another copy.
4. Press `Esc` to exit place mode.

### Drawing wires

1. Switch to **Wire** mode (W or toolbar button).
2. Select a wire color from the color row in the toolbar.
3. Click anywhere on the canvas (or near a component pin) to start the wire.
4. Click to add waypoints; **double-click** or **click on a component pin** to finish.
5. Press `Esc` to cancel the current wire.

### Saving and loading

- **Save** button — downloads `breadboard.elec.json` to your browser downloads folder.
- **Open** button — opens a file picker; loads a previously saved `.elec.json`.
- **Clear** button — removes all components and wires (with confirmation).

---

## Adding New Components

Components are defined in:

```
app/cad-app/src/electronics/partLibrary.ts
```

Each component is a `PartDef` object. Add a new one to the `PART_LIBRARY` array at the bottom
of the file.

### PartDef schema

```typescript
interface PartDef {
  id: string;           // unique kebab-case identifier, e.g. 'my-sensor'
  name: string;         // display name shown in the library panel
  category: PartCategory;   // 'board' | 'microcontroller' | 'passive' | 'active' | 'sensor' | 'display' | 'power'
  description?: string; // tooltip shown on hover
  width: number;        // bounding box width in grid units (1 unit = 20 px = 2.54 mm)
  height: number;       // bounding box height in grid units
  pins: Pin[];          // connection points (for snap and visual)
  bodyColor: string;    // CSS color for the main body
  bodyShape: BodyShape; // rendering style (see below)
  label?: string;       // short text shown on the body (use \n for multi-line)
  indicatorColor?: string; // for LED shape: the dome/glow color
}

interface Pin {
  id: string;           // unique within this part
  x: number;            // X offset from top-left anchor in grid units (integer)
  y: number;            // Y offset from top-left anchor in grid units (integer)
  label?: string;       // pin name shown on hover in wire mode
}
```

### Available body shapes

| `bodyShape` | Description | Best for |
|-------------|-------------|----------|
| `ic` | Generic rectangle with optional side pins and centered label | Sensors, modules, ICs |
| `dip` | DIP package: dark body, notch, pin rows on left (x=0) and right (x=w-1) | Microcontrollers, ICs |
| `resistor` | Axial body with color bands between two wire leads | Resistors |
| `led` | Triangular cathode + dome anode between two leads | LEDs |
| `button` | Square body with circular button cap and corner pins | Tactile switches |
| `capacitor` | Cylindrical body between two leads | Capacitors |
| `transistor` | D-shaped TO-92 body with three bottom leads | Transistors |
| `breadboard` | Full solderless breadboard with power rails and hole grid | Breadboard |

### Pin coordinate convention

- `(0, 0)` is the **top-left** corner of the bounding box.
- Positive X goes right, positive Y goes down.
- Pins at `x=0` (DIP shape) appear on the left edge.
- Pins at `x=width-1` appear on the right edge.
- Use integer values — each unit maps to one grid hole on the breadboard.

For a DIP component, use the `leftRightPins` helper (unexported, copy as needed):

```typescript
function leftRightPins(height: number, leftLabels: string[], rightLabels: string[]): Pin[] {
  const pins: Pin[] = [];
  for (let i = 0; i < height; i++) {
    if (leftLabels[i])  pins.push({ id: `L${i}`, x: 0, y: i, label: leftLabels[i] });
    if (rightLabels[i]) pins.push({ id: `R${i}`, x: 3, y: i, label: rightLabels[i] });
  }
  return pins;
}
```

### Example: adding a simple 3-pin sensor

```typescript
// app/cad-app/src/electronics/partLibrary.ts

const myTemperatureSensor: PartDef = {
  id: 'ds18b20',
  name: 'DS18B20 Temp Sensor',
  category: 'sensor',
  description: '1-Wire digital temperature sensor (TO-92)',
  width: 3,
  height: 2,
  bodyColor: '#455a64',
  bodyShape: 'transistor',
  label: 'DS18B\n20',
  pins: [
    { id: 'gnd',  x: 0, y: 1, label: 'GND' },
    { id: 'data', x: 1, y: 1, label: 'DATA' },
    { id: 'vcc',  x: 2, y: 1, label: 'VCC' },
  ],
};

// At the bottom of the file, add to PART_LIBRARY:
export const PART_LIBRARY: PartDef[] = [
  // ... existing parts ...
  myTemperatureSensor,
];
```

### Example: adding a multi-pin module (4-pin I2C)

```typescript
const bme280: PartDef = {
  id: 'bme280',
  name: 'BME280 (I2C)',
  category: 'sensor',
  description: 'Barometric pressure, humidity & temperature sensor',
  width: 5,
  height: 4,
  bodyColor: '#1b5e20',
  bodyShape: 'ic',
  label: 'BME280',
  pins: [
    { id: 'vcc', x: 0, y: 0, label: 'VCC' },
    { id: 'gnd', x: 0, y: 1, label: 'GND' },
    { id: 'scl', x: 0, y: 2, label: 'SCL' },
    { id: 'sda', x: 0, y: 3, label: 'SDA' },
  ],
};
```

---

## File Format (`.elec.json`)

```json
{
  "version": 1,
  "components": [
    {
      "id": "uuid-here",
      "partId": "arduino-nano",
      "x": 5,
      "y": 3,
      "rotation": 0
    }
  ],
  "wires": [
    {
      "id": "uuid-here",
      "points": [
        { "x": 5.5, "y": 3.5 },
        { "x": 10.5, "y": 3.5 }
      ],
      "color": "#ef5350"
    }
  ]
}
```

All coordinates (`x`, `y`) are in **grid units** (1 unit = 20 px = 2.54 mm). Pin-snapped
positions use half-integer values (`n + 0.5`) to center on the hole.

---

## Architecture Notes

| File | Role |
|------|------|
| `src/electronics/types.ts` | All TypeScript types + constants (GRID, SNAP_RADIUS, WIRE_COLORS) |
| `src/electronics/partLibrary.ts` | Part registry (`PART_LIBRARY`, `getPartDef()`) |
| `src/components/electronics/BreadboardCanvas.tsx` | SVG canvas: rendering, pan/zoom, interaction state machine |
| `src/components/electronics/ComponentLibrary.tsx` | Left panel: searchable, categorized part list with thumbnails |
| `src/App.tsx` | Hosts the Electronics tab; wires `selectedPartId` between library and canvas |

The canvas renders everything inside a single `<svg>` element using a `<g transform>` wrapper
for pan/zoom. No external canvas or diagram library is used.
