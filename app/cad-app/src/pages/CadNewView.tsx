// CAD NEW — edytor 3D w układzie inspirowanym xDesign (drzewo projektu + viewport z 3 płaszczyznami
// + kostka nawigacji + dolna wstążka z zakładkami i narzędziami). Ikony narysowane własnym SVG.
import { useMemo, useState } from 'react';
import { Box, Typography, Menu, MenuItem, Divider } from '@mui/material';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import { Project } from '@mhersztowski/core-cad';
import { CadCanvas } from '../components/CadCanvas';
import { useProject } from '../hooks/useProject';
import type { ToolName } from '../tools/types';
import type { SketchPlane } from '../cad3d/types';

// ── Kolory motywu (jasny, jak w referencji) ───────────────────────────────────
const C = {
  bar: '#f3f4f6', barBorder: '#d7dadd', panel: '#ffffff', panelHead: '#eceef1',
  text: '#2b2f34', sub: '#5b6169', link: '#2f6fd0', icon: '#3f6fb0', iconGray: '#5a6672',
  ribbon: '#f7f8f9', tabActive: '#ffffff', tabText: '#33383e', disabled: '#b6bcc2',
};

// ── Własne ikony narzędzi (SVG, 28×28, viewBox 0 0 24 24) ──────────────────────
type IcoProps = { c?: string; size?: number };
const svg = (children: React.ReactNode, size = 28) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>{children}</svg>
);
const st = (c = C.icon, w = 1.5) => ({ stroke: c, strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' as const });
const fil = (c: string) => ({ fill: c, stroke: 'none' as const });

const ICONS: Record<string, (p: IcoProps) => React.ReactNode> = {
  home: ({ c = C.icon, size }) => svg(<><path d="M4 11 L12 4 L20 11" {...st(c, 1.6)} /><path d="M6 11 V20 H18 V11" {...st(c, 1.6)} /><rect x="10" y="14" width="4" height="6" {...st(c, 1.4)} /></>, size),
  new: ({ c = C.icon, size }) => svg(<><path d="M5 4 H13 L19 10 V20 H5 Z" {...st(c, 1.6)} /><path d="M13 4 V10 H19" {...st(c, 1.4)} /><path d="M9 14 H15 M12 11 V17" {...st('#e8a33d', 1.8)} /></>, size),
  close: ({ c = C.icon, size }) => svg(<><path d="M5 4 H13 L19 10 V20 H5 Z" {...st(c, 1.6)} /><path d="M9 12 L15 18 M15 12 L9 18" {...st('#d64545', 1.8)} /></>, size),
  save: ({ c = C.icon, size }) => svg(<><path d="M5 4 H16 L20 8 V20 H5 Z" {...st(c, 1.6)} /><rect x="8" y="4" width="7" height="5" {...fil(c)} /><rect x="8" y="13" width="8" height="5" {...st(c, 1.4)} /></>, size),
  saveas: ({ c = C.icon, size }) => svg(<><path d="M4 4 H15 L19 8 V17 H4 Z" {...st(c, 1.6)} /><rect x="7" y="4" width="7" height="4.5" {...fil(c)} /><path d="M14 20 l6 -3 l-6 -3 v2 h-4 v2 h4 z" {...fil('#3f8ad8')} /></>, size),
  solve: ({ c = C.icon, size }) => svg(<><path d="M7 6 a6 6 0 1 1 -2 5" {...st(c, 1.8)} /><path d="M7 3 L7 7 L11 7" {...st(c, 1.8)} /><path d="M17 18 a6 6 0 0 1 -2 -5" {...st(c, 1.8)} /></>, size),
  switch: ({ c = C.icon, size }) => svg(<><rect x="3" y="5" width="9" height="14" rx="1" {...st(c, 1.5)} /><rect x="13" y="5" width="8" height="14" rx="1" {...st(c, 1.5)} /><path d="M15 9 h4 M15 12 h4 M15 15 h3" {...st(c, 1.2)} /><path d="M11 8 l2 4 l-2 4" {...st('#e8a33d', 1.6)} /></>, size),
  gear: ({ c = C.iconGray, size }) => svg(<><circle cx="12" cy="12" r="3.2" {...st(c, 1.6)} /><path d="M12 3 v2 M12 19 v2 M3 12 h2 M19 12 h2 M5 5 l1.5 1.5 M17.5 17.5 L19 19 M19 5 l-1.5 1.5 M6.5 17.5 L5 19" {...st(c, 1.6)} /></>, size),
  undo: ({ c, size }) => svg(<><path d="M8 7 L4 11 L8 15" {...st(c || C.icon, 1.8)} /><path d="M4 11 H14 a5 5 0 0 1 5 5 v1" {...st(c || C.icon, 1.8)} /></>, size),
  redo: ({ c, size }) => svg(<><path d="M16 7 L20 11 L16 15" {...st(c || C.icon, 1.8)} /><path d="M20 11 H10 a5 5 0 0 0 -5 5 v1" {...st(c || C.icon, 1.8)} /></>, size),
  help: ({ c = C.icon, size }) => svg(<><circle cx="12" cy="12" r="9" {...st(c, 1.6)} /><path d="M9.5 9.5 a2.5 2.5 0 1 1 3.2 2.4 c-0.8 0.3 -1.2 0.8 -1.2 1.6 v0.5" {...st(c, 1.6)} /><circle cx="11.5" cy="17" r="0.9" {...fil(c)} /></>, size),
  // Szkic
  editsketch: ({ c = C.icon, size }) => svg(<><rect x="4" y="4" width="14" height="14" {...st(c, 1.4)} strokeDasharray="2 2" /><path d="M14 20 l6 -6 l-2 -2 l-6 6 l-1 3 z" {...st('#e8a33d', 1.4)} /><circle cx="4" cy="4" r="1.4" {...fil(c)} /><circle cx="18" cy="4" r="1.4" {...fil(c)} /></>, size),
  hand: ({ c = C.icon, size }) => svg(<path d="M8 12 V6 a1.3 1.3 0 0 1 2.6 0 V11 M10.6 11 V5 a1.3 1.3 0 0 1 2.6 0 V11 M13.2 11 V6 a1.3 1.3 0 0 1 2.6 0 V12 M15.8 9 a1.3 1.3 0 0 1 2.6 0 v4 a5 5 0 0 1 -5 5 h-1 a5 5 0 0 1 -3.5 -1.5 L5.5 16 a1.4 1.4 0 0 1 2 -2 L8 14.5" {...st(c, 1.4)} />, size),
  line: ({ c = C.icon, size }) => svg(<><path d="M5 19 L19 5" {...st(c, 1.8)} /><circle cx="5" cy="19" r="1.6" {...fil(c)} /><circle cx="19" cy="5" r="1.6" {...fil(c)} /></>, size),
  rectcorner: ({ c = C.icon, size }) => svg(<><rect x="5" y="7" width="14" height="10" {...st(c, 1.6)} /><circle cx="5" cy="7" r="1.8" {...fil('#e8a33d')} /></>, size),
  arc3: ({ c = C.icon, size }) => svg(<><path d="M5 17 A9 9 0 0 1 19 8" {...st(c, 1.8)} /><circle cx="5" cy="17" r="1.5" {...fil(c)} /><circle cx="12" cy="9.5" r="1.5" {...fil(c)} /><circle cx="19" cy="8" r="1.5" {...fil(c)} /></>, size),
  circlecenter: ({ c = C.icon, size }) => svg(<><circle cx="12" cy="12" r="7.5" {...st(c, 1.6)} /><rect x="10.6" y="10.6" width="2.8" height="2.8" {...fil(c)} /></>, size),
  point: ({ c = C.icon, size }) => svg(<circle cx="12" cy="12" r="2.4" {...fil(c)} />, size),
  spline: ({ c = C.icon, size }) => svg(<path d="M4 17 C7 8 11 8 12 12 C13 16 17 16 20 7" {...st(c, 1.8)} />, size),
  // Operacje
  cube: ({ c = C.icon, size }) => svg(<><path d="M12 3 L20 7 V16 L12 20 L4 16 V7 Z" {...st(c, 1.5)} /><path d="M4 7 L12 11 L20 7 M12 11 V20" {...st(c, 1.3)} /></>, size),
  plane: ({ c = C.icon, size }) => svg(<><path d="M4 9 L14 6 L20 9 L10 12 Z" {...st(c, 1.5)} /><path d="M17 5 V19" {...st(c, 1.5)} /><rect x="15.5" y="4" width="3" height="3" {...fil(c)} /><rect x="15.5" y="17" width="3" height="3" {...fil(c)} /></>, size),
  extrude: ({ c = C.icon, size }) => svg(<><rect x="5" y="10" width="9" height="9" {...st(c, 1.5)} /><path d="M5 10 L9 6 H18 L14 10 M14 19 L18 15 V6" {...st(c, 1.3)} /><path d="M11 7 V2 M8.5 4 L11 1.5 L13.5 4" {...st('#e8a33d', 1.6)} /></>, size),
  revolve: ({ c = C.icon, size }) => svg(<><ellipse cx="12" cy="8" rx="8" ry="3" {...st(c, 1.5)} /><path d="M4 8 v6 a8 3 0 0 0 16 0 V8" {...st(c, 1.5)} /><path d="M9 18 a5 5 0 0 0 6 0" {...st('#e8a33d', 1.6)} /></>, size),
  loft: ({ c = C.icon, size }) => svg(<><path d="M4 18 C6 8 18 16 20 6" {...st(c, 1.8)} /><ellipse cx="4" cy="18" rx="2.4" ry="1.2" {...st(c, 1.3)} /><ellipse cx="20" cy="6" rx="2.4" ry="1.2" {...st(c, 1.3)} /></>, size),
  sweep: ({ c = C.icon, size }) => svg(<><path d="M6 4 v6 a4 4 0 0 0 8 0 a4 4 0 0 1 8 0 v0" {...st(c, 1.8)} /><path d="M4 4 h4 v4" {...st(c, 1.4)} /></>, size),
  // Powierzchnie
  projcurve: ({ c = C.icon, size }) => svg(<><ellipse cx="12" cy="7" rx="8" ry="2.4" {...st(c, 1.4)} /><path d="M6 17 C9 12 15 12 18 17" {...st(c, 1.6)} /><path d="M8 8 V15 M16 8 V15" {...st(c, 1)} strokeDasharray="2 2" /></>, size),
  surfextrude: ({ c = C.icon, size }) => svg(<><path d="M4 16 C7 8 17 14 20 6" {...st(c, 1.6)} /><path d="M4 16 v-4 M20 6 v4 M12 12.5 v-4" {...st(c, 1.2)} /></>, size),
  surfloft: ({ c = C.icon, size }) => svg(<><path d="M4 15 Q12 5 20 12" {...st(c, 1.6)} /><path d="M4 19 Q12 9 20 16" {...st(c, 1.4)} /><path d="M4 15 v4 M20 12 v4" {...st(c, 1.2)} /></>, size),
  fill: ({ c = C.icon, size }) => svg(<><path d="M4 10 C8 4 16 4 20 10 C16 14 8 14 4 10 Z" {...st(c, 1.5)} /><path d="M8 10 h8 M10 8 h4" {...st(c, 1)} /></>, size),
  // Podpodział
  subrect: ({ c = C.icon, size }) => svg(<><rect x="4" y="6" width="16" height="12" {...st(c, 1.4)} /><path d="M9.3 6 V18 M14.6 6 V18 M4 10 H20 M4 14 H20" {...st(c, 0.9)} /></>, size),
  primextrude: ({ c = C.icon, size }) => svg(<><path d="M12 3 L20 7 V16 L12 20 L4 16 V7 Z" {...st(c, 1.4)} /><path d="M4 7 L12 11 L20 7 M12 11 V20" {...st(c, 1.1)} /><path d="M12 11 V4 M9.5 6 L12 3.5 L14.5 6" {...st('#e8a33d', 1.4)} /></>, size),
  mergesurf: ({ c = C.icon, size }) => svg(<><path d="M4 8 L10 5 L12 9 L6 12 Z" {...st(c, 1.4)} /><path d="M12 9 L18 6 L20 10 L14 13 Z" {...st(c, 1.4)} /></>, size),
  // Złożenie
  extref: ({ c = C.icon, size }) => svg(<><path d="M8 12 a3 3 0 0 1 3 -3 h2 a3 3 0 0 1 0 6 h-1" {...st(c, 1.7)} /><path d="M16 12 a3 3 0 0 1 -3 3 h-2 a3 3 0 0 1 0 -6 h1" {...st(c, 1.7)} /><path d="M17 16 l2 2 l3 -3" {...st('#4caf50', 1.8)} /></>, size),
  insertnew: ({ c = C.icon, size }) => svg(<><path d="M5 5 H13 L19 11 V19 H5 Z" {...st(c, 1.5)} /><path d="M12 8 V2 M9.5 4 L12 1.5 L14.5 4" {...st('#e8a33d', 1.5)} /></>, size),
  insert: ({ c = C.icon, size }) => svg(<><path d="M5 4 H13 L19 10 V20 H5 Z" {...st(c, 1.5)} /><path d="M13 4 V10 H19" {...st(c, 1.2)} /><path d="M8 15 h7 M11.5 12 v6" {...st(c, 1.4)} /></>, size),
  compmake: ({ c = C.icon, size }) => svg(<><path d="M12 3 L19 7 V15 L12 19 L5 15 V7 Z" {...st(c, 1.4)} /><path d="M5 7 L12 11 L19 7 M12 11 V19" {...st(c, 1.1)} /><path d="M17 5 l2 -1 l1 2" {...st('#e8a33d', 1.4)} /></>, size),
  replace: ({ c = C.icon, size }) => svg(<><path d="M12 3 L19 7 V15 L12 19 L5 15 V7 Z" {...st(c, 1.4)} /><path d="M5 7 L12 11 L19 7 M12 11 V19" {...st(c, 1.1)} /><path d="M15 15 l3 3 l-3 3 M9 21 l-3 -3 l3 -3" {...st('#e8a33d', 1.4)} /></>, size),
  pattern: ({ c = C.icon, size }) => svg(<><rect x="4" y="4" width="4" height="4" {...st(c, 1.3)} /><rect x="10" y="4" width="4" height="4" {...st(c, 1.3)} /><rect x="16" y="4" width="4" height="4" {...st(c, 1.3)} /><rect x="4" y="10" width="4" height="4" {...st(c, 1.3)} /><rect x="10" y="10" width="4" height="4" {...st(c, 1.3)} /></>, size),
  // Wskazówki projektowe
  training: ({ c = C.icon, size }) => svg(<><rect x="4" y="4" width="12" height="16" rx="1" {...st(c, 1.4)} /><path d="M7 8 h6 M7 11 h6 M7 14 h4" {...st(c, 1.1)} /><path d="M15 15 l3 -3 l3 3 v5 h-6 z" {...fil('#7aa0cf')} /></>, size),
  clamp: ({ c = C.icon, size }) => svg(<><path d="M6 4 v10 a3 3 0 0 0 6 0" {...st(c, 1.6)} /><rect x="3" y="14" width="8" height="3" rx="1" {...st(c, 1.4)} /><path d="M16 6 v10 M14 8 l2 -2 l2 2" {...st(c, 1.4)} /></>, size),
  force: ({ c = C.icon, size }) => svg(<><path d="M8 3 v14 M12 3 v14 M16 3 v14" {...st(c, 1.6)} /><path d="M6 15 l2 3 l2 -3 M10 15 l2 3 l2 -3 M14 15 l2 3 l2 -3" {...st(c, 1.6)} /></>, size),
  newproject: ({ c = C.icon, size }) => svg(<><path d="M12 3 L19 7 V15 L12 19 L5 15 V7 Z" {...st(c, 1.5)} /><path d="M5 7 L12 11 L19 7 M12 11 V19" {...st(c, 1.2)} /></>, size),
  casemgr: ({ c = C.icon, size }) => svg(<><rect x="4" y="4" width="16" height="16" rx="1" {...st(c, 1.4)} /><path d="M8 4 V20 M12 4 V20 M16 4 V20 M8 8 h8" {...st(c, 1)} /></>, size),
  profiles: ({ c = C.icon, size }) => svg(<><ellipse cx="12" cy="7" rx="7" ry="2.4" {...st(c, 1.4)} /><ellipse cx="12" cy="12" rx="7" ry="2.4" {...st(c, 1.4)} /><ellipse cx="12" cy="17" rx="7" ry="2.4" {...st(c, 1.4)} /></>, size),
  // Narzędzia
  lasso: ({ c = C.icon, size }) => svg(<><path d="M6 8 a6 4 0 1 1 8 3 c-2 1 -2 3 0 4" {...st(c, 1.6)} /><circle cx="8" cy="18" r="1.6" {...st(c, 1.4)} /></>, size),
  image: ({ c = C.icon, size }) => svg(<><rect x="4" y="5" width="16" height="12" rx="1" {...st(c, 1.4)} /><circle cx="9" cy="10" r="1.5" {...fil(c)} /><path d="M5 16 L10 11 L13 14 L16 11 L19 15" {...st(c, 1.3)} /></>, size),
  catalog: ({ c = C.icon, size }) => svg(<><circle cx="12" cy="12" r="8" {...st(c, 1.5)} /><path d="M4 12 h16 M12 4 a12 8 0 0 1 0 16 a12 8 0 0 1 0 -16" {...st(c, 1.1)} /></>, size),
  color: ({ c = C.icon, size }) => svg(<><circle cx="12" cy="12" r="8" {...st(c, 1.4)} /><path d="M12 4 a8 8 0 0 1 0 16 a4 4 0 0 1 0 -8 a2 2 0 0 0 0 -4 a4 4 0 0 1 0 -4 z" {...fil('#e0a020')} /><circle cx="8" cy="9" r="1.1" {...fil('#d64545')} /><circle cx="8" cy="15" r="1.1" {...fil('#3f8ad8')} /></>, size),
  measure: ({ c = C.icon, size }) => svg(<><rect x="3" y="8" width="18" height="6" rx="1" transform="rotate(-20 12 11)" {...st(c, 1.5)} /><path d="M7 8 v2 M10 7 v2 M13 6 v2 M16 5 v2" {...st(c, 1.2)} /></>, size),
  massprops: ({ c = C.icon, size }) => svg(<><path d="M12 3 v16" {...st(c, 1.5)} /><path d="M5 7 h14" {...st(c, 1.5)} /><path d="M5 7 L3 12 h4 z M19 7 L17 12 h4 z" {...st(c, 1.4)} /><rect x="9" y="19" width="6" height="2" {...st(c, 1.4)} /></>, size),
  // Stan w cyklu
  info: ({ c = C.icon, size }) => svg(<><rect x="4" y="4" width="16" height="16" rx="1" {...st(c, 1.4)} /><path d="M8 8 h8 M8 12 h8 M8 16 h5" {...st(c, 1.3)} /></>, size),
  maturity: ({ c = C.icon, size }) => svg(<><path d="M4 8 h10 l3 -2 v4 z" {...st('#4caf50', 1.5)} /><path d="M4 8 v10 h12 v-6" {...st(c, 1.4)} /><path d="M8 14 l2 2 l4 -4" {...st('#4caf50', 1.6)} /></>, size),
  revisions: ({ c = C.icon, size }) => svg(<><path d="M6 5 h12 M6 9 h12 M6 13 h8" {...st(c, 1.4)} /><circle cx="17" cy="16" r="3" {...st('#4caf50', 1.4)} /><path d="M17 14.5 v1.5 h1.2" {...st('#4caf50', 1.3)} /></>, size),
  newversion: ({ c = C.icon, size }) => svg(<><path d="M8 3 v14" {...st(c, 1.6)} /><circle cx="8" cy="19" r="1.6" {...st(c, 1.5)} /><circle cx="8" cy="4" r="1.6" {...st(c, 1.5)} /><path d="M16 4 v6 M13.5 7 h5" {...st('#e8a33d', 1.6)} /></>, size),
  newbranch: ({ c = C.icon, size }) => svg(<><circle cx="7" cy="6" r="1.8" {...st(c, 1.5)} /><circle cx="7" cy="18" r="1.8" {...st(c, 1.5)} /><circle cx="17" cy="8" r="1.8" {...st(c, 1.5)} /><path d="M7 8 v8 M7 12 a6 6 0 0 0 8 -3" {...st(c, 1.4)} /></>, size),
  lock: ({ c = C.icon, size }) => svg(<><rect x="6" y="10" width="12" height="9" rx="1.5" {...st(c, 1.5)} /><path d="M8 10 V7 a4 4 0 0 1 8 0 v3" {...st(c, 1.5)} /><circle cx="12" cy="14.5" r="1.4" {...fil('#4caf50')} /></>, size),
  // Marketplace
  make: ({ c = C.icon, size }) => svg(<><path d="M5 8 L12 4 L19 8 L12 12 Z" {...st(c, 1.4)} /><path d="M5 8 v7 l7 4 l7 -4 V8 M12 12 v7" {...st(c, 1.2)} /><path d="M9 5 l3 -2 l3 2" {...st('#e8a33d', 1.4)} /></>, size),
  partsupply: ({ c = C.icon, size }) => svg(<><circle cx="10" cy="10" r="4" {...st(c, 1.5)} /><path d="M13 13 l6 6" {...st(c, 1.8)} /><circle cx="19" cy="6" r="2.4" {...st('#e8a33d', 1.4)} /></>, size),
  // Widok
  lockrot: ({ c = C.icon, size }) => svg(<><path d="M6 12 a6 6 0 1 1 3 5" {...st(c, 1.6)} /><path d="M9 17 L9 20 M9 20 L12 20" {...st(c, 1.6)} /><rect x="14" y="14" width="6" height="5" rx="1" {...st(c, 1.3)} /><path d="M15.5 14 v-1.2 a1.5 1.5 0 0 1 3 0 V14" {...st(c, 1.2)} /></>, size),
  reframe: ({ c = C.icon, size }) => svg(<><path d="M4 8 V4 h4 M20 8 V4 h-4 M4 16 v4 h4 M20 16 v4 h-4" {...st(c, 1.6)} /><rect x="9" y="9" width="6" height="6" {...st(c, 1.3)} /></>, size),
  pan: ({ c = C.icon, size }) => svg(<><path d="M12 4 v16 M4 12 h16" {...st(c, 1.6)} /><path d="M12 4 l-2 2 M12 4 l2 2 M12 20 l-2 -2 M12 20 l2 -2 M4 12 l2 -2 M4 12 l2 2 M20 12 l-2 -2 M20 12 l-2 2" {...st(c, 1.5)} /></>, size),
  rotate: ({ c = C.icon, size }) => svg(<><path d="M6 8 a7 7 0 1 1 -1 6" {...st(c, 1.8)} /><path d="M6 4 v4 h4" {...st(c, 1.8)} /></>, size),
  zoom: ({ c = C.icon, size }) => svg(<><circle cx="10" cy="10" r="6" {...st(c, 1.6)} /><path d="M14.5 14.5 L20 20" {...st(c, 1.8)} /><path d="M10 7.5 v5 M7.5 10 h5" {...st(c, 1.4)} /></>, size),
  iso: ({ c = C.icon, size }) => svg(<><path d="M12 3 L20 7 V16 L12 20 L4 16 V7 Z" {...fil('#cfe0f2')} /><path d="M12 3 L20 7 V16 L12 20 L4 16 V7 Z" {...st(c, 1.4)} /><path d="M4 7 L12 11 L20 7 M12 11 V20" {...st(c, 1.2)} /></>, size),
  // Rozszerzenia (szkic / operacje / powierzchnie / podpodział / złożenie / narzędzia / widok)
  ellipse: ({ c = C.icon, size }) => svg(<ellipse cx="12" cy="12" rx="8" ry="5" {...st(c, 1.6)} />, size),
  polygon: ({ c = C.icon, size }) => svg(<path d="M12 3 L19 8 L16 17 H8 L5 8 Z" {...st(c, 1.5)} />, size),
  slot: ({ c = C.icon, size }) => svg(<><rect x="4" y="8" width="16" height="8" rx="4" {...st(c, 1.5)} /><circle cx="8" cy="12" r="1.3" {...fil(c)} /><circle cx="16" cy="12" r="1.3" {...fil(c)} /></>, size),
  textT: ({ c = C.icon, size }) => svg(<><path d="M5 6 H19 M12 6 V18 M9 18 H15" {...st(c, 1.8)} /></>, size),
  dim: ({ c = C.icon, size }) => svg(<><path d="M4 8 v8 M20 8 v8 M4 12 H20" {...st(c, 1.5)} /><path d="M4 12 l3 -2 v4 z M20 12 l-3 -2 v4 z" {...fil(c)} /></>, size),
  trim: ({ c = C.icon, size }) => svg(<><path d="M4 6 l8 8" {...st(c, 1.6)} /><path d="M20 6 l-8 8" {...st('#d64545', 1.6)} strokeDasharray="2 2" /><circle cx="7" cy="18" r="2" {...st(c, 1.4)} /><circle cx="17" cy="18" r="2" {...st(c, 1.4)} /></>, size),
  split: ({ c = C.icon, size }) => svg(<><path d="M12 3 V21" {...st('#d64545', 1.6)} strokeDasharray="2 2" /><circle cx="7" cy="12" r="3.5" {...st(c, 1.5)} /><circle cx="17" cy="12" r="3.5" {...st(c, 1.5)} /></>, size),
  offset2: ({ c = C.icon, size }) => svg(<><path d="M5 16 A7 7 0 0 1 16 5" {...st(c, 1.6)} /><path d="M8 19 A10 10 0 0 1 19 8" {...st(c, 1.4)} strokeDasharray="3 2" /></>, size),
  mirror: ({ c = C.icon, size }) => svg(<><path d="M12 3 V21" {...st('#e8a33d', 1.6)} strokeDasharray="3 2" /><path d="M9 6 L4 12 L9 18 Z" {...st(c, 1.4)} /><path d="M15 6 L20 12 L15 18 Z" {...st(c, 1.4)} /></>, size),
  convert: ({ c = C.icon, size }) => svg(<><path d="M5 8 H14 M14 8 l-3 -3 M14 8 l-3 3" {...st(c, 1.6)} /><path d="M19 16 H10 M10 16 l3 -3 M10 16 l3 3" {...st(c, 1.6)} /></>, size),
  hole: ({ c = C.icon, size }) => svg(<><path d="M12 3 L20 7 V16 L12 20 L4 16 V7 Z" {...st(c, 1.4)} /><ellipse cx="12" cy="8" rx="3" ry="1.3" {...st('#d64545', 1.5)} /><path d="M9 8 v6 a3 1.3 0 0 0 6 0 V8" {...st('#d64545', 1.3)} /></>, size),
  draft: ({ c = C.icon, size }) => svg(<><path d="M6 20 L10 4 L18 4 L16 20 Z" {...st(c, 1.5)} /><path d="M10 4 L6 20" {...st('#e8a33d', 1.6)} /></>, size),
  shell: ({ c = C.icon, size }) => svg(<><path d="M12 3 L20 7 V16 L12 20 L4 16 V7 Z" {...st(c, 1.4)} /><path d="M6 8 L12 11 V18 M18 8 L12 11" {...st(c, 1.1)} /><ellipse cx="12" cy="6.5" rx="4" ry="1.6" {...st('#e8a33d', 1.4)} /></>, size),
  thicken: ({ c = C.icon, size }) => svg(<><path d="M4 14 C7 7 17 13 20 6" {...st(c, 1.6)} /><path d="M4 18 C7 11 17 17 20 10" {...st(c, 1.6)} /></>, size),
  rib: ({ c = C.icon, size }) => svg(<><path d="M4 18 L4 8 L12 12 L20 6 V16" {...st(c, 1.4)} /><path d="M11 12 V19 M8 16 h6" {...st('#e8a33d', 1.5)} /></>, size),
  moveface: ({ c = C.icon, size }) => svg(<><path d="M5 8 h9 v9 h-9 z" {...st(c, 1.4)} /><path d="M5 8 l3 -3 h9 l-3 3 M14 17 l3 -3 v-9" {...st(c, 1.1)} /><path d="M16 12 h5 M19 10 l2 2 l-2 2" {...st('#e8a33d', 1.5)} /></>, size),
  delface: ({ c = C.icon, size }) => svg(<><path d="M12 3 L20 7 V16 L12 20 L4 16 V7 Z" {...st(c, 1.3)} /><path d="M4 7 L12 11 L20 7 M12 11 V20" {...st(c, 1.1)} /><path d="M15 5 l4 4 M19 5 l-4 4" {...st('#d64545', 1.6)} /></>, size),
  scale: ({ c = C.icon, size }) => svg(<><rect x="5" y="9" width="10" height="10" {...st(c, 1.4)} /><path d="M12 5 h7 v7 M19 5 l-7 7" {...st('#e8a33d', 1.5)} /></>, size),
  mate: ({ c = C.icon, size }) => svg(<><path d="M4 6 h6 v12 h-6 z" {...st(c, 1.4)} /><path d="M14 6 h6 v12 h-6 z" {...st(c, 1.4)} /><path d="M10 12 h4" {...st('#4caf50', 1.8)} /></>, size),
  symmetry: ({ c = C.icon, size }) => svg(<><path d="M12 3 V21" {...st('#e8a33d', 1.6)} strokeDasharray="3 2" /><circle cx="7" cy="8" r="2.4" {...st(c, 1.4)} /><circle cx="17" cy="8" r="2.4" {...st(c, 1.4)} /><rect x="4.6" y="15" width="4.8" height="4" {...st(c, 1.4)} /><rect x="14.6" y="15" width="4.8" height="4" {...st(c, 1.4)} /></>, size),
  section: ({ c = C.icon, size }) => svg(<><path d="M12 3 L20 7 V16 L12 20 L4 16 V7 Z" {...st(c, 1.3)} /><path d="M4 12 H20" {...st('#d64545', 1.6)} /><path d="M12 11 V20" {...st(c, 1.1)} /></>, size),
  unlock: ({ c = C.icon, size }) => svg(<><rect x="6" y="10" width="12" height="9" rx="1.5" {...st(c, 1.5)} /><path d="M8 10 V7 a4 4 0 0 1 7.5 -2" {...st(c, 1.5)} /><circle cx="12" cy="14.5" r="1.4" {...fil('#e8a33d')} /></>, size),
  print3d: ({ c = C.icon, size }) => svg(<><path d="M5 9 L12 5 L19 9 L12 13 Z" {...st(c, 1.4)} /><path d="M5 9 v6 l7 4 l7 -4 V9" {...st(c, 1.2)} /><text x="12" y="20" fontSize="6" fill={c} textAnchor="middle" fontFamily="sans-serif">3D</text></>, size),
  dxf: ({ c = C.icon, size }) => svg(<><path d="M6 4 H14 L18 8 V20 H6 Z" {...st(c, 1.4)} /><path d="M14 4 V8 H18" {...st(c, 1.1)} /><text x="12" y="17" fontSize="5" fill={c} textAnchor="middle" fontFamily="sans-serif">DXF</text></>, size),
  share: ({ c = C.icon, size }) => svg(<><circle cx="6" cy="12" r="2.4" {...st(c, 1.5)} /><circle cx="17" cy="6" r="2.4" {...st(c, 1.5)} /><circle cx="17" cy="18" r="2.4" {...st(c, 1.5)} /><path d="M8 11 l7 -4 M8 13 l7 4" {...st(c, 1.3)} /></>, size),
  param: ({ c = C.icon, size }) => svg(<><path d="M6 6 h8 M6 12 h12 M6 18 h6" {...st(c, 1.4)} /><path d="M17 15 v6 M14 18 h6" {...st('#e8a33d', 1.6)} /></>, size),
  zebra: ({ c = C.icon, size }) => svg(<><circle cx="12" cy="12" r="8" {...st(c, 1.4)} /><path d="M6 9 h12 M5 12 h14 M6 15 h12" {...st(c, 1.6)} /></>, size),
  thickness: ({ c = C.icon, size }) => svg(<><path d="M6 6 C10 4 14 4 18 6 V16 C14 18 10 18 6 16 Z" {...st(c, 1.4)} /><path d="M9 8 v8 M15 8 v8" {...st('#e8a33d', 1.3)} /></>, size),
  subdiv: ({ c = C.icon, size }) => svg(<><path d="M12 3 L20 7 V16 L12 20 L4 16 V7 Z" {...st(c, 1.3)} /><path d="M4 7 L12 11 L20 7 M12 11 V20 M8 5 L8 13 M16 5 L16 13 M4 11.5 L20 11.5" {...st(c, 0.9)} /></>, size),
  loops: ({ c = C.icon, size }) => svg(<><path d="M12 3 L20 7 V16 L12 20 L4 16 V7 Z" {...st(c, 1.3)} /><path d="M12 3 V20" {...st('#e8a33d', 1.5)} /><path d="M4 7 L20 7" {...st('#e8a33d', 1.5)} /></>, size),
  mechanism: ({ c = C.icon, size }) => svg(<><circle cx="8" cy="12" r="4" {...st(c, 1.4)} /><circle cx="8" cy="12" r="1.2" {...fil(c)} /><circle cx="17" cy="9" r="2.5" {...st(c, 1.4)} /><path d="M10 10 L15 8" {...st(c, 1.4)} /></>, size),
  detect: ({ c = C.icon, size }) => svg(<><circle cx="10" cy="10" r="6" {...st(c, 1.5)} /><path d="M14.5 14.5 L20 20" {...st(c, 1.8)} /><path d="M8 10 l1.5 1.5 L13 8" {...st('#4caf50', 1.6)} /></>, size),
};

const Ico = ({ name, c, size = 28 }: { name: string; c?: string; size?: number }) => <>{(ICONS[name] ?? ICONS.help)({ c, size })}</>;

// ── Definicja wstążki: wspólne + narzędzia zależne od zakładki ─────────────────
type Tool = { id: string; label: string; ico: string; disabled?: boolean; tool?: ToolName };
const COMMON: Tool[] = [
  { id: 'home', label: 'Strona\nglówna', ico: 'home' },
  { id: 'new', label: 'Nowy', ico: 'new' },
  { id: 'close', label: 'Zamknij', ico: 'close' },
  { id: 'save', label: 'Zapisz', ico: 'save' },
  { id: 'saveas', label: 'Zapisz jako', ico: 'saveas' },
  { id: 'solve', label: 'Rozwiąż', ico: 'solve' },
  { id: 'switch', label: 'Przełącz\naplikację', ico: 'switch' },
  { id: 'prefs', label: 'Wspólne\npreferencje', ico: 'gear' },
  { id: 'undo', label: 'Cofnij', ico: 'undo', disabled: true },
  { id: 'redo', label: 'Ponów', ico: 'redo', disabled: true },
  { id: 'help', label: 'Pomoc dla\nużytkown…', ico: 'help' },
];
const TABS = ['Standard', 'Szkic', 'Operacje', 'Powierzchnie', 'Podpodział', 'Złożenie', 'Wskazówki projektowe', 'Narzędzia', 'Stan w cyklu', 'Marketplace', 'Widok'];
const T = (label: string, ico: string, tool?: ToolName): Tool => ({ id: `${label}-${ico}`, label, ico, tool });
const RIBBONS: Record<string, Tool[]> = {
  Standard: [],
  Szkic: [
    T('Utwórz lub\nedytuj szkic', 'editsketch', 'select'), T('Gest', 'hand', 'select'), T('Linia', 'line', 'line'), T('Prostokąt z\nnarożnika', 'rectcorner', 'rect'),
    T('Łuk\ntrzypunkt…', 'arc3', 'arc'), T('Okrąg ze\nśrodka', 'circlecenter', 'circle'), T('Elipsa', 'ellipse', 'circle'), T('Wielobok', 'polygon', 'polyline'),
    T('Splajn\nprzez punkt', 'spline', 'freehand'), T('Szczelina z\nlinii…', 'slot', 'rect'), T('Tekst', 'textT', 'text'), T('Punkt', 'point', 'select'),
    T('Wymiar', 'dim', 'dimension'), T('Zaokrągleni\ne szkicu', 'offset2', 'fillet'), T('Podziel\nelement', 'split', 'trim'), T('Przytnij lub\nwydłuż', 'trim', 'trim'),
    T('Szyk\nliniowy…', 'pattern', 'copy'), T('Odsunięcie\nszkicu', 'offset2', 'offset'), T('Lustro', 'mirror', 'copy'), T('Konwertuj\nelementy', 'convert', 'select'),
    T('Wstaw\nszkic', 'insert', 'image'), T('Analiza\nszkicu', 'detect', 'select'),
  ],
  Operacje: [
    T('Sześcian', 'cube'), T('Płaszczyzn\na', 'plane'), T('Wyciągnięci\ne', 'extrude'), T('Obrót', 'revolve'),
    T('Wyciągnięci\ne po…', 'loft'), T('Wyciągnięci\ne po…', 'sweep'), T('Zaokrągleni\ne', 'offset2'), T('Otwór', 'hole'),
    T('Pochylenie', 'draft'), T('Skorupa', 'shell'), T('Pogrub', 'thicken'), T('Lustro', 'mirror'),
    T('Szyk\nliniowy', 'pattern'), T('Żebro', 'rib'), T('Zawijaj', 'thicken'), T('Podziel\nścianę', 'split'),
    T('Połącz', 'mergesurf'), T('Przenieś\nścianę', 'moveface'), T('Usuń\nścianę', 'delface'), T('Skala', 'scale'),
    T('Konwertuj\ngeometrię', 'convert'), T('Wstaw\nścianę', 'insert'), T('Konwertuj\ndo…', 'primextrude'),
  ],
  Powierzchnie: [
    T('Rzut\nkrzywej', 'projcurve'), T('Wyciągnięci\ne…', 'surfextrude'), T('Powierzchn\nia przez…', 'surfloft'), T('Powierzchn\nia…', 'surfloft'),
    T('Powierzchn\nia…', 'sweep'), T('Wypełnieni\ne…', 'fill'), T('Połącz', 'mergesurf'), T('Przycięcie\npowierzchni', 'trim'),
    T('Odsunięcie', 'offset2'), T('Wydłuż\npowierzc…', 'surfextrude'), T('Powierzchn\nia…', 'surfloft'),
  ],
  Podpodział: [
    T('Utwórz lub\nedytuj szkic', 'editsketch'), T('Sześcian', 'cube'), T('Prostokąt', 'subrect'), T('Pierwotne\nwyciągni…', 'primextrude'),
    T('Wyciągnięci\ne', 'extrude'), T('Scal\npowierzc…', 'mergesurf'), T('Wstaw\npętle', 'loops'), T('Wykonaj\npodpodzi…', 'subdiv'),
    T('Zagięcie', 'draft'), T('Wyrównaj\npunkty…', 'point'), T('Wypełnij\nkrawędzie', 'fill'), T('Przetnij\npłaszczy…', 'section'),
    T('Usuń\nściany/pętle', 'delface'), T('Zgięcie po\nłuku', 'arc3'), T('Skaluj wg\nodległości', 'scale'), T('Gięcie', 'thicken'),
    T('Odbij\nsymetrię', 'mirror'), T('Strefa\nrobocza…', 'subrect'), T('Włącz\nmiękki wł.', 'lasso'), T('Wybór\nmiękki wł.', 'lasso'), T('Łącze', 'mergesurf'),
  ],
  Złożenie: [
    T('Odniesienia\nzewnętrzne', 'extref'), T('Wstaw\nnowy…', 'insertnew'), T('Wstawka', 'insert'), T('Komponent\nMake', 'compmake'),
    T('Zastąp\nkomponent', 'replace'), T('Liniowy\nszyk…', 'pattern'), T('Lustro', 'mirror'), T('Kopiuj z\nwiązaniami', 'insert'),
    T('Inteligentne\nwiązanie', 'mate'), T('Wiązanie', 'mate'), T('Symetria', 'symmetry'), T('Połączenie\nkoła…', 'mechanism'),
    T('Wykrywani\ne…', 'detect'), T('Informacje\no sesji', 'info'), T('Struktura\nzłożenia AI', 'casemgr'), T('Utwórz\nzłożenie …', 'compmake'),
    T('Szkic do\nkompone…', 'editsketch'), T('Mechanizm', 'mechanism'), T('Sterownik', 'gear'), T('Kontakt w\n3D', 'cube'),
    T('Odtwarzacz\nkinematy…', 'solve'), T('Status\nmechaniz…', 'info'),
  ],
  'Wskazówki projektowe': [
    T('Asystent\nszkolenia', 'training'), T('Zacisk', 'clamp'), T('Siła', 'force'), T('Nowy\nprojekt', 'newproject'),
    T('Menedżer\nprzypadk…', 'casemgr'), T('Utwórz\nprofile', 'profiles'),
  ],
  Narzędzia: [
    T('Wybór\nlasso', 'lasso'), T('Wstaw\nobraz', 'image'), T('Przeglądar\nka…', 'catalog'), T('Kolor', 'color'),
    T('Zmierz', 'measure'), T('Właściwośc\ni masy', 'massprops'), T('Kontrola\nsiatki', 'subdiv'), T('Pomoc\nDFM', 'help'),
    T('Analiza\npochylenia', 'draft'), T('Analiza\npodcięcia', 'section'), T('Analiza\ngrubości', 'thickness'), T('Analiza\nżebry', 'zebra'),
    T('Wstaw\nuporządk…', 'insert'), T('Utwórz\nparametr', 'param'), T('Aktualizuj\nzawartość', 'solve'), T('Wstaw\nśrodowisko', 'image'),
    T('Udostępnij', 'share'), T('Drukuj 3D', 'print3d'), T('Fab\nConnect', 'partsupply'), T('Zapisz jako\nDXF', 'dxf'),
  ],
  'Stan w cyklu': [
    T('Informacje', 'info'), T('Zmień\ndojrzałość', 'maturity'), T('Poprawki', 'revisions'), T('Nowa\nwersja', 'newversion'),
    T('Nowa gałąź', 'newbranch'), T('Zablokuj', 'lock'), T('Odblokuj', 'unlock'),
  ],
  Marketplace: [T('Make', 'make'), T('PartSupply', 'partsupply')],
  Widok: [
    T('Zablokuj\nobrót', 'lockrot'), T('Zmień\nramkę', 'reframe'), T('Przesuwani\ne', 'pan'), T('Obróć', 'rotate'),
    T('Powiększa\nnie lub…', 'zoom'), T('Widok\naksonom…', 'iso'), T('Filtry\nwidoku', 'detect'), T('Tryby\npodglądu', 'catalog'),
    T('Jakość\nwizualna', 'zebra'), T('Widok\nprzekroju', 'section'), T('Tryb\ndotykowy', 'hand'), T('Ukryj ślad z\nokruszków…', 'convert'),
    T('Ukryj\nszybkie…', 'lasso'),
  ],
};

// ── Przycisk narzędzia wstążki ────────────────────────────────────────────────
function ToolBtn({ t, onClick, active }: { t: Tool; onClick?: () => void; active?: boolean }) {
  return (
    <Box title={t.label.replace(/\n/g, ' ')} onClick={t.disabled ? undefined : onClick} sx={{ width: 62, minWidth: 62, flexShrink: 0, height: 62, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', pt: 0.4, gap: 0.2, borderRadius: 0.75, cursor: t.disabled ? 'default' : 'pointer', opacity: t.disabled ? 0.4 : 1, bgcolor: active ? '#dcecfd' : 'transparent', border: active ? '1px solid #9ac0f0' : '1px solid transparent', '&:hover': { bgcolor: t.disabled ? 'transparent' : active ? '#dcecfd' : '#e9edf2' } }}>
      <Ico name={t.ico} c={t.disabled ? C.disabled : undefined} size={30} />
      <Typography sx={{ fontSize: 10.5, lineHeight: 1.05, textAlign: 'center', color: C.text, whiteSpace: 'pre-line', mt: 0.1 }}>{t.label}</Typography>
    </Box>
  );
}

// ── Viewport 3D: trzy przecinające się półprzezroczyste płaszczyzny + strzałki ──
function PlanesScene() {
  const planeMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#6f97c6', transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }), []);
  const arrow = (rot: [number, number, number], pos: [number, number, number], col = '#2f5c93') => (
    <mesh position={pos} rotation={rot}><coneGeometry args={[0.13, 0.28, 3]} /><meshBasicMaterial color={col} /></mesh>
  );
  return (
    <Canvas camera={{ position: [3.2, 2.4, 3.6], fov: 35 }} gl={{ alpha: true, antialias: true }} style={{ width: '100%', height: '100%' }}>
      <ambientLight intensity={0.9} />
      {/* XY (pozioma) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={planeMat}><planeGeometry args={[2.2, 2.2]} /><Edges scale={1} threshold={15} color="#4d78ad" /></mesh>
      {/* ZX (pionowa, front) */}
      <mesh rotation={[0, 0, 0]} material={planeMat}><planeGeometry args={[1.5, 1.5]} /><Edges color="#4d78ad" /></mesh>
      {/* YZ (pionowa, bok) */}
      <mesh rotation={[0, Math.PI / 2, 0]} material={planeMat}><planeGeometry args={[1.5, 1.5]} /><Edges color="#4d78ad" /></mesh>
      {arrow([0, 0, -Math.PI / 2], [0.95, 0.02, 0.6])}
      {arrow([0, Math.PI / 2, -Math.PI / 2], [-0.6, 0.02, 0.95])}
      {arrow([Math.PI / 2, 0, 0], [0.02, 0.75, 0.02])}
      {/* Domyślne gizmo orientacji osi (X/Y/Z) — jak w scene3d, w prawym górnym rogu */}
      <GizmoHelper alignment="top-right" margin={[80, 80]}>
        <GizmoViewport axisColors={['#e0533d', '#5db34a', '#3f9ad6']} labelColor="#2b2f34" />
      </GizmoHelper>
      {/* Sterowanie: scroll = zoom, środkowy przycisk = obrót, lewy/prawy = przesuwanie */}
      <OrbitControls enableDamping dampingFactor={0.12} rotateSpeed={0.7} makeDefault enableZoom zoomSpeed={0.9}
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN }} />
    </Canvas>
  );
}

// ── Drzewo „Menedżer projektu" ────────────────────────────────────────────────
const treeIco = (d: string, c = C.icon) => <svg width={17} height={17} viewBox="0 0 24 24">{svg(<path d={d} {...st(c, 1.5)} />, 17).props.children}</svg>;
const Sync = () => <svg width={13} height={13} viewBox="0 0 24 24"><path d="M6 8 a7 7 0 0 1 12 -2" {...st('#2f6fd0', 1.8)} /><path d="M18 6 v-3 M18 6 h-3" {...st('#2f6fd0', 1.8)} /><path d="M18 16 a7 7 0 0 1 -12 2" {...st('#2f6fd0', 1.8)} /><path d="M6 18 v3 M6 18 h3" {...st('#2f6fd0', 1.8)} /></svg>;
// Trójkąt zwijania (klikalny)
const Tri = ({ open, onClick }: { open: boolean; onClick: () => void }) => (
  <span onClick={(e) => { e.stopPropagation(); onClick(); }} style={{ fontSize: 9, color: '#5b6169', width: 12, display: 'inline-block', cursor: 'pointer', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .1s' }}>▼</span>
);

function ProjectTree({ onPlaneMenu }: { onPlaneMenu: (plane: SketchPlane, x: number, y: number) => void }) {
  const [exp, setExp] = useState({ product: true, shape: true, ops: true, axes: false });
  const [names, setNames] = useState({ product: 'Produkt fizyczny 1', shape: 'Kształt 3D 1', ops: 'Operacje projektu' });
  const [editing, setEditing] = useState<null | keyof typeof names>(null);
  // Etykieta edytowalna: dwuklik → pole tekstowe, Enter/blur zatwierdza, Esc anuluje
  const EditLbl = ({ k }: { k: keyof typeof names }) => editing === k
    ? <input autoFocus defaultValue={names[k]} onClick={(e) => e.stopPropagation()} onBlur={(e) => { const v = e.target.value.trim(); setNames((n) => ({ ...n, [k]: v || n[k] })); setEditing(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); else if (e.key === 'Escape') setEditing(null); }} style={{ fontWeight: 700, fontSize: 13, border: '1px solid #2f6fd0', borderRadius: 3, padding: '0 3px', outline: 'none', width: 160 }} />
    : <span onDoubleClick={(e) => { e.stopPropagation(); setEditing(k); }} title="Dwuklik = zmień nazwę" style={{ fontWeight: 700, cursor: 'text' }}>{names[k]}</span>;
  const tog = (k: keyof typeof exp) => setExp((e) => ({ ...e, [k]: !e[k] }));
  const row = (indent: number, node: React.ReactNode) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: indent, py: 0.35, pr: 1, fontSize: 13, color: C.text, '&:hover': { bgcolor: '#eef3f9' } }}>{node}</Box>
  );
  const cubeD = 'M12 3 L20 7 V16 L12 20 L4 16 V7 Z';
  const shapeD = 'M6 6 h9 l3 3 v9 h-12 z';
  const opsD = 'M4 6 h10 v10 h-10 z M14 9 h6 v6 h-6 z';
  return (
    <Box sx={{ flex: 1, overflow: 'auto', bgcolor: C.panel }}>
      {row(1, <><Tri open={exp.product} onClick={() => tog('product')} />{treeIco(cubeD, '#4a4f57')}<Sync /><EditLbl k="product" /></>)}
      {exp.product && <>
        {row(2.5, <><Tri open={exp.shape} onClick={() => tog('shape')} />{treeIco(shapeD, '#4a4f57')}<Sync /><EditLbl k="shape" /></>)}
        {exp.shape && <>
          {/* płaszczyzny XY / YZ / ZX */}
          <Box sx={{ display: 'flex', gap: 1.5, pl: 5, py: 0.6 }}>
            {(['XY', 'YZ', 'ZX'] as const).map((p) => (
              <Box key={p} title={`Płaszczyzna ${p} (prawy przycisk = menu)`} onContextMenu={(e) => { e.preventDefault(); onPlaneMenu(p === 'ZX' ? 'XZ' : p, e.clientX, e.clientY); }} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', borderRadius: 0.5, '&:hover': { bgcolor: '#eef3f9' } }}>
                <svg width={26} height={22} viewBox="0 0 26 22"><path d="M3 8 L14 4 L23 8 L12 12 Z" {...st('#3f6fb0', 1.3)} fill="#dfeaf6" /><text x="13" y="10.5" fontSize="7" fill="#2f5c93" textAnchor="middle" fontFamily="sans-serif" fontWeight="bold">{p}</text></svg>
              </Box>
            ))}
          </Box>
          {row(3, <><span onClick={() => tog('axes')} style={{ fontSize: 9, color: '#5b6169', cursor: 'pointer', width: 12, display: 'inline-block', transform: exp.axes ? 'rotate(90deg)' : 'none' }}>›</span><span style={{ color: C.link, cursor: 'pointer' }} onClick={() => tog('axes')}>Układy osi</span></>)}
          {exp.axes && row(4.5, <span style={{ color: '#5b6169' }}>Domyślny układ osi</span>)}
          {row(2.5, <><Tri open={exp.ops} onClick={() => tog('ops')} />{treeIco(opsD, '#4a4f57')}<Sync /><EditLbl k="ops" /></>)}
          {exp.ops && (
            <Box sx={{ display: 'flex', alignItems: 'center', pl: 0, py: 0.35, '&:hover': { bgcolor: '#eef3f9' } }}>
              <Box sx={{ width: 30, display: 'flex', justifyContent: 'center' }}><svg width={17} height={17} viewBox="0 0 24 24"><path d="M4 4 L4 20 M4 20 L20 20" {...st('#8a9096', 1.6)} /><path d="M7 7 L17 7 L17 12" {...st('#8a9096', 1.4)} /><line x1="2" y1="2" x2="22" y2="22" {...st('#8a9096', 1.4)} /></svg></Box>
              <svg width={20} height={20} viewBox="0 0 24 24"><path d="M5 5 h6 v3 M5 5 v14 h14 v-6" {...st('#7a8592', 1.6)} /></svg>
              <span style={{ fontSize: 13, color: '#5b6169', textDecoration: 'underline', marginLeft: 4, cursor: 'pointer' }}>Szkic.1</span>
            </Box>
          )}
        </>}
      </>}
    </Box>
  );
}

// ── Główny komponent strony ───────────────────────────────────────────────────
export function CadNewView() {
  const [tab, setTab] = useState('Standard');
  // Tryb szkicu: białe płótno CAD + narzędzia z zakładki „Szkic" (linie niebieskie jak w referencji)
  const [project] = useState(() => { const p = new Project(); const l = p.layerSystem.getActive(); p.layerSystem.update(l.id, { color: '#1f5ee0', lineWidth: 2 }); return p; });
  const { version } = useProject(project);
  const [sketchPlane, setSketchPlane] = useState<SketchPlane | null>(null);
  const [sketchTool, setSketchTool] = useState<ToolName>('line');
  const [planeCtx, setPlaneCtx] = useState<{ x: number; y: number; plane: SketchPlane } | null>(null);
  const openSketch = (plane: SketchPlane) => { setPlaneCtx(null); setSketchPlane(plane); setSketchTool('line'); setTab('Szkic'); };
  const PLANE_LBL: Record<string, string> = { XY: 'XY', XZ: 'ZX', YZ: 'YZ' };
  // Przewijanie poziome kółkiem myszy (pionowy scroll → przesuwanie w bok)
  const wheelH = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget; const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (d && el.scrollWidth > el.clientWidth) el.scrollLeft += d;
  };
  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden', bgcolor: C.panel, userSelect: 'none' }}>
      {/* Górny obszar: drzewo (lewo) + viewport (prawo) */}
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Panel Menedżera projektu */}
        <Box sx={{ width: 250, minWidth: 250, borderRight: `1px solid ${C.barBorder}`, display: 'flex', flexDirection: 'column', bgcolor: C.panel }}>
          <Box sx={{ height: 30, display: 'flex', alignItems: 'center', gap: 1, px: 1, borderBottom: `1px solid ${C.barBorder}`, bgcolor: C.panelHead }}>
            <svg width={18} height={18} viewBox="0 0 24 24"><circle cx="6" cy="6" r="2" {...st('#5b6169', 1.6)} /><circle cx="6" cy="18" r="2" {...st('#5b6169', 1.6)} /><circle cx="18" cy="12" r="2" {...st('#5b6169', 1.6)} /><path d="M8 6 h6 a3 3 0 0 1 3 3 M8 18 h6 a3 3 0 0 0 3 -3" {...st('#5b6169', 1.4)} /></svg>
            <Box sx={{ flex: 1, height: 18, bgcolor: '#e2e4e7', borderRadius: 0.5 }} />
            <span style={{ fontSize: 12, color: '#5b6169' }}>‹</span>
          </Box>
          <Box sx={{ height: 34, display: 'flex', alignItems: 'center', px: 1.25, borderBottom: `1px solid ${C.barBorder}` }}>
            <Typography sx={{ flex: 1, fontSize: 14, color: C.text }}>Menedżer projektu</Typography>
            <span style={{ fontSize: 16, color: '#5b6169', letterSpacing: 1 }}>⋮</span>
          </Box>
          <ProjectTree onPlaneMenu={(plane, x, y) => setPlaneCtx({ x, y, plane })} />
        </Box>
        {/* Viewport — tryb szkicu (białe płótno) albo płaszczyzny 3D */}
        <Box sx={{ flex: 1, position: 'relative', minWidth: 0, background: sketchPlane ? '#ffffff' : 'radial-gradient(circle at 50% 40%, #fdfdfe 0%, #eceef1 100%)' }}>
          {sketchPlane ? (
            <>
              {/* pasek trybu szkicu */}
              <Box sx={{ position: 'absolute', top: 8, left: 8, zIndex: 5, display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.4, bgcolor: '#eef3f9', border: '1px solid #b9d0ec', borderRadius: 0.75 }}>
                <Box sx={{ px: 0.75, py: 0.1, bgcolor: '#2f6fd0', color: '#fff', borderRadius: 0.5, fontSize: 11, fontWeight: 600 }}>Szkic · {PLANE_LBL[sketchPlane]}</Box>
                <Box onClick={() => setSketchPlane(null)} title="Zakończ szkic" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', fontSize: 12, color: '#1b5e20', '&:hover': { textDecoration: 'underline' } }}>
                  <svg width={16} height={16} viewBox="0 0 24 24"><path d="M5 12 l4 4 L19 6" {...st('#2e7d32', 2)} /></svg>Zakończ
                </Box>
              </Box>
              <CadCanvas project={project} activeTool={sketchTool} version={version} viewMode="2d" theme="light" />
            </>
          ) : (
            <>
              {/* przycisk „przypnij do panelu" (lewy górny) */}
              <Box sx={{ position: 'absolute', top: 8, left: 8, zIndex: 3, width: 30, height: 26, bgcolor: '#e6e8eb', border: `1px solid ${C.barBorder}`, borderRadius: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <svg width={16} height={16} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="1.5" {...st('#5b6169', 1.6)} /><line x1="9" y1="4" x2="9" y2="20" {...st('#5b6169', 1.6)} /><path d="M13 9 l3 3 l-3 3" {...st('#5b6169', 1.6)} /></svg>
              </Box>
              <Box sx={{ position: 'absolute', top: 50, right: 150, zIndex: 3 }}><span style={{ fontSize: 16, color: '#8a9096' }}>‹</span></Box>
              <Box sx={{ position: 'absolute', top: 118, right: 16, zIndex: 3, display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.4, bgcolor: '#fff', border: `1px solid ${C.barBorder}`, borderRadius: 0.75, fontSize: 13, color: C.text, minWidth: 70, justifyContent: 'space-between', cursor: 'pointer' }}>
                <span>mm</span><span style={{ fontSize: 10, color: '#5b6169' }}>▼</span>
              </Box>
              <PlanesScene />
            </>
          )}
        </Box>
      </Box>

      {/* Dolna wstążka (zakładki + narzędzia) — pełna szerokość, poniżej viewportu, przewijana w poziomie */}
      <Box sx={{ flexShrink: 0, minWidth: 0, width: '100%', position: 'relative', zIndex: 4, bgcolor: C.bar, borderTop: `1px solid ${C.barBorder}` }}>
        {/* Zakładki wstążki */}
        <Box onWheel={wheelH} sx={{ display: 'flex', alignItems: 'flex-end', pl: 30, height: 26, minWidth: 0, maxWidth: '100%', bgcolor: C.bar, gap: 0, overflowX: 'auto', overflowY: 'hidden', '&::-webkit-scrollbar': { height: 0 } }}>
          {TABS.map((t) => (
            <Box key={t} onClick={() => setTab(t)} sx={{ px: 1.5, height: 24, display: 'flex', alignItems: 'center', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer', color: C.tabText, bgcolor: tab === t ? C.tabActive : 'transparent', borderTop: tab === t ? `2px solid #2f6fd0` : '2px solid transparent', borderLeft: tab === t ? `1px solid ${C.barBorder}` : '1px solid transparent', borderRight: tab === t ? `1px solid ${C.barBorder}` : '1px solid transparent', borderTopLeftRadius: 3, borderTopRightRadius: 3, '&:hover': { bgcolor: tab === t ? C.tabActive : '#e9edf2' } }}>{t}</Box>
          ))}
        </Box>
        {/* Pasek narzędzi wstążki — przewijany kółkiem myszy w poziomie */}
        <Box onWheel={wheelH} sx={{ display: 'flex', alignItems: 'stretch', minWidth: 0, maxWidth: '100%', bgcolor: C.ribbon, borderTop: `1px solid ${C.barBorder}`, px: 1, py: 0.5, gap: 0.25, overflowX: 'auto', overflowY: 'hidden', flexWrap: 'nowrap' }}>
          {COMMON.map((t) => <ToolBtn key={t.id} t={t} />)}
          <Box sx={{ width: '1px', bgcolor: '#dcdfe3', mx: 0.75, my: 0.5, flexShrink: 0 }} />
          {(RIBBONS[tab] ?? []).map((t, i) => {
            const sketchable = sketchPlane && t.tool;
            return <ToolBtn key={`${t.id}-${i}`} t={t} onClick={sketchable ? () => setSketchTool(t.tool!) : undefined} active={!!sketchable && sketchTool === t.tool} />;
          })}
        </Box>
      </Box>

      {/* Menu kontekstowe płaszczyzny (Ukryj / Normalny do / Szkic / Płaszczyzna) */}
      <Menu open={!!planeCtx} onClose={() => setPlaneCtx(null)} anchorReference="anchorPosition" anchorPosition={planeCtx ? { top: planeCtx.y, left: planeCtx.x } : undefined}>
        <MenuItem onClick={() => setPlaneCtx(null)} sx={{ fontSize: 13.5, gap: 1.5, minWidth: 200 }}>
          <svg width={17} height={17} viewBox="0 0 24 24"><path d="M2 12 s4 -7 10 -7 s10 7 10 7 s-4 7 -10 7 s-10 -7 -10 -7 Z" {...st('#5b6169', 1.4)} /><line x1="4" y1="4" x2="20" y2="20" {...st('#5b6169', 1.4)} /></svg>Ukryj
        </MenuItem>
        <MenuItem onClick={() => setPlaneCtx(null)} sx={{ fontSize: 13.5, gap: 1.5 }}>
          <svg width={17} height={17} viewBox="0 0 24 24"><path d="M4 15 L14 11 L20 14 L10 18 Z" {...st('#3f6fb0', 1.4)} /><path d="M12 12 V4 M9.5 6 L12 3 L14.5 6" {...st('#e8a33d', 1.6)} /></svg>Normalny do (N)
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => planeCtx && openSketch(planeCtx.plane)} sx={{ fontSize: 13.5, gap: 1.5 }}>
          <svg width={17} height={17} viewBox="0 0 24 24"><path d="M5 5 h6 v3 M5 5 v14 h14 v-6" {...st('#2f6fd0', 1.6)} /><path d="M9 12 l3 3" {...st('#2f6fd0', 1.4)} /></svg>Szkic
        </MenuItem>
        <MenuItem onClick={() => setPlaneCtx(null)} sx={{ fontSize: 13.5, gap: 1.5 }}>
          <svg width={17} height={17} viewBox="0 0 24 24"><path d="M3 9 L14 6 L21 9 L10 12 Z" {...st('#3f6fb0', 1.4)} fill="#dfeaf6" /></svg>Płaszczyzna
        </MenuItem>
      </Menu>
    </Box>
  );
}

export default CadNewView;
