import { Box3 } from './Box3.js';
import { MeshBuilder } from './MeshBuilder.js';

/**
 * BoxGeometry — prostopadłościan (parametry + obliczenia + siatka).
 *
 * Wszystkie obliczenia jako **funkcje statyczne**: `BoxGeometry.volume(p)`,
 * `BoxGeometry.surfaceArea(p)`, `BoxGeometry.build(p)` … (łatwe podpowiedzi).
 * `new BoxGeometry(p)` daje obiekt z metodami delegującymi do statyk.
 *
 * @typedef {{ width: number, height: number, depth: number, widthSegments?: number, heightSegments?: number, depthSegments?: number }} BoxParams
 * @typedef {import('./MeshBuilder.js').MeshData} MeshData
 */
class BoxGeometry {
  /** @param {BoxParams} [params] */
  constructor(params) { this.params = BoxGeometry.normalize(params); }

  /** Domyślne parametry (jednostkowy sześcian). @returns {Required<BoxParams>} */
  static defaults() { return { width: 1, height: 1, depth: 1, widthSegments: 1, heightSegments: 1, depthSegments: 1 }; }
  /** Uzupełnia brakujące parametry wartościami domyślnymi. @param {BoxParams} [p] @returns {Required<BoxParams>} */
  static normalize(p) {
    const d = BoxGeometry.defaults();
    const q = { ...d, ...(p || {}) };
    q.widthSegments = Math.max(1, Math.floor(q.widthSegments));
    q.heightSegments = Math.max(1, Math.floor(q.heightSegments));
    q.depthSegments = Math.max(1, Math.floor(q.depthSegments));
    return q;
  }

  /** Objętość = w·h·d. @param {BoxParams} p @returns {number} */
  static volume(p) { const q = BoxGeometry.normalize(p); return q.width * q.height * q.depth; }
  /** Pole powierzchni = 2(wh + hd + dw). @param {BoxParams} p @returns {number} */
  static surfaceArea(p) { const q = BoxGeometry.normalize(p); return 2 * (q.width * q.height + q.height * q.depth + q.depth * q.width); }
  /** Przekątna przestrzenna = √(w²+h²+d²). @param {BoxParams} p @returns {number} */
  static diagonal(p) { const q = BoxGeometry.normalize(p); return Math.hypot(q.width, q.height, q.depth); }
  /** AABB wyśrodkowany w (0,0,0). @param {BoxParams} p */
  static boundingBox(p) { const q = BoxGeometry.normalize(p); return Box3.describe(Box3.fromCenterSize(0, 0, 0, q.width, q.height, q.depth)); }
  /** Liczba wierzchołków siatki. @param {BoxParams} p @returns {number} */
  static vertexCount(p) {
    const q = BoxGeometry.normalize(p);
    return 2 * ((q.widthSegments + 1) * (q.heightSegments + 1) + (q.widthSegments + 1) * (q.depthSegments + 1) + (q.depthSegments + 1) * (q.heightSegments + 1));
  }
  /** Liczba trójkątów siatki. @param {BoxParams} p @returns {number} */
  static triangleCount(p) {
    const q = BoxGeometry.normalize(p);
    return 2 * 2 * (q.widthSegments * q.heightSegments + q.widthSegments * q.depthSegments + q.depthSegments * q.heightSegments);
  }

  /** Generuje siatkę (pozycje/normalne/UV/indeksy). @param {BoxParams} p @returns {MeshData} */
  static build(p) {
    const q = BoxGeometry.normalize(p);
    const mb = MeshBuilder.create();
    // (uAxis, vAxis, wAxis, uDir, vDir, uLen, vLen, wOffsetSigned, gridU, gridV)
    addFace(mb, 2, 1, 0, -1, -1, q.depth, q.height, q.width, q.depthSegments, q.heightSegments);  // +X
    addFace(mb, 2, 1, 0, 1, -1, q.depth, q.height, -q.width, q.depthSegments, q.heightSegments);  // -X
    addFace(mb, 0, 2, 1, 1, 1, q.width, q.depth, q.height, q.widthSegments, q.depthSegments);      // +Y
    addFace(mb, 0, 2, 1, 1, -1, q.width, q.depth, -q.height, q.widthSegments, q.depthSegments);    // -Y
    addFace(mb, 0, 1, 2, 1, -1, q.width, q.height, q.depth, q.widthSegments, q.heightSegments);    // +Z
    addFace(mb, 0, 1, 2, -1, -1, q.width, q.height, -q.depth, q.widthSegments, q.heightSegments);  // -Z
    return mb.build();
  }

  // ── instancja ──
  volume() { return BoxGeometry.volume(this.params); }
  surfaceArea() { return BoxGeometry.surfaceArea(this.params); }
  diagonal() { return BoxGeometry.diagonal(this.params); }
  boundingBox() { return BoxGeometry.boundingBox(this.params); }
  build() { return BoxGeometry.build(this.params); }
}

/** Buduje jedną segmentowaną ścianę prostopadłościanu. */
function addFace(mb, uAxis, vAxis, wAxis, uDir, vDir, uLen, vLen, wLenSigned, gridU, gridV) {
  const segU = uLen / gridU, segV = vLen / gridV;
  const uHalf = uLen / 2, vHalf = vLen / 2, wHalf = wLenSigned / 2;
  const nSign = wLenSigned >= 0 ? 1 : -1;
  const start = mb.vertexCount;
  for (let iy = 0; iy <= gridV; iy++) {
    const v = iy * segV - vHalf;
    for (let ix = 0; ix <= gridU; ix++) {
      const u = ix * segU - uHalf;
      const pos = [0, 0, 0]; const nrm = [0, 0, 0];
      pos[uAxis] = u * uDir; pos[vAxis] = v * vDir; pos[wAxis] = wHalf;
      nrm[wAxis] = nSign;
      mb.vertex(pos[0], pos[1], pos[2], nrm[0], nrm[1], nrm[2], ix / gridU, 1 - iy / gridV);
    }
  }
  const row = gridU + 1;
  for (let iy = 0; iy < gridV; iy++) {
    for (let ix = 0; ix < gridU; ix++) {
      const a = start + ix + row * iy;
      const b = start + ix + row * (iy + 1);
      const c = start + (ix + 1) + row * (iy + 1);
      const d = start + (ix + 1) + row * iy;
      mb.triangle(a, b, d); mb.triangle(b, c, d);
    }
  }
}

export { BoxGeometry };
