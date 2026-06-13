import { Box3 } from './Box3.js';
import { MeshBuilder } from './MeshBuilder.js';

const TAU = Math.PI * 2;

/**
 * TorusGeometry — torus (pierścień). `radius` = promień środka rury (R),
 * `tube` = promień rury (r). Obliczenia dla pełnego torusa.
 *
 * @typedef {{ radius: number, tube: number, radialSegments?: number, tubularSegments?: number, arc?: number }} TorusParams
 * @typedef {import('./MeshBuilder.js').MeshData} MeshData
 */
class TorusGeometry {
  /** @param {TorusParams} [params] */
  constructor(params) { this.params = TorusGeometry.normalize(params); }

  /** @returns {Required<TorusParams>} */
  static defaults() { return { radius: 1, tube: 0.4, radialSegments: 12, tubularSegments: 48, arc: TAU }; }
  /** @param {TorusParams} [p] @returns {Required<TorusParams>} */
  static normalize(p) {
    const q = { ...TorusGeometry.defaults(), ...(p || {}) };
    q.radialSegments = Math.max(3, Math.floor(q.radialSegments));
    q.tubularSegments = Math.max(3, Math.floor(q.tubularSegments));
    return q;
  }

  /** Objętość pełnego torusa = 2·π²·R·r². @param {TorusParams} p @returns {number} */
  static volume(p) { const q = TorusGeometry.normalize(p); return 2 * Math.PI * Math.PI * q.radius * q.tube * q.tube; }
  /** Pole pełnego torusa = 4·π²·R·r. @param {TorusParams} p @returns {number} */
  static surfaceArea(p) { const q = TorusGeometry.normalize(p); return 4 * Math.PI * Math.PI * q.radius * q.tube; }
  /** @param {TorusParams} p */
  static boundingBox(p) {
    const q = TorusGeometry.normalize(p);
    const outer = 2 * (q.radius + q.tube);
    return Box3.describe(Box3.fromCenterSize(0, 0, 0, outer, outer, 2 * q.tube));
  }
  static vertexCount(p) { const q = TorusGeometry.normalize(p); return (q.radialSegments + 1) * (q.tubularSegments + 1); }
  static triangleCount(p) { const q = TorusGeometry.normalize(p); return 2 * q.radialSegments * q.tubularSegments; }

  /** @param {TorusParams} p @returns {MeshData} */
  static build(p) {
    const q = TorusGeometry.normalize(p);
    const mb = MeshBuilder.create();
    for (let j = 0; j <= q.radialSegments; j++) {
      const v = (j / q.radialSegments) * TAU;
      const cosV = Math.cos(v), sinV = Math.sin(v);
      for (let i = 0; i <= q.tubularSegments; i++) {
        const u = (i / q.tubularSegments) * q.arc;
        const cosU = Math.cos(u), sinU = Math.sin(u);
        const x = (q.radius + q.tube * cosV) * cosU;
        const y = (q.radius + q.tube * cosV) * sinU;
        const z = q.tube * sinV;
        // normalna = (wierzchołek − środek rury), znormalizowana
        const cx = q.radius * cosU, cy = q.radius * sinU;
        let nx = x - cx, ny = y - cy, nz = z; const nl = Math.hypot(nx, ny, nz) || 1;
        mb.vertex(x, y, z, nx / nl, ny / nl, nz / nl, i / q.tubularSegments, j / q.radialSegments);
      }
    }
    const row = q.tubularSegments + 1;
    for (let j = 1; j <= q.radialSegments; j++) {
      for (let i = 1; i <= q.tubularSegments; i++) {
        const a = row * j + i - 1, b = row * (j - 1) + i - 1, c = row * (j - 1) + i, d = row * j + i;
        mb.triangle(a, b, d); mb.triangle(b, c, d);
      }
    }
    return mb.build();
  }

  volume() { return TorusGeometry.volume(this.params); }
  surfaceArea() { return TorusGeometry.surfaceArea(this.params); }
  boundingBox() { return TorusGeometry.boundingBox(this.params); }
  build() { return TorusGeometry.build(this.params); }
}

export { TorusGeometry };
