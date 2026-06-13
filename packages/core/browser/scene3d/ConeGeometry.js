import { Box3 } from './Box3.js';
import { CylinderGeometry } from './CylinderGeometry.js';

/**
 * ConeGeometry — stożek (szczególny przypadek walca z `radiusTop = 0`).
 * Siatka delegowana do {@link CylinderGeometry}; obliczenia z dokładnych wzorów.
 *
 * @typedef {{ radius: number, height: number, radialSegments?: number, heightSegments?: number, openEnded?: boolean, thetaStart?: number, thetaLength?: number }} ConeParams
 * @typedef {import('./MeshBuilder.js').MeshData} MeshData
 */
class ConeGeometry {
  /** @param {ConeParams} [params] */
  constructor(params) { this.params = ConeGeometry.normalize(params); }

  /** @returns {Required<ConeParams>} */
  static defaults() { return { radius: 1, height: 1, radialSegments: 32, heightSegments: 1, openEnded: false, thetaStart: 0, thetaLength: Math.PI * 2 }; }
  /** @param {ConeParams} [p] @returns {Required<ConeParams>} */
  static normalize(p) {
    const q = { ...ConeGeometry.defaults(), ...(p || {}) };
    q.radialSegments = Math.max(3, Math.floor(q.radialSegments));
    q.heightSegments = Math.max(1, Math.floor(q.heightSegments));
    return q;
  }
  /** @param {ConeParams} p @returns {import('./CylinderGeometry.js').CylinderParams} */
  static toCylinder(p) {
    const q = ConeGeometry.normalize(p);
    return { radiusTop: 0, radiusBottom: q.radius, height: q.height, radialSegments: q.radialSegments, heightSegments: q.heightSegments, openEnded: q.openEnded, thetaStart: q.thetaStart, thetaLength: q.thetaLength };
  }

  /** Tworząca = √(r² + h²). @param {ConeParams} p @returns {number} */
  static slantHeight(p) { const q = ConeGeometry.normalize(p); return Math.hypot(q.radius, q.height); }
  /** Objętość = (1/3)·π·r²·h. @param {ConeParams} p @returns {number} */
  static volume(p) { const q = ConeGeometry.normalize(p); return (Math.PI * q.radius * q.radius * q.height) / 3; }
  /** Pole pobocznicy = π·r·slant. @param {ConeParams} p @returns {number} */
  static lateralArea(p) { const q = ConeGeometry.normalize(p); return Math.PI * q.radius * ConeGeometry.slantHeight(p); }
  /** Pole całkowite = π·r·slant + π·r² (jeśli nie openEnded). @param {ConeParams} p @returns {number} */
  static surfaceArea(p) { const q = ConeGeometry.normalize(p); return ConeGeometry.lateralArea(p) + (q.openEnded ? 0 : Math.PI * q.radius * q.radius); }
  /** @param {ConeParams} p */
  static boundingBox(p) { const q = ConeGeometry.normalize(p); return Box3.describe(Box3.fromCenterSize(0, 0, 0, 2 * q.radius, q.height, 2 * q.radius)); }
  static vertexCount(p) { return CylinderGeometry.vertexCount(ConeGeometry.toCylinder(p)); }
  static triangleCount(p) { return CylinderGeometry.triangleCount(ConeGeometry.toCylinder(p)); }
  /** @param {ConeParams} p @returns {MeshData} */
  static build(p) { return CylinderGeometry.build(ConeGeometry.toCylinder(p)); }

  slantHeight() { return ConeGeometry.slantHeight(this.params); }
  volume() { return ConeGeometry.volume(this.params); }
  lateralArea() { return ConeGeometry.lateralArea(this.params); }
  surfaceArea() { return ConeGeometry.surfaceArea(this.params); }
  boundingBox() { return ConeGeometry.boundingBox(this.params); }
  build() { return ConeGeometry.build(this.params); }
}

export { ConeGeometry };
