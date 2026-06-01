# AI Prompt: CAD App — Writing Project and Scene Files

This document is a reference for AI assistants writing JSON files for the `app/cad-app` modules.
The app has three independent file formats used in different tabs:

| Tab | File extension | Format root | Description |
|-----|---------------|-------------|-------------|
| CAD | `.cad.json` | `ProjectData` | 2D/3D drawing with entities on layers |
| Scene 3D | `.scene.json` | `SceneGraphData` | Three.js scene tree (mesh / light / group / audio nodes) |
| CAD 3D | `.cad3d.json` | `FeatureTree` | Parametric solid modeler with feature history |

Files are stored on the CAD server at paths like `/users/{userId}/projects/{name}.cad.json`.
A project can have all three files simultaneously: `{name}.cad.json`, `{name}.scene.json`, `{name}.cad3d.json`.

---

## 1 — CAD 2D/3D: `.cad.json` (`ProjectData`)

### Top-level structure

```json
{
  "version": "1.0",
  "settings": {
    "name": "My Project",
    "units": "mm",
    "gridSize": 10,
    "precision": 2
  },
  "layers": {
    "layers": [ /* Layer[] */ ],
    "activeId": "0"
  },
  "entities": [ /* Entity[] */ ]
}
```

`units`: `"mm"` | `"cm"` | `"m"` | `"in"`

### Layer object

```json
{
  "id": "outline",
  "name": "Outline",
  "color": "#4fc3f7",
  "lineType": "solid",
  "lineWidth": 2,
  "visible": true,
  "locked": false
}
```

- Layer `id: "0"` with `name: "0"` **must always be present** — it is the default layer and cannot be deleted.
- `lineType`: `"solid"` | `"dashed"` | `"dotted"` | `"dashdot"`

### Entity base fields (all entity types share these)

```json
{
  "id": "unique-string",
  "type": "...",
  "layerId": "0",
  "color": "bylayer",
  "lineType": "solid",
  "lineWidth": 1,
  "visible": true,
  "locked": false,
  "extrudeHeight": 0
}
```

- `color`: `"bylayer"` or a hex string like `"#ff0000"`
- `lineType`: `"bylayer"` | `"solid"` | `"dashed"` | `"dotted"` | `"dashdot"`
- `lineWidth`: `"bylayer"` or a positive number
- `extrudeHeight`: `0` = flat 2D shape; `> 0` = extruded into 3D (height in world units along +Z)
- **Do NOT include `boundingBox`** — it is computed automatically at load time

### Entity types

#### `line`
```json
{ "type": "line", "x1": 0, "y1": 0, "x2": 100, "y2": 0 }
```

#### `circle`
```json
{ "type": "circle", "cx": 0, "cy": 0, "radius": 25 }
```

#### `arc`
Angles in **radians**. Arc sweeps counter-clockwise from `startAngle` to `endAngle`.
```json
{ "type": "arc", "cx": 0, "cy": 0, "radius": 30, "startAngle": 0, "endAngle": 1.5708 }
```

#### `rect`
`x`, `y` = bottom-left corner.
```json
{ "type": "rect", "x": -50, "y": -30, "width": 100, "height": 60 }
```

#### `polyline`
```json
{
  "type": "polyline",
  "points": [{"x": 0, "y": 0}, {"x": 50, "y": 0}, {"x": 50, "y": 30}],
  "closed": false
}
```

#### `text`
`angle` in radians.
```json
{ "type": "text", "x": 10, "y": 10, "content": "Label", "fontSize": 10, "fontFamily": "sans-serif", "angle": 0 }
```

#### `dimension`
Linear dimension between two points. `offset` is the signed perpendicular distance from the p1–p2 line to the dimension line (positive = left of direction).
```json
{ "type": "dimension", "x1": 0, "y1": 0, "x2": 100, "y2": 0, "offset": 15 }
```

#### `freehand`
```json
{
  "type": "freehand",
  "points": [{"x": 0, "y": 0}, {"x": 5, "y": 3}, {"x": 10, "y": 1}],
  "strokeWidth": 2,
  "smooth": true
}
```

#### `box3d`
3D primitive — box centered at `(cx, cy)` in the XY plane, extruding +Z by `height`.
```json
{ "type": "box3d", "cx": 0, "cy": 0, "width": 40, "depth": 30, "height": 20 }
```

#### `cylinder3d`
```json
{ "type": "cylinder3d", "cx": 0, "cy": 0, "radius": 15, "height": 40 }
```

#### `sphere3d`
No height field — radius determines size in all directions.
```json
{ "type": "sphere3d", "cx": 0, "cy": 0, "radius": 20 }
```

### Coordinate system (CAD)

- Origin at (0, 0). X = right, Y = up in the top-down 2D view.
- There is no Z in the 2D canvas — use `extrudeHeight` to give a 2D shape depth.
- For the 3D view in the CAD tab, the CAD coordinate system maps to Three.js as: CAD X → Three.js X, CAD Y → Three.js Z, extrusion → Three.js Y.

### Complete minimal example

```json
{
  "version": "1.0",
  "settings": { "name": "Bracket", "units": "mm", "gridSize": 5, "precision": 2 },
  "layers": {
    "layers": [
      { "id": "0", "name": "0", "color": "#ffffff", "lineType": "solid", "lineWidth": 1, "visible": true, "locked": false },
      { "id": "body", "name": "Body", "color": "#4fc3f7", "lineType": "solid", "lineWidth": 2, "visible": true, "locked": false }
    ],
    "activeId": "0"
  },
  "entities": [
    {
      "id": "outer",
      "type": "rect",
      "layerId": "body",
      "color": "bylayer", "lineType": "solid", "lineWidth": 2,
      "visible": true, "locked": false, "extrudeHeight": 5,
      "x": -40, "y": -25, "width": 80, "height": 50
    },
    {
      "id": "hole-l",
      "type": "circle",
      "layerId": "0",
      "color": "bylayer", "lineType": "solid", "lineWidth": 1,
      "visible": true, "locked": false, "extrudeHeight": 0,
      "cx": -25, "cy": 0, "radius": 5
    },
    {
      "id": "hole-r",
      "type": "circle",
      "layerId": "0",
      "color": "bylayer", "lineType": "solid", "lineWidth": 1,
      "visible": true, "locked": false, "extrudeHeight": 0,
      "cx": 25, "cy": 0, "radius": 5
    }
  ]
}
```

---

## 2 — Scene 3D: `.scene.json` (`SceneGraphData`)

### Top-level structure

```json
{
  "version": "1.0.0",
  "root": { /* SceneNodeData — always type: "group" */ }
}
```

The root is always a group node named `"Scene"`. All nodes go inside `root.children`.

### Node base fields (all node types share these)

```json
{
  "id": "unique-string",
  "name": "Display Name",
  "type": "...",
  "visible": true,
  "position": [0, 0, 0],
  "rotation": [0, 0, 0],
  "scale": [1, 1, 1],
  "castShadow": false,
  "receiveShadow": false,
  "frustumCulled": true,
  "renderOrder": 0,
  "userData": "",
  "metadata": {},
  "children": []
}
```

- `position`: `[x, y, z]` — Three.js world space. Y = up.
- `rotation`: `[x, y, z]` — Euler angles in **radians**.
- `scale`: `[x, y, z]` — default `[1, 1, 1]`

### Node types

#### `mesh`
```json
{
  "type": "mesh",
  "geometry": {
    "type": "box",
    "params": { "width": 1, "height": 1, "depth": 1 }
  },
  "material": {
    "color": "#4fc3f7",
    "opacity": 1,
    "wireframe": false
  }
}
```

Geometry types and their `params`:

| `geometry.type` | `params` fields |
|-----------------|-----------------|
| `"box"` | `width`, `height`, `depth` |
| `"sphere"` | *(none required — default radius 0.5)* |
| `"cylinder"` | `radiusTop`, `radiusBottom`, `height`, `radialSegments` |
| `"plane"` | `width`, `height` |
| `"cone"` | `radius`, `height`, `radialSegments` |
| `"torus"` | `radius`, `tube`, `radialSegments`, `tubularSegments` |
| `"custom"` | `bufferData: { positions: number[], normals?: number[], indices?: number[] }` |

`material.opacity` range: `0.0`–`1.0`. Values below 1 make the mesh transparent.

#### `light`
```json
{
  "type": "light",
  "lightType": "directional",
  "color": "#ffffff",
  "intensity": 1.0,
  "groundColor": "#444444",
  "distance": 0,
  "decay": 2,
  "angle": 0.785,
  "penumbra": 0.1,
  "shadowIntensity": 1,
  "shadowBias": -0.0001,
  "shadowNormalBias": 0,
  "shadowRadius": 1
}
```

`lightType`: `"ambient"` | `"directional"` | `"point"` | `"spot"` | `"hemisphere"`

- `ambient`: only `color` and `intensity` matter
- `hemisphere`: uses both `color` (sky) and `groundColor`
- `directional` / `spot`: set `castShadow: true` + `position` to get shadows
- `spot`: uses `angle` (half-angle in radians) and `penumbra` (soft edge 0–1)
- `point`: uses `distance` (0 = infinite) and `decay`

#### `group`
Container with no geometry. Use for organizing children.
```json
{
  "type": "group"
}
```

#### `audio`
Positional or global audio source.
```json
{
  "type": "audio",
  "src": "/api/vfs/stream?path=/Projects/sounds/ambient.mp3",
  "volume": 0.8,
  "loop": true,
  "autoplay": false,
  "positional": true,
  "rolloffFactor": 1,
  "maxDistance": 10000,
  "refDistance": 1,
  "distanceModel": "inverse",
  "coneInnerAngle": 360,
  "coneOuterAngle": 360,
  "coneOuterGain": 0
}
```

- `positional: false` → global non-spatial audio (ignores position)
- `distanceModel`: `"linear"` | `"inverse"` | `"exponential"`
- `src` can be a VFS stream URL or any HTTP URL

### Scene recommendations

Every scene should include at least:
1. One `ambient` light (intensity 0.3–0.5) for base illumination
2. One `directional` light (intensity 0.8–1.5) with `castShadow: true` and `position` set away from origin

### Complete minimal example

```json
{
  "version": "1.0.0",
  "root": {
    "id": "root",
    "name": "Scene",
    "type": "group",
    "visible": true,
    "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1],
    "castShadow": false, "receiveShadow": false,
    "frustumCulled": true, "renderOrder": 0,
    "userData": "", "metadata": {},
    "children": [
      {
        "id": "ambient",
        "name": "Ambient Light",
        "type": "light", "lightType": "ambient",
        "color": "#ffffff", "intensity": 0.4,
        "groundColor": "#444444", "distance": 0, "decay": 2,
        "angle": 0.785, "penumbra": 0.1,
        "shadowIntensity": 1, "shadowBias": -0.0001,
        "shadowNormalBias": 0, "shadowRadius": 1,
        "visible": true, "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1],
        "castShadow": false, "receiveShadow": false,
        "frustumCulled": true, "renderOrder": 0,
        "userData": "", "metadata": {}, "children": []
      },
      {
        "id": "sun",
        "name": "Sun",
        "type": "light", "lightType": "directional",
        "color": "#ffffff", "intensity": 1.2,
        "groundColor": "#444444", "distance": 0, "decay": 2,
        "angle": 0.785, "penumbra": 0.1,
        "shadowIntensity": 1, "shadowBias": -0.0001,
        "shadowNormalBias": 0, "shadowRadius": 1,
        "visible": true, "position": [5, 8, 5], "rotation": [0, 0, 0], "scale": [1, 1, 1],
        "castShadow": true, "receiveShadow": false,
        "frustumCulled": true, "renderOrder": 0,
        "userData": "", "metadata": {}, "children": []
      },
      {
        "id": "box-1",
        "name": "Box",
        "type": "mesh",
        "geometry": { "type": "box", "params": { "width": 1, "height": 1, "depth": 1 } },
        "material": { "color": "#4fc3f7", "opacity": 1, "wireframe": false },
        "visible": true, "position": [0, 0.5, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1],
        "castShadow": true, "receiveShadow": true,
        "frustumCulled": true, "renderOrder": 0,
        "userData": "", "metadata": {}, "children": []
      }
    ]
  }
}
```

---

## 3 — CAD 3D: `.cad3d.json` (`FeatureTree`)

### Top-level structure

```json
{
  "version": 1,
  "features": [ /* Feature[] — evaluated top-to-bottom */ ]
}
```

Features are evaluated in order. Each additive feature (extrude, revolve, loft, sweep, helix) adds material; each subtractive feature (pocket, groove, hole, loft_cut, sweep_cut) removes material. Mirror applies to the cumulative solid at that point in the tree.

### Base feature fields

```json
{
  "id": "unique-string",
  "type": "...",
  "name": "Display Name",
  "enabled": true
}
```

### Feature types

#### `sketch`
A 2D profile that other features reference. Contains a serialized `.cad.json` `ProjectData` (as a JSON string in `projectData`).

```json
{
  "type": "sketch",
  "plane": "XY",
  "offset": 0,
  "projectData": "{...escaped ProjectData JSON...}"
}
```

- `plane`: `"XY"` | `"XZ"` | `"YZ"` | `"face"`
- `offset`: translation along the plane's normal (e.g., offset=25 on XY puts the sketch at Z=25)
- `planeMatrix`: optional 16-element column-major `Matrix4` array — only used when `plane: "face"`
- `projectData`: a JSON string containing a full `.cad.json` `ProjectData` object. Entity IDs in this embedded project are referenced by `entityIds` in Extrude/Pocket/etc.
- When `projectData` is `null` the sketch is empty (not yet drawn)

#### `extrude`
Extrudes a closed profile from a sketch upward, creating material.

```json
{
  "type": "extrude",
  "sketchId": "sketch-base",
  "entityIds": ["rect-id-from-sketch"],
  "extrudeType": "dimension",
  "height": 30,
  "symmetric": false,
  "reversed": false,
  "direction": "normal",
  "taper": 0
}
```

- `sketchId`: `id` of the sketch feature to use
- `entityIds`: entity IDs inside that sketch's `projectData` to extrude (usually closed shapes: rect, circle, closed polyline)
- `extrudeType`: `"dimension"` | `"symmetric"` | `"through_all"`
- `direction`: `"normal"` (perpendicular to sketch plane) | `"X"` | `"Y"` | `"Z"`
- `taper`: draft angle in degrees; `0` = no taper
- `symmetric`: when `true` and `extrudeType: "dimension"`, extrudes equally in both directions

#### `pocket`
Same parameters as `extrude` but removes material (boolean subtraction).

```json
{
  "type": "pocket",
  "sketchId": "sketch-top",
  "entityIds": ["circle-id"],
  "extrudeType": "dimension",
  "height": 10,
  "symmetric": false,
  "reversed": false,
  "direction": "normal",
  "taper": 0
}
```

#### `hole`
Machining hole — richer geometry than pocket.

```json
{
  "type": "hole",
  "sketchId": "sketch-holes",
  "diameter": 6,
  "depthType": "dimension",
  "depth": 20,
  "reversed": false,
  "tapered": false,
  "taperAngle": 90,
  "drillPoint": "angled",
  "drillPointAngle": 118,
  "counterType": "none",
  "counterDiameter": 10,
  "counterDepth": 3,
  "counterAngle": 90
}
```

- `depthType`: `"dimension"` | `"through_all"`
- `drillPoint`: `"flat"` | `"angled"`
- `counterType`: `"none"` | `"countersink"` | `"counterbore"`

#### `revolve`
Revolves a 2D profile around an axis, creating a solid of revolution.

```json
{
  "type": "revolve",
  "sketchId": "sketch-profile",
  "entityIds": ["profile-polyline-id"],
  "revolveType": "dimension",
  "axis": "sketch_vertical",
  "angle": 360,
  "symmetric": false,
  "reversed": false,
  "segments": 32
}
```

- `revolveType`: `"dimension"` | `"symmetric"` | `"through_all"`
- `axis`: `"sketch_vertical"` | `"sketch_horizontal"` | `"X"` | `"Y"` | `"Z"`

#### `groove`
Same as `revolve` but removes material (boolean subtraction).

Same parameters as `revolve` with `"type": "groove"`.

#### `loft`
Loft through multiple sketch cross-sections.

```json
{
  "type": "loft",
  "sections": [
    { "sketchId": "sketch-bottom" },
    { "sketchId": "sketch-top" }
  ],
  "ruled": false,
  "closed": false
}
```

#### `loft_cut`
Same as `loft` but removes material.

#### `sweep`
Sweeps a profile sketch along a path sketch.

```json
{
  "type": "sweep",
  "profileSketchId": "sketch-profile",
  "pathSketchId": "sketch-path",
  "cornerStyle": "transformed",
  "orientationMode": "standard",
  "transformMode": "constant"
}
```

- `cornerStyle`: `"transformed"` | `"round"` | `"right_angle"`
- `orientationMode`: `"standard"` | `"fixed"` | `"frenet"`
- `transformMode`: `"constant"` | `"inscribed"`

#### `sweep_cut`
Same as `sweep` but removes material.

#### `helix`
Creates a helical sweep (spring / thread shape).

```json
{
  "type": "helix",
  "profileSketchId": "sketch-wire-section",
  "axis": "Y",
  "mode": "pitch_height",
  "pitch": 10,
  "height": 60,
  "turns": 6,
  "radius": 20,
  "taper": 0,
  "leftHanded": false,
  "reversed": false
}
```

- `mode`: `"pitch_height"` | `"pitch_turns"` | `"turns_height"`
- `axis`: `"sketch_vertical"` | `"sketch_horizontal"` | `"X"` | `"Y"` | `"Z"`

#### `mirror`
Mirrors the entire solid accumulated so far across a plane.

```json
{
  "type": "mirror",
  "plane": "YZ"
}
```

`plane`: `"XY"` | `"XZ"` | `"YZ"`

#### `shell`
Hollows out the solid, leaving walls of uniform thickness.

```json
{
  "type": "shell",
  "thickness": 3
}
```

### How to write `projectData` inside a sketch

`projectData` must be a **JSON string** (not a nested object — it will be `JSON.parse`d at runtime).
It is a complete `.cad.json` ProjectData with:
- `version: "1.0"`
- `settings`: minimal — name, units, gridSize, precision
- `layers`: must include layer `"0"`
- `entities`: the profile shapes. Use IDs that you will reference in `entityIds` of the feature.

Example of a sketch containing a single rectangle:

```json
"projectData": "{\"version\":\"1.0\",\"settings\":{\"name\":\"Base\",\"units\":\"mm\",\"gridSize\":10,\"precision\":2},\"layers\":{\"layers\":[{\"id\":\"0\",\"name\":\"0\",\"color\":\"#ffffff\",\"lineType\":\"solid\",\"lineWidth\":1,\"visible\":true,\"locked\":false}],\"activeId\":\"0\"},\"entities\":[{\"id\":\"r1\",\"type\":\"rect\",\"layerId\":\"0\",\"color\":\"bylayer\",\"lineType\":\"solid\",\"lineWidth\":1,\"visible\":true,\"locked\":false,\"extrudeHeight\":0,\"x\":-25,\"y\":-20,\"width\":50,\"height\":40}]}"
```

### Complete example: block with a pocket

```json
{
  "version": 1,
  "features": [
    {
      "id": "s1",
      "type": "sketch",
      "name": "Base Sketch",
      "enabled": true,
      "plane": "XY",
      "offset": 0,
      "projectData": "{\"version\":\"1.0\",\"settings\":{\"name\":\"Base\",\"units\":\"mm\",\"gridSize\":10,\"precision\":2},\"layers\":{\"layers\":[{\"id\":\"0\",\"name\":\"0\",\"color\":\"#ffffff\",\"lineType\":\"solid\",\"lineWidth\":1,\"visible\":true,\"locked\":false}],\"activeId\":\"0\"},\"entities\":[{\"id\":\"r1\",\"type\":\"rect\",\"layerId\":\"0\",\"color\":\"bylayer\",\"lineType\":\"solid\",\"lineWidth\":1,\"visible\":true,\"locked\":false,\"extrudeHeight\":0,\"x\":-30,\"y\":-20,\"width\":60,\"height\":40}]}"
    },
    {
      "id": "e1",
      "type": "extrude",
      "name": "Body",
      "enabled": true,
      "sketchId": "s1",
      "entityIds": ["r1"],
      "extrudeType": "dimension",
      "height": 20,
      "symmetric": false,
      "reversed": false,
      "direction": "normal",
      "taper": 0
    },
    {
      "id": "s2",
      "type": "sketch",
      "name": "Pocket Sketch",
      "enabled": true,
      "plane": "XY",
      "offset": 20,
      "projectData": "{\"version\":\"1.0\",\"settings\":{\"name\":\"Pocket\",\"units\":\"mm\",\"gridSize\":10,\"precision\":2},\"layers\":{\"layers\":[{\"id\":\"0\",\"name\":\"0\",\"color\":\"#ffffff\",\"lineType\":\"solid\",\"lineWidth\":1,\"visible\":true,\"locked\":false}],\"activeId\":\"0\"},\"entities\":[{\"id\":\"c1\",\"type\":\"circle\",\"layerId\":\"0\",\"color\":\"bylayer\",\"lineType\":\"solid\",\"lineWidth\":1,\"visible\":true,\"locked\":false,\"extrudeHeight\":0,\"cx\":0,\"cy\":0,\"radius\":12}]}"
    },
    {
      "id": "p1",
      "type": "pocket",
      "name": "Center Pocket",
      "enabled": true,
      "sketchId": "s2",
      "entityIds": ["c1"],
      "extrudeType": "dimension",
      "height": 12,
      "symmetric": false,
      "reversed": false,
      "direction": "normal",
      "taper": 0
    }
  ]
}
```

---

## 4 — Rules and constraints

### Shared rules (all formats)
- All `id` values must be **unique strings** within their scope.
- Prefer descriptive IDs like `"sketch-base"`, `"extrude-body"`, `"mesh-floor"` over UUIDs for human-readable files.
- All numeric values are in the project's declared units (default `mm` for CAD, world units for Scene 3D).
- Do not include computed fields: `boundingBox` in `.cad.json`, or internal Three.js state in `.scene.json`.

### CAD rules
- The layer with `id: "0"` must always be present in `layers.layers`.
- Entity IDs must be unique within the `entities` array.
- Arc angles are in **radians** (`Math.PI/2 ≈ 1.5708`, `Math.PI ≈ 3.1416`, `2*Math.PI ≈ 6.2832`).
- `extrudeHeight > 0` only makes sense on closed or solid shapes (rect, circle, closed polyline, box3d, cylinder3d).

### Scene 3D rules
- The root node must have `type: "group"`. All renderable nodes go in `root.children`.
- `position`, `rotation`, `scale` are always 3-element arrays `[x, y, z]`.
- Always include at least one `ambient` light — a scene with only directional light looks fully black on the shadow side.
- `castShadow: true` on lights (directional, spot, point) enables shadow casting; set it on `mesh` nodes too to receive/cast shadows correctly.
- Light node `children` is always `[]`.

### CAD 3D rules
- Feature `id` values must be unique within the `features` array.
- A sketch feature must appear **before** any feature that references it via `sketchId`.
- `entityIds` in Extrude/Pocket/etc. must match `id` values in the corresponding sketch's `projectData` entities.
- `projectData` is stored as a **JSON string** — escape all inner quotes with `\"`.
- The `version` field at the top level is the integer `1`, not the string `"1"`.
- Subtractive features (pocket, groove, hole, loft_cut, sweep_cut) only make sense after at least one additive feature (extrude, revolve, loft, sweep, helix) has created solid material.

---

## 5 — Coordinate system reference

```
CAD 2D / CAD 3D canvas        Scene 3D (Three.js)
─────────────────────         ─────────────────────
+X → right                    +X → right
+Y → up (screen)              +Y → up (world)
Z = extrude direction         +Z → toward viewer
                              rotation in radians (Euler XYZ)

Bridge mapping (CadToScene):
  CAD X   →  Three.js X
  CAD Y   →  Three.js Z  (top-down view becomes depth)
  extrusion → Three.js Y (up)
```

Scene 3D uses **meters** by convention (scale 1 = 1 m). CAD files typically use **mm**.
When bridging CAD → Scene: a 100 mm rect becomes a 100-unit-wide box in Scene 3D (visually large — scale down if needed).
