/**
 * Vec3 — wektor 3D, niezależny od jakiejkolwiek biblioteki.
 *
 * Wektor to zwykły obiekt `{ x, y, z }`. Wszystkie operacje są **funkcjami
 * statycznymi** (`Vec3.add(...)`, `Vec3.cross(...)`), więc edytor podpowiada je
 * od razu po wpisaniu `Vec3.`. Instancja `new Vec3()` jest opcjonalna.
 *
 * @typedef {{ x: number, y: number, z: number }} Vec3Like
 */
class Vec3 {
  /** @param {number} [x] @param {number} [y] @param {number} [z] */
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }

  /** Tworzy nowy wektor. @returns {Vec3} */
  static of(x = 0, y = 0, z = 0) { return new Vec3(x, y, z); }
  /** @param {[number, number, number] | number[]} a @param {number} [i] @returns {Vec3} */
  static fromArray(a, i = 0) { return new Vec3(a[i], a[i + 1], a[i + 2]); }
  /** @param {Vec3Like} a @returns {[number, number, number]} */
  static toArray(a) { return [a.x, a.y, a.z]; }

  /** Suma a+b. @param {Vec3Like} a @param {Vec3Like} b @returns {Vec3} */
  static add(a, b) { return new Vec3(a.x + b.x, a.y + b.y, a.z + b.z); }
  /** Różnica a-b. @param {Vec3Like} a @param {Vec3Like} b @returns {Vec3} */
  static sub(a, b) { return new Vec3(a.x - b.x, a.y - b.y, a.z - b.z); }
  /** Mnożenie przez skalar. @param {Vec3Like} a @param {number} s @returns {Vec3} */
  static scale(a, s) { return new Vec3(a.x * s, a.y * s, a.z * s); }
  /** Mnożenie składowych. @param {Vec3Like} a @param {Vec3Like} b @returns {Vec3} */
  static mul(a, b) { return new Vec3(a.x * b.x, a.y * b.y, a.z * b.z); }
  /** Negacja. @param {Vec3Like} a @returns {Vec3} */
  static negate(a) { return new Vec3(-a.x, -a.y, -a.z); }

  /** Iloczyn skalarny. @param {Vec3Like} a @param {Vec3Like} b @returns {number} */
  static dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  /** Iloczyn wektorowy a×b. @param {Vec3Like} a @param {Vec3Like} b @returns {Vec3} */
  static cross(a, b) { return new Vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }

  /** Długość. @param {Vec3Like} a @returns {number} */
  static length(a) { return Math.hypot(a.x, a.y, a.z); }
  /** Długość do kwadratu (taniej niż length). @param {Vec3Like} a @returns {number} */
  static lengthSq(a) { return a.x * a.x + a.y * a.y + a.z * a.z; }
  /** Odległość między a i b. @param {Vec3Like} a @param {Vec3Like} b @returns {number} */
  static distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
  /** Wektor jednostkowy. @param {Vec3Like} a @returns {Vec3} */
  static normalize(a) { const l = Vec3.length(a) || 1; return new Vec3(a.x / l, a.y / l, a.z / l); }
  /** Interpolacja liniowa. @param {Vec3Like} a @param {Vec3Like} b @param {number} t @returns {Vec3} */
  static lerp(a, b, t) { return new Vec3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t); }
  /** Porównanie z tolerancją. @param {Vec3Like} a @param {Vec3Like} b @param {number} [eps] @returns {boolean} */
  static equals(a, b, eps = 1e-9) { return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.z - b.z) < eps; }

  // ── Wygody instancyjne (delegują do funkcji statycznych) ──
  add(b) { return Vec3.add(this, b); }
  sub(b) { return Vec3.sub(this, b); }
  scale(s) { return Vec3.scale(this, s); }
  dot(b) { return Vec3.dot(this, b); }
  cross(b) { return Vec3.cross(this, b); }
  length() { return Vec3.length(this); }
  normalize() { return Vec3.normalize(this); }
  clone() { return new Vec3(this.x, this.y, this.z); }
  toArray() { return Vec3.toArray(this); }
}

export { Vec3 };
