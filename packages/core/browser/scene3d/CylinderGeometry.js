import { Box3 } from './Box3.js';
import { MeshBuilder } from './MeshBuilder.js';

const TAU = Math.PI * 2;

/**
 * CylinderGeometry — walec / ścięty stożek (frustum). `radiusTop === 0` daje
 * pełny stożek; `radiusTop === radiusBottom` daje walec.
 *
 * Obliczenia jako funkcje statyczne (objętość bryły obrotowej, pole pobocznicy,
 * tworząca itd.).
 *
 * @typedef {{ radiusTop: number, radiusBottom: number, height: number, radialSegments?: number, heightSegments?: number, openEnded?: boolean, thetaStart?: number, thetaLength?: number }} CylinderParams
 * @typedef {import('./MeshBuilder.js').MeshData} MeshData
 */
class CylinderGeometry {
  /** @param {CylinderParams} [params] */
  constructor(params) { this.params = CylinderGeometry.normalize(params); }

  /** @returns {Required<CylinderParams>} */
  static defaults() {
    return { radiusTop: 1, radiusBottom: 1, height: 1, radialSegments: 32, heightSegments: 1, openEnded: false, thetaStart: 0, thetaLength: TAU };
  }
  /** @param {CylinderParams} [p] @returns {Required<CylinderParams>} */
  static normalize(p) {
    const q = { ...CylinderGeometry.defaults(), ...(p || {}) };
    q.radialSegments = Math.max(3, Math.floor(q.radialSegments));
    q.heightSegments = Math.max(1, Math.floor(q.heightSegments));
    return q;
  }

  /** Tworząca (slant) = √((rb−rt)² + h²). @param {CylinderParams} p @returns {number} */
  static slantHeight(p) { const q = CylinderGeometry.normalize(p); return Math.hypot(q.radiusBottom - q.radiusTop, q.height); }
  /** Objętość frustum = (π·h/3)(rt² + rt·rb + rb²). @param {CylinderParams} p @returns {number} */
  static volume(p) {
    const q = CylinderGeometry.normalize(p);
    return (Math.PI * q.height / 3) * (q.radiusTop * q.radiusTop + q.radiusTop * q.radiusBottom + q.radiusBottom * q.radiusBottom);
  }
  /** Pole pobocznicy = π·(rt+rb)·slant. @param {CylinderParams} p @returns {number} */
  static lateralArea(p) { const q = CylinderGeometry.normalize(p); return Math.PI * (q.radiusTop + q.radiusBottom) * CylinderGeometry.slantHeight(p); }
  /** Pole całkowite (pobocznica + denka, jeśli nie openEnded). @param {CylinderParams} p @returns {number} */
  static surfaceArea(p) {
    const q = CylinderGeometry.normalize(p);
    let a = CylinderGeometry.lateralArea(p);
    if (!q.openEnded) a += Math.PI * (q.radiusTop * q.radiusTop + q.radiusBottom * q.radiusBottom);
    return a;
  }
  /** @param {CylinderParams} p */
  static boundingBox(p) {
    const q = CylinderGeometry.normalize(p);
    const r = Math.max(q.radiusTop, q.radiusBottom);
    return Box3.describe(Box3.fromCenterSize(0, 0, 0, 2 * r, q.height, 2 * r));
  }
  static vertexCount(p) {
    const q = CylinderGeometry.normalize(p);
    let n = (q.radialSegments + 1) * (q.heightSegments + 1);
    if (!q.openEnded) { if (q.radiusTop > 0) n += q.radialSegments + (q.radialSegments + 1); if (q.radiusBottom > 0) n += q.radialSegments + (q.radialSegments + 1); }
    return n;
  }
  static triangleCount(p) {
    const q = CylinderGeometry.normalize(p);
    let n = 2 * q.radialSegments * q.heightSegments;
    if (!q.openEnded) { if (q.radiusTop > 0) n += q.radialSegments; if (q.radiusBottom > 0) n += q.radialSegments; }
    return n;
  }

  /** @param {CylinderParams} p @returns {MeshData} */
  static build(p) {
    const q = CylinderGeometry.normalize(p);
    const mb = MeshBuilder.create();
    generateTorso(mb, q);
    if (!q.openEnded) {
      if (q.radiusTop > 0) generateCap(mb, q, true);
      if (q.radiusBottom > 0) generateCap(mb, q, false);
    }
    return mb.build();
  }

  slantHeight() { return CylinderGeometry.slantHeight(this.params); }
  volume() { return CylinderGeometry.volume(this.params); }
  lateralArea() { return CylinderGeometry.lateralArea(this.params); }
  surfaceArea() { return CylinderGeometry.surfaceArea(this.params); }
  boundingBox() { return CylinderGeometry.boundingBox(this.params); }
  build() { return CylinderGeometry.build(this.params); }
}

function generateTorso(mb, q) {
  const halfH = q.height / 2;
  const slope = (q.radiusBottom - q.radiusTop) / q.height;
  const base = mb.vertexCount;
  for (let iy = 0; iy <= q.heightSegments; iy++) {
    const v = iy / q.heightSegments;
    const radius = v * (q.radiusBottom - q.radiusTop) + q.radiusTop;
    for (let ix = 0; ix <= q.radialSegments; ix++) {
      const u = ix / q.radialSegments;
      const theta = u * q.thetaLength + q.thetaStart;
      const sinT = Math.sin(theta), cosT = Math.cos(theta);
      let nx = sinT, ny = slope, nz = cosT; const nl = Math.hypot(nx, ny, nz) || 1;
      mb.vertex(radius * sinT, -v * q.height + halfH, radius * cosT, nx / nl, ny / nl, nz / nl, u, 1 - v);
    }
  }
  const row = q.radialSegments + 1;
  for (let iy = 0; iy < q.heightSegments; iy++) {
    for (let ix = 0; ix < q.radialSegments; ix++) {
      const a = base + ix + row * iy, b = base + ix + row * (iy + 1), c = base + (ix + 1) + row * (iy + 1), d = base + (ix + 1) + row * iy;
      mb.triangle(a, b, d); mb.triangle(b, c, d);
    }
  }
}

function generateCap(mb, q, top) {
  const radius = top ? q.radiusTop : q.radiusBottom;
  const sign = top ? 1 : -1;
  const y = (q.height / 2) * sign;
  const centerBase = mb.vertexCount;
  for (let ix = 0; ix < q.radialSegments; ix++) mb.vertex(0, y, 0, 0, sign, 0, 0.5, 0.5);
  const ringBase = mb.vertexCount;
  for (let ix = 0; ix <= q.radialSegments; ix++) {
    const u = ix / q.radialSegments;
    const theta = u * q.thetaLength + q.thetaStart;
    const sinT = Math.sin(theta), cosT = Math.cos(theta);
    mb.vertex(radius * sinT, y, radius * cosT, 0, sign, 0, sinT * 0.5 * sign + 0.5, cosT * 0.5 + 0.5);
  }
  for (let ix = 0; ix < q.radialSegments; ix++) {
    const c = centerBase + ix, r0 = ringBase + ix, r1 = ringBase + ix + 1;
    if (top) mb.triangle(r0, r1, c); else mb.triangle(r1, r0, c);
  }
}

export { CylinderGeometry };
