import { Box3 } from './Box3.js';
import { MeshBuilder } from './MeshBuilder.js';

const TAU = Math.PI * 2;

/**
 * SphereGeometry — kula (UV-sphere). Obliczenia objętości/pola dla pełnej kuli.
 *
 * @typedef {{ radius: number, widthSegments?: number, heightSegments?: number, phiStart?: number, phiLength?: number, thetaStart?: number, thetaLength?: number }} SphereParams
 * @typedef {import('./MeshBuilder.js').MeshData} MeshData
 */
class SphereGeometry {
  /** @param {SphereParams} [params] */
  constructor(params) { this.params = SphereGeometry.normalize(params); }

  /** @returns {Required<SphereParams>} */
  static defaults() { return { radius: 1, widthSegments: 32, heightSegments: 16, phiStart: 0, phiLength: TAU, thetaStart: 0, thetaLength: Math.PI }; }
  /** @param {SphereParams} [p] @returns {Required<SphereParams>} */
  static normalize(p) {
    const q = { ...SphereGeometry.defaults(), ...(p || {}) };
    q.widthSegments = Math.max(3, Math.floor(q.widthSegments));
    q.heightSegments = Math.max(2, Math.floor(q.heightSegments));
    return q;
  }

  /** Objętość pełnej kuli = (4/3)·π·r³. @param {SphereParams} p @returns {number} */
  static volume(p) { const q = SphereGeometry.normalize(p); return (4 / 3) * Math.PI * q.radius ** 3; }
  /** Pole pełnej kuli = 4·π·r². @param {SphereParams} p @returns {number} */
  static surfaceArea(p) { const q = SphereGeometry.normalize(p); return 4 * Math.PI * q.radius * q.radius; }
  /** Obwód wielkiego koła = 2·π·r. @param {SphereParams} p @returns {number} */
  static circumference(p) { const q = SphereGeometry.normalize(p); return TAU * q.radius; }
  /** @param {SphereParams} p */
  static boundingBox(p) { const q = SphereGeometry.normalize(p); return Box3.describe(Box3.fromCenterSize(0, 0, 0, 2 * q.radius, 2 * q.radius, 2 * q.radius)); }
  static vertexCount(p) { const q = SphereGeometry.normalize(p); return (q.widthSegments + 1) * (q.heightSegments + 1); }
  static triangleCount(p) {
    const q = SphereGeometry.normalize(p);
    const thetaEnd = Math.min(q.thetaStart + q.thetaLength, Math.PI);
    let n = 2 * q.widthSegments * q.heightSegments;
    if (q.thetaStart <= 0) n -= q.widthSegments;          // biegun górny: trójkąty
    if (thetaEnd >= Math.PI) n -= q.widthSegments;        // biegun dolny: trójkąty
    return n;
  }

  /** @param {SphereParams} p @returns {MeshData} */
  static build(p) {
    const q = SphereGeometry.normalize(p);
    const mb = MeshBuilder.create();
    const thetaEnd = Math.min(q.thetaStart + q.thetaLength, Math.PI);
    const grid = [];
    for (let iy = 0; iy <= q.heightSegments; iy++) {
      const row = [];
      const v = iy / q.heightSegments;
      let uOffset = 0;
      if (iy === 0 && q.thetaStart === 0) uOffset = 0.5 / q.widthSegments;
      else if (iy === q.heightSegments && thetaEnd === Math.PI) uOffset = -0.5 / q.widthSegments;
      const theta = q.thetaStart + v * q.thetaLength;
      const sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);
      for (let ix = 0; ix <= q.widthSegments; ix++) {
        const u = ix / q.widthSegments;
        const phi = q.phiStart + u * q.phiLength;
        const x = -q.radius * Math.cos(phi) * sinTheta;
        const y = q.radius * cosTheta;
        const z = q.radius * Math.sin(phi) * sinTheta;
        const nl = Math.hypot(x, y, z) || 1;
        row.push(mb.vertex(x, y, z, x / nl, y / nl, z / nl, u + uOffset, 1 - v));
      }
      grid.push(row);
    }
    for (let iy = 0; iy < q.heightSegments; iy++) {
      for (let ix = 0; ix < q.widthSegments; ix++) {
        const a = grid[iy][ix + 1], b = grid[iy][ix], c = grid[iy + 1][ix], d = grid[iy + 1][ix + 1];
        if (iy !== 0 || q.thetaStart > 0) mb.triangle(a, b, d);
        if (iy !== q.heightSegments - 1 || thetaEnd < Math.PI) mb.triangle(b, c, d);
      }
    }
    return mb.build();
  }

  volume() { return SphereGeometry.volume(this.params); }
  surfaceArea() { return SphereGeometry.surfaceArea(this.params); }
  boundingBox() { return SphereGeometry.boundingBox(this.params); }
  build() { return SphereGeometry.build(this.params); }
}

export { SphereGeometry };
