import { Box3 } from './Box3.js';
import { MeshBuilder } from './MeshBuilder.js';

const TAU = Math.PI * 2;

/**
 * CircleGeometry — wycinek koła (dysk) w płaszczyźnie XY, normalna +Z.
 *
 * @typedef {{ radius: number, segments?: number, thetaStart?: number, thetaLength?: number }} CircleParams
 * @typedef {import('./MeshBuilder.js').MeshData} MeshData
 */
class CircleGeometry {
  /** @param {CircleParams} [params] */
  constructor(params) { this.params = CircleGeometry.normalize(params); }

  /** @returns {Required<CircleParams>} */
  static defaults() { return { radius: 1, segments: 32, thetaStart: 0, thetaLength: TAU }; }
  /** @param {CircleParams} [p] @returns {Required<CircleParams>} */
  static normalize(p) {
    const q = { ...CircleGeometry.defaults(), ...(p || {}) };
    q.segments = Math.max(3, Math.floor(q.segments));
    return q;
  }

  /** Obwód łuku = r·θ. @param {CircleParams} p @returns {number} */
  static arcLength(p) { const q = CircleGeometry.normalize(p); return q.radius * q.thetaLength; }
  /** Pole wycinka = ½·r²·θ (pełne koło: π·r²). @param {CircleParams} p @returns {number} */
  static area(p) { const q = CircleGeometry.normalize(p); return 0.5 * q.radius * q.radius * q.thetaLength; }
  static surfaceArea(p) { return 2 * CircleGeometry.area(p); }
  static volume() { return 0; }
  /** @param {CircleParams} p */
  static boundingBox(p) { const q = CircleGeometry.normalize(p); return Box3.describe(Box3.fromCenterSize(0, 0, 0, 2 * q.radius, 2 * q.radius, 0)); }
  static vertexCount(p) { const q = CircleGeometry.normalize(p); return q.segments + 2; }
  static triangleCount(p) { const q = CircleGeometry.normalize(p); return q.segments; }

  /** @param {CircleParams} p @returns {MeshData} */
  static build(p) {
    const q = CircleGeometry.normalize(p);
    const mb = MeshBuilder.create();
    mb.vertex(0, 0, 0, 0, 0, 1, 0.5, 0.5); // środek
    for (let i = 0; i <= q.segments; i++) {
      const a = q.thetaStart + (i / q.segments) * q.thetaLength;
      const x = q.radius * Math.cos(a), y = q.radius * Math.sin(a);
      mb.vertex(x, y, 0, 0, 0, 1, (x / q.radius + 1) / 2, (y / q.radius + 1) / 2);
    }
    for (let i = 1; i <= q.segments; i++) mb.triangle(0, i, i + 1);
    return mb.build();
  }

  area() { return CircleGeometry.area(this.params); }
  boundingBox() { return CircleGeometry.boundingBox(this.params); }
  build() { return CircleGeometry.build(this.params); }
}

export { CircleGeometry };
