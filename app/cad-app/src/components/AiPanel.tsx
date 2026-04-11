import { useEffect, useRef, useState } from 'react';
import { MemoryFS } from '@mhersztowski/core';
import { AgentPanel } from '@mhersztowski/web-client';
import type { Project } from '@mhersztowski/core-cad';
import { loadProjectFromText } from '../io/CadExporter';

// ── VFS project context (written to /CLAUDE.md) ──────────────────────────────

const CLAUDE_MD = `# CAD Project

You can work with two different scene formats:

1. **CAD format** (\`/project.cad.json\`) — 2D/3D CAD entities (lines, circles, rects, etc.)
2. **Scene 3D format** (\`/scene.json\`) — Three.js scene graph with meshes and lights

Both files are live: writing either one immediately updates the corresponding view in the editor.

---

## CAD format (/project.cad.json)

\`\`\`json
{
  "version": 1,
  "settings": { "name": "My Project", "units": "mm", "gridSize": 10, "precision": 2 },
  "layers": [
    { "id": "0", "name": "Default", "color": "#4fc3f7", "lineType": "solid", "lineWidth": 1, "visible": true, "locked": false }
  ],
  "entities": []
}
\`\`\`

### CAD entity types

All entities share: id (UUID), type, layerId ("0"), color ("bylayer" or "#rrggbb"),
lineType ("solid"|"dashed"|"dotted"|"dashdot"), lineWidth, visible, locked,
extrudeHeight (0=flat, >0=3D extrusion).

\`\`\`json
{ "type":"line",     "x1":0,"y1":0,"x2":100,"y2":0 }
{ "type":"circle",   "cx":50,"cy":50,"radius":25 }
{ "type":"arc",      "cx":0,"cy":0,"radius":50,"startAngle":0,"endAngle":1.5708 }
{ "type":"rect",     "x":0,"y":0,"width":100,"height":50 }
{ "type":"polyline", "points":[{"x":0,"y":0},{"x":50,"y":25}],"closed":false }
{ "type":"box3d",    "cx":0,"cy":0,"width":60,"depth":40,"extrudeHeight":30 }
{ "type":"cylinder3d","cx":0,"cy":0,"radius":25,"extrudeHeight":50 }
{ "type":"sphere3d", "cx":0,"cy":0,"radius":30,"extrudeHeight":60 }
\`\`\`

Angles in radians. CAD origin bottom-left, +X right, +Y up.

---

## Scene 3D format (/scene.json)

Three.js scene graph. **Use this when asked to create a 3D scene, model, or visualisation.**

\`\`\`json
{
  "version": "1.0.0",
  "root": {
    "id": "root-uuid",
    "name": "Scene",
    "type": "group",
    "visible": true,
    "position": [0,0,0],
    "rotation": [0,0,0],
    "scale": [1,1,1],
    "metadata": {},
    "children": []
  }
}
\`\`\`

Every node has: id (UUID), name, type, visible, position [x,y,z], rotation [rx,ry,rz] radians,
scale [sx,sy,sz], metadata {}, children [].

### Mesh node (type: "mesh")

\`\`\`json
{
  "id": "uuid", "name": "Box", "type": "mesh",
  "visible": true, "position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1],
  "metadata": {}, "children": [],
  "geometry": {
    "type": "box",
    "params": { "width": 1, "height": 1, "depth": 1 }
  },
  "material": { "color": "#4fc3f7", "opacity": 1, "wireframe": false }
}
\`\`\`

Geometry types and their params:
- \`"box"\` — \`{ "width", "height", "depth" }\` (default all 1)
- \`"sphere"\` — \`{ "radius" }\` (default 1)
- \`"cylinder"\` — \`{ "radiusTop", "radiusBottom", "height", "radialSegments" }\` (defaults 1,1,2,32)
- \`"cone"\` — \`{ "radius", "height" }\` (defaults 1,2)
- \`"plane"\` — \`{ "width", "height" }\` (defaults 10,10)
- \`"torus"\` — \`{ "radius", "tube" }\` (defaults 1,0.4)

### Light node (type: "light")

\`\`\`json
{
  "id": "uuid", "name": "Sun", "type": "light",
  "visible": true, "position": [5,10,5], "rotation": [0,0,0], "scale": [1,1,1],
  "metadata": {}, "children": [],
  "lightType": "directional",
  "color": "#ffffff",
  "intensity": 0.8
}
\`\`\`

lightType: \`"ambient"\` | \`"directional"\` | \`"point"\` | \`"spot"\`

### Group node (type: "group") — for hierarchy only, no extra fields.

### Coordinate system
Three.js standard: Y-axis up, right-hand coordinate system.
- \`position\`: world units (metres recommended for 3D scenes)
- \`rotation\`: Euler angles in radians (XYZ order)

### Minimal working scene example

\`\`\`json
{
  "version": "1.0.0",
  "root": {
    "id": "00000000-0000-0000-0000-000000000001",
    "name": "Scene", "type": "group", "visible": true,
    "position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1],
    "metadata": {}, "children": [
      {
        "id": "00000000-0000-0000-0000-000000000002",
        "name": "Ambient Light", "type": "light", "visible": true,
        "position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1],
        "metadata": {}, "children": [],
        "lightType": "ambient", "color": "#ffffff", "intensity": 0.4
      },
      {
        "id": "00000000-0000-0000-0000-000000000003",
        "name": "Sun", "type": "light", "visible": true,
        "position": [5,10,5], "rotation": [0,0,0], "scale": [1,1,1],
        "metadata": {}, "children": [],
        "lightType": "directional", "color": "#ffffff", "intensity": 0.8
      },
      {
        "id": "00000000-0000-0000-0000-000000000004",
        "name": "Box", "type": "mesh", "visible": true,
        "position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1],
        "metadata": {}, "children": [],
        "geometry": { "type": "box", "params": { "width": 1, "height": 1, "depth": 1 } },
        "material": { "color": "#4fc3f7", "opacity": 1, "wireframe": false }
      }
    ]
  }
}
\`\`\`

### Tips
- Always include at least one ambient light so the scene is visible.
- All IDs must be unique UUIDs.
- Writing /scene.json immediately loads it into the Scene 3D view — no button needed.
- Writing /project.cad.json updates the CAD canvas.
`;

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  project: Project;
  /** Increments whenever project entities/layers change — used to sync MemoryFS */
  version: number;
  /** Called when the AI writes /scene.json — passes the raw JSON string */
  onSceneData?: (json: string) => void;
}

export function AiPanel({ project, version, onSceneData }: Props) {
  const [fs] = useState(() => new MemoryFS());
  // Bump to tell AgentPanel the provider content changed
  const [fsVersion, setFsVersion] = useState(0);
  // Flag: true while we are writing project.cad.json ourselves (ignore the resulting event)
  const selfWriting = useRef(false);

  // ── Populate CLAUDE.md once on mount ──────────────────────────────────────

  useEffect(() => {
    const enc = new TextEncoder();
    fs.writeFile('/CLAUDE.md', enc.encode(CLAUDE_MD), { create: true, overwrite: true });
  }, [fs]);

  // ── Keep project.cad.json in sync with the live project ──────────────────

  useEffect(() => {
    const enc = new TextEncoder();
    const json = JSON.stringify(project.toJSON(), null, 2);
    selfWriting.current = true;
    fs.writeFile('/project.cad.json', enc.encode(json), { create: true, overwrite: true })
      .then(() => {
        selfWriting.current = false;
        setFsVersion(v => v + 1);
      });
  }, [fs, version, project]);

  // ── React to AI writes ────────────────────────────────────────────────────

  useEffect(() => {
    const disposable = fs.onDidChangeFile(events => {
      for (const e of events) {
        if (e.path === '/project.cad.json') {
          if (selfWriting.current) continue; // our own sync write — skip
          fs.readFile('/project.cad.json').then(data => {
            const text = new TextDecoder().decode(data);
            try {
              loadProjectFromText(text, project);
            } catch (err) {
              console.error('[AiPanel] Invalid project JSON from AI:', err);
            }
          });
        }

        if (e.path === '/scene.json') {
          fs.readFile('/scene.json').then(data => {
            const text = new TextDecoder().decode(data);
            try {
              JSON.parse(text); // validate JSON before passing up
              onSceneData?.(text);
            } catch (err) {
              console.error('[AiPanel] Invalid scene JSON from AI:', err);
            }
          });
        }
      }
    });
    return () => disposable.dispose();
  }, [fs, project, onSceneData]);

  return (
    <AgentPanel
      provider={fs}
      providerVersion={fsVersion}
      defaultConfig={{
        providerType: 'anthropic',
        temperature: 0.2,
        maxTokens: 8192,
        maxIterations: 15,
      }}
    />
  );
}
