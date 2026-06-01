# AI Prompt: Scene 3D — Writing `.scene.json` files

You are writing scene files for the **Scene 3D** tab of `app/cad-app`.
The scene renderer is **Three.js r182** using `@react-three/fiber`.
The scene is described as a JSON tree stored in `.scene.json` files on the CAD server.

---

## File identity

| Field | Value |
|-------|-------|
| Extension | `.scene.json` |
| Server path | `/users/{userId}/projects/{name}.scene.json` |
| Format root | `SceneGraphData` |
| Loaded by | `SceneDeserializer.deserialize(json)` |
| Written by | `SceneSerializer.serialize(graph)` |

A project can have a companion `.cad.json` (2D drawing) and/or `.cad3d.json` (parametric solid) alongside the `.scene.json`. They are independent files — editing one does not affect the others.

---

## Top-level structure

```json
{
  "version": "1.0.0",
  "root": { /* SceneNodeData — always type: "group" */ }
}
```

- `version` is always the string `"1.0.0"`.
- `root` is a single `group` node. **All scene content lives in `root.children`.**

---

## Node base fields

Every node — regardless of type — has these fields:

```json
{
  "id":            "unique-string",
  "name":          "Human-readable label",
  "type":          "group | mesh | light | camera | audio",
  "visible":       true,
  "position":      [0, 0, 0],
  "rotation":      [0, 0, 0],
  "scale":         [1, 1, 1],
  "castShadow":    false,
  "receiveShadow": false,
  "frustumCulled": true,
  "renderOrder":   0,
  "userData":      "",
  "metadata":      {},
  "children":      []
}
```

### Field details

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Must be unique across the **entire** scene tree |
| `name` | string | Displayed in the Scene Tree panel |
| `type` | string | `"group"` \| `"mesh"` \| `"light"` \| `"camera"` \| `"audio"` |
| `visible` | bool | `false` hides the node and all its children |
| `position` | `[x,y,z]` | Local position in **world units** (no unit conversion) |
| `rotation` | `[x,y,z]` | Local Euler angles in **radians** (XYZ order) |
| `scale` | `[x,y,z]` | Local scale, default `[1,1,1]` |
| `castShadow` | bool | Whether this object casts shadows; requires a shadow-casting light |
| `receiveShadow` | bool | Whether this surface receives shadows from others |
| `frustumCulled` | bool | `true` = skip rendering when outside camera frustum (default — keep true) |
| `renderOrder` | int | Higher values render last (for transparency layering); default 0 |
| `userData` | string | Arbitrary string tag, unused by renderer |
| `metadata` | object | Arbitrary key→value, unused by renderer |
| `children` | array | Nested nodes; transforms are relative to parent |

### Coordinate system

```
+X = right
+Y = up
+Z = toward the viewer (out of the screen)
```

- Rotation values are in **radians**. Quick reference:
  - 90° = `1.5708`   (`Math.PI / 2`)
  - 180° = `3.1416`  (`Math.PI`)
  - 270° = `4.7124`  (`3 * Math.PI / 2`)
  - 45° = `0.7854`   (`Math.PI / 4`)
- The floor is typically placed at `y = 0` or slightly below (`y = -0.05`).
- Objects resting on the floor: set `position[1]` to half the object's height.

---

## Node types

### `group`

Container node — no geometry, no material. Use for logical grouping and compound transforms.

```json
{
  "id": "grp-1",
  "name": "Cabinet",
  "type": "group",
  "visible": true,
  "position": [2, 0, -1],
  "rotation": [0, 0.785, 0],
  "scale": [1, 1, 1],
  "castShadow": false,
  "receiveShadow": false,
  "frustumCulled": true,
  "renderOrder": 0,
  "userData": "",
  "metadata": {},
  "children": [ /* child nodes with positions relative to this group */ ]
}
```

The root node (`root` at the top level) is always a group. Do not add a `geometry` or `material` field to group nodes.

---

### `mesh`

Renderable 3D object with geometry + material.

```json
{
  "type": "mesh",
  "castShadow": true,
  "receiveShadow": true,
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

#### `geometry.type` — built-in primitives

| `type` | Required `params` | Optional `params` |
|--------|-------------------|-------------------|
| `"box"` | `width`, `height`, `depth` | — |
| `"sphere"` | — | `radius` (default 0.5), `widthSegments`, `heightSegments` |
| `"cylinder"` | `height` | `radiusTop`, `radiusBottom` (default 0.5), `radialSegments` (default 32) |
| `"plane"` | `width`, `height` | — |
| `"cone"` | `height` | `radius` (default 0.5), `radialSegments` (default 32) |
| `"torus"` | — | `radius` (default 1), `tube` (default 0.4), `radialSegments`, `tubularSegments` |
| `"custom"` | `bufferData` (see below) | `fileName` |

For built-in primitives, omit `params` entirely if you want all defaults (sphere, torus).

#### Custom geometry (`"type": "custom"`)

```json
"geometry": {
  "type": "custom",
  "bufferData": {
    "positions": [0,0,0, 1,0,0, 0.5,1,0],
    "normals": [0,0,1, 0,0,1, 0,0,1],
    "indices": [0, 1, 2]
  }
}
```

- `positions`: flat `[x0,y0,z0, x1,y1,z1, ...]` array
- `normals`: same length as positions; optional but needed for correct lighting
- `indices`: triangle face indices; optional (non-indexed if omitted)

#### `material`

| Field | Type | Notes |
|-------|------|-------|
| `color` | hex string | e.g. `"#4fc3f7"`, `"#ffffff"` |
| `opacity` | 0.0–1.0 | Values < 1 make mesh transparent (enable alpha blending) |
| `wireframe` | bool | Renders only edges, no filled faces |

For transparent meshes (`opacity < 1`), set `renderOrder: 1` or higher to avoid z-fighting with opaque surfaces. Transparent meshes should not `castShadow`.

---

### `light`

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
  "shadowRadius": 1,
  "castShadow": true,
  "children": []
}
```

#### `lightType` variants

| Type | Useful fields | Notes |
|------|--------------|-------|
| `"ambient"` | `color`, `intensity` | No position, no shadows. Fills all surfaces equally. |
| `"hemisphere"` | `color` (sky), `groundColor`, `intensity` | Soft two-tone fill from above/below. |
| `"directional"` | `color`, `intensity`, `position`, `castShadow` | Parallel rays. `position` sets the light direction (from that point toward origin). |
| `"point"` | `color`, `intensity`, `position`, `distance`, `decay`, `castShadow` | Radiates in all directions. `distance=0` = infinite range. |
| `"spot"` | `color`, `intensity`, `position`, `angle`, `penumbra`, `distance`, `decay`, `castShadow` | Cone of light. `angle` = half-cone in radians (e.g. `0.785` = 45°). |

Shadow fields (only relevant when `castShadow: true`):

| Field | Default | Notes |
|-------|---------|-------|
| `shadowBias` | `-0.0001` | Negative values reduce shadow acne on meshes |
| `shadowNormalBias` | `0` | Offset along surface normals to reduce self-shadowing |
| `shadowRadius` | `1` | PCF kernel size; higher = softer shadow edges |
| `shadowIntensity` | `1` | Shadow darkness multiplier |

Lights have no geometry — their `children` array is always `[]`.

---

### `camera`

Defines a named camera that the user can activate ("View from camera") in the editor. Not required for a valid scene — the editor has its own orbit camera. Add a camera node only when you want a specific viewpoint.

```json
{
  "type": "camera",
  "cameraType": "perspective",
  "fov": 50,
  "near": 0.1,
  "far": 2000,
  "position": [5, 3, 8],
  "rotation": [-0.36, 0.52, 0],
  "children": []
}
```

Orthographic camera (for technical views):

```json
{
  "type": "camera",
  "cameraType": "orthographic",
  "fov": 50,
  "near": 0.1,
  "far": 2000,
  "left": -5,
  "right": 5,
  "top": 3,
  "bottom": -3,
  "position": [0, 10, 0],
  "rotation": [-1.5708, 0, 0],
  "children": []
}
```

| Field | Default | Notes |
|-------|---------|-------|
| `cameraType` | `"perspective"` | `"perspective"` \| `"orthographic"` |
| `fov` | `50` | Vertical field of view in degrees (perspective only) |
| `near` | `0.1` | Near clipping plane |
| `far` | `2000` | Far clipping plane |
| `left/right/top/bottom` | `±0.77 / ±1.0` | Orthographic frustum bounds |

---

### `audio`

Positional or global audio source attached to a point in 3D space.

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
  "coneOuterGain": 0,
  "children": []
}
```

| Field | Default | Notes |
|-------|---------|-------|
| `src` | `""` | VFS stream URL or any HTTP URL to an audio file |
| `volume` | `1` | 0.0–1.0 |
| `loop` | `false` | Loop continuously |
| `autoplay` | `false` | Start playing on load |
| `positional` | `true` | `true` = spatial 3D audio; `false` = global (ignores position) |
| `rolloffFactor` | `1` | How fast volume drops with distance |
| `maxDistance` | `10000` | No attenuation beyond this distance |
| `refDistance` | `1` | Distance at full volume |
| `distanceModel` | `"inverse"` | `"linear"` \| `"inverse"` \| `"exponential"` |
| `coneInnerAngle` | `360` | Full-volume cone (degrees). `360` = omnidirectional |
| `coneOuterAngle` | `360` | Outer cone boundary (degrees) |
| `coneOuterGain` | `0` | Volume outside outer cone |

For a directional speaker effect: set `coneInnerAngle: 60`, `coneOuterAngle: 120`, `coneOuterGain: 0` and orient the node with `rotation` so it faces the listener direction.

VFS audio path format: `/api/vfs/stream?path=/Projects/{projectFolder}/sounds/{file}.mp3`

---

## Scene hierarchy rules

- The `root` object must always have `"type": "group"`.
- Every node must appear exactly once in the tree (no shared references).
- `id` values must be globally unique across the entire file.
- `children` may be empty `[]` — never `null` or omitted.
- Transforms nest: a child's `position` is relative to its parent's local coordinate frame.

---

## Lighting design guide

### Minimum viable scene

Every scene must have at least one ambient light. Without it, unlit faces are pitch black.

```json
{ "id": "ambient", "type": "light", "lightType": "ambient",
  "color": "#ffffff", "intensity": 0.4, ... }
```

### Standard three-point setup

| Role | `lightType` | `intensity` | Position hint |
|------|------------|-------------|---------------|
| Key light | `directional` | 1.0–1.5 | `[5, 8, 5]` — upper right front |
| Fill light | `directional` | 0.3–0.5 | `[-5, 4, -2]` — left back |
| Ambient | `ambient` | 0.2–0.4 | `[0,0,0]` (position irrelevant) |

### Shadow setup

To get shadows:
1. Set `castShadow: true` on the **light** (directional or spot or point).
2. Set `castShadow: true` on each **mesh** that should cast a shadow.
3. Set `receiveShadow: true` on each **mesh** that should show shadows on its surface.
4. Use `shadowBias: -0.0001` on the light to prevent shadow acne.

### Indoor/architectural scenes

Use a low-intensity ambient (`0.2`) + two or three point lights placed at ceiling positions. Add emissive light panels with `material.color` matching the light color as visual stand-ins for bulbs.

### Outdoor/natural scenes

Use directional key light at intensity `1.5` + hemisphere light (`intensity: 0.8`) with `color: "#87ceeb"` (sky blue) and `groundColor: "#8b7355"` (earth brown). Hemisphere gives a convincing sky/ground gradient without per-mesh cost.

---

## Scene settings (companion data — not in `.scene.json`)

`SceneSettings` control background, environment maps, and fog. They are stored by the editor separately from the scene JSON. When writing a `.scene.json` file directly, you do not include these — the editor manages them. For reference:

| Setting | Values | Effect |
|---------|--------|--------|
| `backgroundType` | `"default"` \| `"solid"` | `"solid"` shows `backgroundColor` |
| `backgroundColor` | hex | Used when `backgroundType: "solid"` |
| `environmentPreset` | `"none"` \| `"apartment"` \| `"city"` \| `"dawn"` \| `"forest"` \| `"lobby"` \| `"night"` \| `"park"` \| `"studio"` \| `"sunset"` \| `"warehouse"` | HDRI environment map (affects reflections + provides soft fill) |
| `fogType` | `"none"` \| `"linear"` \| `"exp2"` | Atmospheric fog |
| `fogColor` | hex | Fog color |
| `fogNear` / `fogFar` | numbers | Linear fog start/end distance |
| `fogDensity` | 0–1 | Exponential fog density |

---

## Practical recipes

### Floor plane

```json
{
  "id": "floor",
  "name": "Floor",
  "type": "mesh",
  "visible": true,
  "position": [0, -0.05, 0],
  "rotation": [0, 0, 0],
  "scale": [1, 1, 1],
  "castShadow": false,
  "receiveShadow": true,
  "frustumCulled": true,
  "renderOrder": 0,
  "userData": "", "metadata": {}, "children": [],
  "geometry": { "type": "box", "params": { "width": 20, "height": 0.1, "depth": 20 } },
  "material": { "color": "#555555", "opacity": 1, "wireframe": false }
}
```

Position at `y = -0.05` so the top surface sits exactly at y=0.

### Transparent glass panel

```json
{
  "id": "glass",
  "name": "Glass Panel",
  "type": "mesh",
  "visible": true,
  "position": [0, 1, 0],
  "rotation": [0, 0, 0],
  "scale": [1, 1, 1],
  "castShadow": false,
  "receiveShadow": false,
  "frustumCulled": true,
  "renderOrder": 1,
  "userData": "", "metadata": {}, "children": [],
  "geometry": { "type": "box", "params": { "width": 2, "height": 2, "depth": 0.02 } },
  "material": { "color": "#aaddff", "opacity": 0.25, "wireframe": false }
}
```

### Sun + ambient combo (outdoor)

```json
[
  {
    "id": "ambient", "name": "Ambient", "type": "light", "lightType": "ambient",
    "color": "#ffffff", "intensity": 0.3,
    "groundColor": "#444444", "distance": 0, "decay": 2,
    "angle": 0.785, "penumbra": 0.1,
    "shadowIntensity": 1, "shadowBias": -0.0001, "shadowNormalBias": 0, "shadowRadius": 1,
    "visible": true, "position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1],
    "castShadow": false, "receiveShadow": false,
    "frustumCulled": true, "renderOrder": 0, "userData": "", "metadata": {}, "children": []
  },
  {
    "id": "sun", "name": "Sun", "type": "light", "lightType": "directional",
    "color": "#fff9e8", "intensity": 1.4,
    "groundColor": "#444444", "distance": 0, "decay": 2,
    "angle": 0.785, "penumbra": 0.1,
    "shadowIntensity": 1, "shadowBias": -0.0001, "shadowNormalBias": 0.02, "shadowRadius": 2,
    "visible": true, "position": [8, 12, 6], "rotation": [0,0,0], "scale": [1,1,1],
    "castShadow": true, "receiveShadow": false,
    "frustumCulled": true, "renderOrder": 0, "userData": "", "metadata": {}, "children": []
  }
]
```

### Object at a specific world position

To place a 1×1×1 cube resting on the floor at world (3, 0, -2):

```json
{
  "position": [3, 0.5, -2],
  "geometry": { "type": "box", "params": { "width": 1, "height": 1, "depth": 1 } }
}
```

`position[1] = height / 2` because Three.js geometry is centered at the origin by default.

### Grouping related objects

```json
{
  "id": "table-grp",
  "name": "Table",
  "type": "group",
  "position": [0, 0, 0],
  "rotation": [0, 0, 0],
  "scale": [1, 1, 1],
  "visible": true,
  "castShadow": false, "receiveShadow": false,
  "frustumCulled": true, "renderOrder": 0,
  "userData": "", "metadata": {},
  "children": [
    {
      "id": "tabletop", "name": "Tabletop", "type": "mesh",
      "position": [0, 0.76, 0],
      "geometry": { "type": "box", "params": { "width": 1.6, "height": 0.05, "depth": 0.8 } },
      "material": { "color": "#c8a46e", "opacity": 1, "wireframe": false },
      "castShadow": true, "receiveShadow": true,
      ...
    },
    {
      "id": "leg-fl", "name": "Leg FL", "type": "mesh",
      "position": [-0.72, 0.37, 0.34],
      "geometry": { "type": "box", "params": { "width": 0.06, "height": 0.74, "depth": 0.06 } },
      "material": { "color": "#a07850", "opacity": 1, "wireframe": false },
      "castShadow": true, "receiveShadow": false,
      ...
    }
  ]
}
```

---

## Complete minimal scene

```json
{
  "version": "1.0.0",
  "root": {
    "id": "root",
    "name": "Scene",
    "type": "group",
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
    "children": [
      {
        "id": "ambient",
        "name": "Ambient Light",
        "type": "light",
        "lightType": "ambient",
        "color": "#ffffff",
        "intensity": 0.4,
        "groundColor": "#444444",
        "distance": 0,
        "decay": 2,
        "angle": 0.785,
        "penumbra": 0.1,
        "shadowIntensity": 1,
        "shadowBias": -0.0001,
        "shadowNormalBias": 0,
        "shadowRadius": 1,
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
      },
      {
        "id": "sun",
        "name": "Sun",
        "type": "light",
        "lightType": "directional",
        "color": "#ffffff",
        "intensity": 1.2,
        "groundColor": "#444444",
        "distance": 0,
        "decay": 2,
        "angle": 0.785,
        "penumbra": 0.1,
        "shadowIntensity": 1,
        "shadowBias": -0.0001,
        "shadowNormalBias": 0,
        "shadowRadius": 1,
        "visible": true,
        "position": [5, 8, 5],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1],
        "castShadow": true,
        "receiveShadow": false,
        "frustumCulled": true,
        "renderOrder": 0,
        "userData": "",
        "metadata": {},
        "children": []
      },
      {
        "id": "floor",
        "name": "Floor",
        "type": "mesh",
        "geometry": { "type": "box", "params": { "width": 10, "height": 0.1, "depth": 10 } },
        "material": { "color": "#555555", "opacity": 1, "wireframe": false },
        "visible": true,
        "position": [0, -0.05, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1],
        "castShadow": false,
        "receiveShadow": true,
        "frustumCulled": true,
        "renderOrder": 0,
        "userData": "",
        "metadata": {},
        "children": []
      },
      {
        "id": "box-1",
        "name": "Box",
        "type": "mesh",
        "geometry": { "type": "box", "params": { "width": 1, "height": 1, "depth": 1 } },
        "material": { "color": "#4fc3f7", "opacity": 1, "wireframe": false },
        "visible": true,
        "position": [0, 0.5, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1],
        "castShadow": true,
        "receiveShadow": true,
        "frustumCulled": true,
        "renderOrder": 0,
        "userData": "",
        "metadata": {},
        "children": []
      }
    ]
  }
}
```

---

## Rules and anti-patterns

### Must do
- `root.type` must always be `"group"`.
- All `id` values must be unique strings within the entire file.
- `children` must always be present as an array (even `[]`), never `null` or absent.
- `position`, `rotation`, `scale` must always be 3-element arrays.
- Every scene must include at least one `ambient` light — otherwise geometry in shadow is completely black.
- Angles in `rotation` are **radians**. Never put degree values there.
- `version` is always the string `"1.0.0"` (three-part, quoted).

### Must not do
- **Do not** include `boundingBox` or any computed/internal Three.js state.
- **Do not** set `lightType` on a `mesh` node or `geometry`/`material` on a `light` node.
- **Do not** share the same `id` between two nodes.
- **Do not** put any nodes at the same level as `root` — everything belongs inside `root.children` (or deeper).
- **Do not** use `castShadow: true` on `ambient` or `hemisphere` lights — they don't support shadows.
- **Do not** use `castShadow: true` on transparent meshes (`opacity < 1`) — it causes artifacts.
- **Do not** omit `"children": []` on leaf nodes (light, audio, mesh without children).

### Common pitfalls

| Mistake | Fix |
|---------|-----|
| Object appears to float 0.5 units above floor | Set `position[1] = height / 2` for objects centered at their geometry center |
| Scene is all black | Add an `ambient` light — no light = no visibility |
| Shadow acne (dark streaks on lit surfaces) | Set `shadowBias: -0.0001` on the shadow-casting light |
| Transparent object obscures objects behind it | Increase `renderOrder` on the transparent mesh |
| Object invisible from certain angles | Check `frustumCulled` (keep `true`) and verify `visible: true` up the parent chain |
| Rotation looks wrong | Confirm values are in **radians**, not degrees |

---

## CAD → Scene 3D coordinate bridge

When content originates from a `.cad.json` file, the coordinate mapping is:

```
CAD X   →  Scene X   (same axis, right)
CAD Y   →  Scene Z   (CAD "up on screen" becomes "depth" in 3D)
extrusion → Scene Y  (CAD extrude direction becomes "up" in 3D)
```

Example: a CAD rect at `x=0, y=0, width=100, height=50` with `extrudeHeight=20` becomes:

```json
{
  "type": "mesh",
  "position": [50, 10, 25],
  "geometry": {
    "type": "box",
    "params": { "width": 100, "height": 20, "depth": 50 }
  }
}
```

CAD units are typically **mm** while Scene 3D units have no physical scale (treat them as meters for room-scale scenes, or use `scale` to normalize).
