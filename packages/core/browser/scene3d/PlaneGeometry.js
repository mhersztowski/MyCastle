import { Box3 } from './Box3.js';
import { MeshBuilder } from './MeshBuilder.js';

/**
 * PlaneGeometry — płaski prostokąt w płaszczyźnie XY (normalna +Z).
 *
 * @typedef {{ width: number, height: number, widthSegments?: number, heightSegments?: number }} PlaneParams
 * @typedef {import('./MeshBuilder.js').MeshData} MeshData
 */
class PlaneGeometry {
  /** @param {PlaneParams} [params] */
  constructor(params) { this.params = PlaneGeometry.normalize(params); }

  /** @returns {Required<PlaneParams>} */
  static defaults() { return { width: 1, height: 1, widthSegments: 1, heightSegments: 1 }; }
  /** @param {PlaneParams} [p] @returns {Required<PlaneParams>} */
  static normalize(p) {
    const q = { ...PlaneGeometry.defaults(), ...(p || {}) };
    q.widthSegments = Math.max(1, Math.floor(q.widthSegments));
    q.heightSegments = Math.max(1, Math.floor(q.heightSegments));
    return q;
  }

  /** Pole = w·h. @param {PlaneParams} p @returns {number} */
  static area(p) { const q = PlaneGeometry.normalize(p); return q.width * q.height; }
  /** Powierzchnia liczona obustronnie = 2·w·h. @param {PlaneParams} p @returns {number} */
  static surfaceArea(p) { return 2 * PlaneGeometry.area(p); }
  /** Płaszczyzna ma zerową objętość. @returns {number} */
  static volume() { return 0; }
  /** Przekątna prostokąta. @param {PlaneParams} p @returns {number} */
  static diagonal(p) { const q = PlaneGeometry.normalize(p); return Math.hypot(q.width, q.height); }
  /** @param {PlaneParams} p */
  static boundingBox(p) { const q = PlaneGeometry.normalize(p); return Box3.describe(Box3.fromCenterSize(0, 0, 0, q.width, q.height, 0)); }
  static vertexCount(p) { const q = PlaneGeometry.normalize(p); return (q.widthSegments + 1) * (q.heightSegments + 1); }
  static triangleCount(p) { const q = PlaneGeometry.normalize(p); return 2 * q.widthSegments * q.heightSegments; }

  /** @param {PlaneParams} p @returns {MeshData} */
  static build(p) {
    const q = PlaneGeometry.normalize(p);
    const mb = MeshBuilder.create();
    const segW = q.width / q.widthSegments, segH = q.height / q.heightSegments;
    const wHalf = q.width / 2, hHalf = q.height / 2;
    for (let iy = 0; iy <= q.heightSegments; iy++) {
      const y = iy * segH - hHalf;
      for (let ix = 0; ix <= q.widthSegments; ix++) {
        const x = ix * segW - wHalf;
        mb.vertex(x, -y, 0, 0, 0, 1, ix / q.widthSegments, 1 - iy / q.heightSegments);
      }
    }
    const row = q.widthSegments + 1;
    for (let iy = 0; iy < q.heightSegments; iy++) {
      for (let ix = 0; ix < q.widthSegments; ix++) {
        const a = ix + row * iy, b = ix + row * (iy + 1), c = (ix + 1) + row * (iy + 1), d = (ix + 1) + row * iy;
        mb.triangle(a, b, d); mb.triangle(b, c, d);
      }
    }
    return mb.build();
  }

  // ── instancja ──
  area() { return PlaneGeometry.area(this.params); }
  surfaceArea() { return PlaneGeometry.surfaceArea(this.params); }
  boundingBox() { return PlaneGeometry.boundingBox(this.params); }
  build() { return PlaneGeometry.build(this.params); }
}

export { PlaneGeometry };
