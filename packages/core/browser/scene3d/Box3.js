import { Vec3 } from './Vec3.js';

/**
 * Box3 — prostopadłościan ograniczający osiowo (AABB), funkcje statyczne.
 *
 * Pudełko to `{ min: Vec3Like, max: Vec3Like }`. `Box3.describe()` zwraca pełny
 * opis używany przez geometrie: `{ min, max, size, center }`.
 *
 * @typedef {import('./Vec3.js').Vec3Like} Vec3Like
 * @typedef {{ min: Vec3Like, max: Vec3Like }} Box3Like
 * @typedef {{ min: Vec3Like, max: Vec3Like, size: Vec3Like, center: Vec3Like }} Box3Info
 */
class Box3 {
  /** Puste (nieskończone) pudełko gotowe do `expand`. @returns {Box3Like} */
  static empty() {
    return { min: Vec3.of(Infinity, Infinity, Infinity), max: Vec3.of(-Infinity, -Infinity, -Infinity) };
  }
  /** Rozszerza pudełko o punkt (mutuje). @param {Box3Like} box @returns {Box3Like} */
  static expand(box, x, y, z) {
    if (x < box.min.x) box.min.x = x; if (y < box.min.y) box.min.y = y; if (z < box.min.z) box.min.z = z;
    if (x > box.max.x) box.max.x = x; if (y > box.max.y) box.max.y = y; if (z > box.max.z) box.max.z = z;
    return box;
  }
  /** Z płaskiej tablicy pozycji `[x,y,z, x,y,z, …]`. @param {number[]} positions @returns {Box3Like} */
  static fromPositions(positions) {
    const b = Box3.empty();
    for (let i = 0; i < positions.length; i += 3) Box3.expand(b, positions[i], positions[i + 1], positions[i + 2]);
    return b;
  }
  /** Z punktów. @param {Vec3Like[]} points @returns {Box3Like} */
  static fromPoints(points) {
    const b = Box3.empty();
    for (const p of points) Box3.expand(b, p.x, p.y, p.z);
    return b;
  }
  /** Wyśrodkowane na (cx,cy,cz) o rozmiarze (w,h,d). @returns {Box3Like} */
  static fromCenterSize(cx, cy, cz, w, h, d) {
    return { min: Vec3.of(cx - w / 2, cy - h / 2, cz - d / 2), max: Vec3.of(cx + w / 2, cy + h / 2, cz + d / 2) };
  }

  /** Rozmiar (szerokość, wysokość, głębokość). @param {Box3Like} box @returns {Vec3} */
  static size(box) { return Vec3.of(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z); }
  /** Środek. @param {Box3Like} box @returns {Vec3} */
  static center(box) { return Vec3.of((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2); }
  /** Objętość pudełka. @param {Box3Like} box @returns {number} */
  static volume(box) { const s = Box3.size(box); return s.x * s.y * s.z; }
  /** Pełny opis `{ min, max, size, center }`. @param {Box3Like} box @returns {Box3Info} */
  static describe(box) { return { min: box.min, max: box.max, size: Box3.size(box), center: Box3.center(box) }; }
}

export { Box3 };
