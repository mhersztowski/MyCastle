/**
 * scene3d.js — przeglądarkowy bundel @mhersztowski/core scene3d: geometrie
 * (Box/Plane/Circle/Cylinder/Cone/Sphere/Torus), Vec3, Box3, MeshBuilder oraz
 * fasada Geometry. Niezależne od bibliotek; liczą objętość/pole/AABB i generują
 * siatkę (pozycje/normalne/UV/indeksy).
 *
 * Wygenerowany ze sklejenia plików scene3d/. BEZ import/export — klasy są
 * eksportowane przez globalny namespace (window/globalThis), więc działają też
 * w skryptach automatyzacji (AsyncFunction/eval). Każda klasa ma metody
 * instancji ORAZ ich statyczne odpowiedniki (`Class.foo(self, …)`) — dla
 * wygodnych podpowiedzi w edytorach.
 *
 * NIE edytuj ręcznie — generowane przez _build.mjs ze źródeł w scene3d/.
 */

// ════════════════════ Vec3.js ════════════════════
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

  // ── Statyczne odpowiedniki metod instancji (autocomplete: Vec3.foo(self, …)) ──
  static clone(self) { return self.clone(); }
}

// ════════════════════ Box3.js ════════════════════
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

// ════════════════════ MeshBuilder.js ════════════════════
/**
 * MeshBuilder — akumulator buforów siatki (pozycje / normalne / UV / indeksy).
 *
 * Geometrie używają go w `build()`. Wynik (`MeshData`) to płaskie tablice gotowe
 * do wgrania jako bufory WebGL/Three/itp. — sam builder jest niezależny od
 * jakiejkolwiek biblioteki renderującej.
 *
 * @typedef {{ positions: number[], normals: number[], uvs: number[], indices: number[] }} MeshData
 */
class MeshBuilder {
  constructor() {
    /** @type {number[]} */ this.positions = [];
    /** @type {number[]} */ this.normals = [];
    /** @type {number[]} */ this.uvs = [];
    /** @type {number[]} */ this.indices = [];
  }
  /** @returns {MeshBuilder} */
  static create() { return new MeshBuilder(); }

  /** Liczba dotychczas dodanych wierzchołków. @returns {number} */
  get vertexCount() { return this.positions.length / 3; }

  /**
   * Dodaje wierzchołek i zwraca jego indeks.
   * @returns {number}
   */
  vertex(px, py, pz, nx, ny, nz, u, v) {
    this.positions.push(px, py, pz);
    this.normals.push(nx, ny, nz);
    this.uvs.push(u, v);
    return this.positions.length / 3 - 1;
  }
  /** Trójkąt z trzech indeksów. @returns {MeshBuilder} */
  triangle(a, b, c) { this.indices.push(a, b, c); return this; }
  /** Czworokąt jako dwa trójkąty (a,b,c,d w kolejności CCW). @returns {MeshBuilder} */
  quad(a, b, c, d) { this.indices.push(a, b, d, b, c, d); return this; }

  /** @returns {MeshData} */
  build() { return { positions: this.positions, normals: this.normals, uvs: this.uvs, indices: this.indices }; }

  /** Statystyki siatki. @param {MeshData} md @returns {{ vertices: number, triangles: number }} */
  static counts(md) { return { vertices: md.positions.length / 3, triangles: md.indices.length / 3 }; }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: MeshBuilder.foo(self, …)) ──
  static vertexCount(self) { return self.vertexCount; }
  static vertex(self, px, py, pz, nx, ny, nz, u, v) { return self.vertex(px, py, pz, nx, ny, nz, u, v); }
  static triangle(self, a, b, c) { return self.triangle(a, b, c); }
  static quad(self, a, b, c, d) { return self.quad(a, b, c, d); }
  static build(self) { return self.build(); }
}

// ════════════════════ BoxGeometry.js ════════════════════
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

// ════════════════════ PlaneGeometry.js ════════════════════
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

// ════════════════════ CircleGeometry.js ════════════════════
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

// ════════════════════ CylinderGeometry.js ════════════════════
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

// ════════════════════ ConeGeometry.js ════════════════════
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

// ════════════════════ SphereGeometry.js ════════════════════
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

// ════════════════════ TorusGeometry.js ════════════════════
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

// ════════════════════ Geometry.js ════════════════════
/**
 * @typedef {'box'|'plane'|'circle'|'cylinder'|'cone'|'sphere'|'torus'} GeometryType
 * @typedef {import('./MeshBuilder.js').MeshData} MeshData
 */
const REGISTRY = {
  box: BoxGeometry,
  plane: PlaneGeometry,
  circle: CircleGeometry,
  cylinder: CylinderGeometry,
  cone: ConeGeometry,
  sphere: SphereGeometry,
  torus: TorusGeometry,
};

/**
 * Geometry — fasada dispatchująca po typie. Wszystkie metody statyczne, więc
 * edytor podpowiada `Geometry.build('box', { width: 2 })` itp.
 */
class Geometry {
  /** Lista obsługiwanych typów. @returns {GeometryType[]} */
  static types() { return /** @type {GeometryType[]} */ (Object.keys(REGISTRY)); }
  /** Klasa geometrii dla typu. @param {GeometryType} type */
  static get(type) { const G = REGISTRY[type]; if (!G) throw new Error(`Nieznany typ geometrii: ${type}`); return G; }
  /** Domyślne parametry typu. @param {GeometryType} type */
  static defaults(type) { return Geometry.get(type).defaults(); }
  /** Tworzy instancję geometrii. @param {GeometryType} type @param {object} [params] */
  static create(type, params) { const G = Geometry.get(type); return new G(params); }

  /** @param {GeometryType} type @param {object} params @returns {MeshData} */
  static build(type, params) { return Geometry.get(type).build(params); }
  /** @param {GeometryType} type @param {object} params @returns {number} */
  static volume(type, params) { return Geometry.get(type).volume(params); }
  /** @param {GeometryType} type @param {object} params @returns {number} */
  static surfaceArea(type, params) { return Geometry.get(type).surfaceArea(params); }
  /** @param {GeometryType} type @param {object} params */
  static boundingBox(type, params) { return Geometry.get(type).boundingBox(params); }
}

// ════════════════════ Eksport przez globalny namespace (bez `export`) ════════════════════
{
  const _g = (typeof globalThis !== 'undefined') ? globalThis
    : (typeof window !== 'undefined') ? window
      : (typeof self !== 'undefined') ? self : this;
  Object.assign(_g, {
    Vec3, Box3, MeshBuilder,
    BoxGeometry, PlaneGeometry, CircleGeometry, CylinderGeometry, ConeGeometry,
    SphereGeometry, TorusGeometry, Geometry,
  });
}
