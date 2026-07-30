/**
 * browser/threejs/three-api.ts — fasada Three.js w formie klas ze statycznymi metodami.
 *
 * Po co: skrypty w Drive, bloczki Blockly i automatyzacje operują na płaskich
 * wywołaniach (`T3Geometry.box(1, 1, 1)`), a nie na `new THREE.BoxGeometry(…)`.
 * Statyczne metody dają jedno miejsce z podpowiedziami, ujednolicone domyślne
 * wartości i skróty na czynności, które w surowym API zajmują kilka linii.
 *
 *   import { T3Scene, T3Mesh, T3Geometry, T3Material, T3Light } from '…/threejs/three-api';
 *
 *   const scene = T3Scene.create({ background: '#101018' });
 *   const cube  = T3Mesh.create(T3Geometry.box(1, 1, 1), T3Material.standard({ color: '#4fc3f7' }));
 *   T3Scene.add(scene, cube, T3Light.ambient('#fff', 0.4), T3Light.directional('#fff', 1, [3, 5, 2]));
 *
 * ZAKRES: pokryte są obszary, z których faktycznie się korzysta — matematyka,
 * geometrie, materiały, tekstury, obiekty i transformacje, światła, kamery,
 * scena, renderer, loadery, raycasting, animacje, krzywe i helpery. Three.js ma
 * setek klas (postprocessing, nodes, WebGPU, fizyka…) i przepisywanie wszystkiego
 * 1:1 byłoby dublowaniem biblioteki bez zysku. Do rzeczy nieobjętych fasadą jest
 * `Three.raw` — pełny namespace THREE.
 *
 * Konwencje:
 *   • kolory przyjmują `'#rrggbb'`, `0xrrggbb` albo `THREE.Color`,
 *   • pozycje/rotacje przyjmują `[x, y, z]`, `{x, y, z}` albo `THREE.Vector3`,
 *   • metody zwracają utworzony obiekt Three (nie własne opakowania), więc
 *     w każdej chwili można zejść do surowego API,
 *   • metody modyfikujące zwracają ten sam obiekt — pozwala to łączyć wywołania.
 */
import * as THREE from 'three';

// ── Typy wejściowe ───────────────────────────────────────────────────────────

/** Kolor w formie wygodnej dla skryptu. */
export type ColorLike = string | number | THREE.Color;
/** Punkt/wektor w formie wygodnej dla skryptu. */
export type Vec3Like = THREE.Vector3 | [number, number, number] | { x: number; y: number; z: number };
/** Punkt 2D. */
export type Vec2Like = THREE.Vector2 | [number, number] | { x: number; y: number };

/** Dostęp do surowego namespace — wszystko, czego fasada nie obejmuje. */
export class Three {
  /** Pełny namespace `THREE`. */
  static get raw(): typeof THREE { return THREE; }
  /** Wersja biblioteki (np. `182`). */
  static get revision(): string { return THREE.REVISION; }
}

// ── Matematyka ───────────────────────────────────────────────────────────────

/**
 * Wektory, obroty, macierze i kolory. Wszystkie konwersje z formy „skryptowej"
 * (`[x, y, z]`, `'#fff'`) na obiekty Three przechodzą przez tę klasę, żeby
 * reszta fasady miała jedno miejsce prawdy.
 */
export class T3Math {
  /**
   * Buduje wektor 3D z formy wygodnej w skrypcie.
   *
   * @param v Tablica `[x,y,z]`, obiekt `{x,y,z}`, `Vector3` albo liczba — liczba
   *   oznacza tę samą wartość we wszystkich osiach (przydatne przy skali).
   * @param y Składowa Y, gdy `v` jest liczbą.
   * @param z Składowa Z, gdy `v` jest liczbą.
   * @returns Nowy `Vector3` — argument nigdy nie jest modyfikowany.
   * @example
   * T3Math.vec3([1, 2, 3]);   // (1,2,3)
   * T3Math.vec3(2);           // (2,2,2)
   */
  static vec3(v: Vec3Like | number = 0, y?: number, z?: number): THREE.Vector3 {
    if (typeof v === 'number') return new THREE.Vector3(v, y ?? v, z ?? v);
    if (Array.isArray(v)) return new THREE.Vector3(v[0], v[1], v[2]);
    return new THREE.Vector3(v.x, v.y, v.z);
  }

  static vec2(v: Vec2Like | number = 0, y?: number): THREE.Vector2 {
    if (typeof v === 'number') return new THREE.Vector2(v, y ?? v);
    if (Array.isArray(v)) return new THREE.Vector2(v[0], v[1]);
    return new THREE.Vector2(v.x, v.y);
  }

  /**
   * Buduje kolor z zapisu tekstowego, liczbowego albo istniejącego `Color`.
   *
   * @param c `'#rrggbb'`, nazwa CSS (`'red'`), liczba `0xrrggbb` albo `Color`.
   * @returns Nowy `Color` — kopia, więc zmiana wyniku nie rusza źródła.
   */
  static color(c: ColorLike = 0xffffff): THREE.Color {
    return c instanceof THREE.Color ? c.clone() : new THREE.Color(c as string | number);
  }

  /**
   * Obrót z trzech kątów.
   *
   * @param x Obrót wokół osi X.
   * @param y Obrót wokół osi Y.
   * @param z Obrót wokół osi Z.
   * @param degrees `true` (domyślnie) = kąty w stopniach, `false` = w radianach.
   * @returns Nowy `Euler` w kolejności XYZ.
   */
  static euler(x = 0, y = 0, z = 0, degrees = true): THREE.Euler {
    const f = degrees ? THREE.MathUtils.DEG2RAD : 1;
    return new THREE.Euler(x * f, y * f, z * f);
  }

  static quaternion(x = 0, y = 0, z = 0, w = 1): THREE.Quaternion {
    return new THREE.Quaternion(x, y, z, w);
  }

  /**
   * Kwaternion obrotu wokół dowolnej osi.
   *
   * @param axis Oś obrotu (normalizowana automatycznie).
   * @param angle Kąt obrotu.
   * @param degrees `true` (domyślnie) = stopnie.
   * @returns Kwaternion gotowy do `applyQuaternion`.
   */
  static quaternionFromAxis(axis: Vec3Like, angle: number, degrees = true): THREE.Quaternion {
    const rad = degrees ? angle * THREE.MathUtils.DEG2RAD : angle;
    return new THREE.Quaternion().setFromAxisAngle(T3Math.vec3(axis).normalize(), rad);
  }

  static matrix4(): THREE.Matrix4 { return new THREE.Matrix4(); }

  static add(a: Vec3Like, b: Vec3Like): THREE.Vector3 { return T3Math.vec3(a).add(T3Math.vec3(b)); }
  static sub(a: Vec3Like, b: Vec3Like): THREE.Vector3 { return T3Math.vec3(a).sub(T3Math.vec3(b)); }
  static scale(v: Vec3Like, s: number): THREE.Vector3 { return T3Math.vec3(v).multiplyScalar(s); }
  static dot(a: Vec3Like, b: Vec3Like): number { return T3Math.vec3(a).dot(T3Math.vec3(b)); }
  static cross(a: Vec3Like, b: Vec3Like): THREE.Vector3 { return T3Math.vec3(a).cross(T3Math.vec3(b)); }
  /**
   * Długość (moduł) wektora.
   *
   * @param v Wektor w dowolnej obsługiwanej formie.
   * @returns Długość wektora.
   * @remarks Nazwa `magnitude`, bo statyczne `length` kolidowałoby z `Function.length`.
   */
  static magnitude(v: Vec3Like): number { return T3Math.vec3(v).length(); }
  static normalize(v: Vec3Like): THREE.Vector3 { return T3Math.vec3(v).normalize(); }
  static distance(a: Vec3Like, b: Vec3Like): number { return T3Math.vec3(a).distanceTo(T3Math.vec3(b)); }
  /**
   * Punkt pośredni między dwoma punktami.
   *
   * @param a Punkt początkowy.
   * @param b Punkt końcowy.
   * @param t Udział punktu `b` (0 = `a`, 1 = `b`).
   * @returns Nowy wektor.
   */
  static lerpVec(a: Vec3Like, b: Vec3Like, t: number): THREE.Vector3 {
    return T3Math.vec3(a).lerp(T3Math.vec3(b), t);
  }

  static clamp(value: number, min: number, max: number): number { return THREE.MathUtils.clamp(value, min, max); }
  static lerp(a: number, b: number, t: number): number { return THREE.MathUtils.lerp(a, b, t); }
  static degToRad(deg: number): number { return THREE.MathUtils.degToRad(deg); }
  static radToDeg(rad: number): number { return THREE.MathUtils.radToDeg(rad); }
  static randomFloat(min: number, max: number): number { return THREE.MathUtils.randFloat(min, max); }
  static randomInt(min: number, max: number): number { return THREE.MathUtils.randInt(min, max); }
  /**
   * Przelicza wartość z jednego zakresu na inny.
   *
   * @param value Wartość wejściowa.
   * @param inMin Dolna granica zakresu wejściowego.
   * @param inMax Górna granica zakresu wejściowego.
   * @param outMin Dolna granica zakresu wyjściowego.
   * @param outMax Górna granica zakresu wyjściowego.
   * @returns Wartość w zakresie wyjściowym (bez przycinania).
   * @example
   * T3Math.mapRange(512, 0, 1023, -90, 90);   // ≈ 0 — czujnik → kąt serwa
   */
  static mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    return THREE.MathUtils.mapLinear(value, inMin, inMax, outMin, outMax);
  }
}

// ── Geometrie ────────────────────────────────────────────────────────────────

/** Fabryki geometrii oraz operacje na `BufferGeometry`. */
export class T3Geometry {
  /**
   * Prostopadłościan wyśrodkowany w początku układu.
   *
   * @param width Rozmiar w osi X.
   * @param height Rozmiar w osi Y.
   * @param depth Rozmiar w osi Z.
   * @param segments Podział ścian — potrzebny tylko przy deformacjach siatki.
   * @returns Geometria pudełka.
   */
  static box(width = 1, height = 1, depth = 1, segments?: { w?: number; h?: number; d?: number }): THREE.BoxGeometry {
    return new THREE.BoxGeometry(width, height, depth, segments?.w ?? 1, segments?.h ?? 1, segments?.d ?? 1);
  }

  /**
   * Kula.
   *
   * @param radius Promień.
   * @param widthSegments Liczba podziałów w poziomie (gładkość obwodu).
   * @param heightSegments Liczba podziałów w pionie.
   * @returns Geometria kuli.
   */
  static sphere(radius = 1, widthSegments = 32, heightSegments = 16): THREE.SphereGeometry {
    return new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  }

  static plane(width = 1, height = 1, segX = 1, segY = 1): THREE.PlaneGeometry {
    return new THREE.PlaneGeometry(width, height, segX, segY);
  }

  static circle(radius = 1, segments = 32): THREE.CircleGeometry {
    return new THREE.CircleGeometry(radius, segments);
  }

  static ring(inner = 0.5, outer = 1, segments = 32): THREE.RingGeometry {
    return new THREE.RingGeometry(inner, outer, segments);
  }

  /**
   * Walec lub stożek ścięty — różne promienie podstaw dają zwężenie.
   *
   * @param radiusTop Promień górnej podstawy (0 = stożek).
   * @param radiusBottom Promień dolnej podstawy.
   * @param height Wysokość.
   * @param segments Liczba podziałów obwodu.
   * @param open `true` = bez pokryw (rura).
   * @returns Geometria walca.
   */
  static cylinder(radiusTop = 1, radiusBottom = 1, height = 1, segments = 32, open = false): THREE.CylinderGeometry {
    return new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, open);
  }

  static cone(radius = 1, height = 1, segments = 32, open = false): THREE.ConeGeometry {
    return new THREE.ConeGeometry(radius, height, segments, 1, open);
  }

  static torus(radius = 1, tube = 0.3, radialSegments = 16, tubularSegments = 48): THREE.TorusGeometry {
    return new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments);
  }

  static torusKnot(radius = 1, tube = 0.3, tubularSegments = 64, radialSegments = 8): THREE.TorusKnotGeometry {
    return new THREE.TorusKnotGeometry(radius, tube, tubularSegments, radialSegments);
  }

  static capsule(radius = 0.5, length = 1, capSegments = 8, radialSegments = 16): THREE.CapsuleGeometry {
    return new THREE.CapsuleGeometry(radius, length, capSegments, radialSegments);
  }

  static tetrahedron(radius = 1, detail = 0): THREE.TetrahedronGeometry { return new THREE.TetrahedronGeometry(radius, detail); }
  static octahedron(radius = 1, detail = 0): THREE.OctahedronGeometry { return new THREE.OctahedronGeometry(radius, detail); }
  static dodecahedron(radius = 1, detail = 0): THREE.DodecahedronGeometry { return new THREE.DodecahedronGeometry(radius, detail); }
  static icosahedron(radius = 1, detail = 0): THREE.IcosahedronGeometry { return new THREE.IcosahedronGeometry(radius, detail); }

  /**
   * Rura prowadzona po krzywej — kable, tory, ścieżki.
   *
   * @param curve Krzywa środkowa (np. z `T3Curve.catmullRom`).
   * @param tubularSegments Liczba podziałów wzdłuż krzywej.
   * @param radius Promień przekroju.
   * @param radialSegments Liczba podziałów przekroju.
   * @param closed `true` = domknięta pętla.
   * @returns Geometria rury.
   */
  static tube(curve: THREE.Curve<THREE.Vector3>, tubularSegments = 64, radius = 0.1, radialSegments = 8, closed = false): THREE.TubeGeometry {
    return new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, closed);
  }

  /**
   * Bryła obrotowa z profilu 2D — kieliszek, wazon, tuleja.
   *
   * @param points Profil w płaszczyźnie XY, obracany wokół osi Y.
   * @param segments Liczba podziałów obrotu.
   * @returns Geometria bryły obrotowej.
   */
  static lathe(points: Vec2Like[], segments = 32): THREE.LatheGeometry {
    return new THREE.LatheGeometry(points.map((p) => T3Math.vec2(p)), segments);
  }

  /**
   * Wyciągnięcie kształtu 2D w bryłę.
   *
   * @param shape Kształt (albo lista kształtów) — np. z `T3Curve.rectShape`.
   * @param depth Głębokość wyciągnięcia w osi Z.
   * @param bevel `true` = zaokrąglona krawędź.
   * @param steps Liczba podziałów wzdłuż wyciągnięcia.
   * @returns Geometria bryły.
   */
  static extrude(shape: THREE.Shape | THREE.Shape[], depth = 1, bevel = false, steps = 1): THREE.ExtrudeGeometry {
    return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel, steps });
  }

  /**
   * Geometria zbudowana z surowych tablic — dla własnych generatorów siatki.
   *
   * @param positions Współrzędne wierzchołków, po trzy liczby na wierzchołek.
   * @param indices Opcjonalne indeksy trójkątów; brak = wierzchołki po kolei.
   * @param normals Opcjonalne normalne; gdy ich nie ma, są liczone automatycznie.
   * @returns Geometria gotowa do użycia w siatce.
   */
  static fromPositions(positions: ArrayLike<number>, indices?: ArrayLike<number>, normals?: ArrayLike<number>): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(Array.from(positions), 3));
    if (indices) geometry.setIndex(Array.from(indices));
    if (normals) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from(normals), 3));
    else geometry.computeVertexNormals();
    return geometry;
  }

  /** Geometria linii przez podane punkty. */
  static fromPoints(points: Vec3Like[]): THREE.BufferGeometry {
    return new THREE.BufferGeometry().setFromPoints(points.map((p) => T3Math.vec3(p)));
  }

  /**
   * Przelicza normalne — po ręcznej zmianie pozycji wierzchołków.
   *
   * @param geometry Geometria do przeliczenia.
   * @returns Ta sama geometria (pozwala łączyć wywołania).
   */
  static computeNormals<T extends THREE.BufferGeometry>(geometry: T): T {
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Przesuwa geometrię tak, by jej środek wypadł w początku układu.
   *
   * @param geometry Geometria do wyśrodkowania.
   * @returns Ta sama geometria.
   * @remarks Przydatne po wczytaniu modelu, którego autor ustawił inny punkt odniesienia.
   */
  static center<T extends THREE.BufferGeometry>(geometry: T): T {
    geometry.center();
    return geometry;
  }

  static translate<T extends THREE.BufferGeometry>(geometry: T, offset: Vec3Like): T {
    const v = T3Math.vec3(offset);
    geometry.translate(v.x, v.y, v.z);
    return geometry;
  }

  static scaleGeometry<T extends THREE.BufferGeometry>(geometry: T, factor: Vec3Like | number): T {
    const v = T3Math.vec3(factor);
    geometry.scale(v.x, v.y, v.z);
    return geometry;
  }

  static rotate<T extends THREE.BufferGeometry>(geometry: T, x = 0, y = 0, z = 0, degrees = true): T {
    const f = degrees ? THREE.MathUtils.DEG2RAD : 1;
    if (x) geometry.rotateX(x * f);
    if (y) geometry.rotateY(y * f);
    if (z) geometry.rotateZ(z * f);
    return geometry;
  }

  /**
   * Pudełko otaczające geometrię (AABB).
   *
   * @param geometry Geometria do zmierzenia.
   * @returns `Box3` w układzie lokalnym geometrii.
   */
  static boundingBox(geometry: THREE.BufferGeometry): THREE.Box3 {
    geometry.computeBoundingBox();
    return geometry.boundingBox ?? new THREE.Box3();
  }

  static boundingSphere(geometry: THREE.BufferGeometry): THREE.Sphere {
    geometry.computeBoundingSphere();
    return geometry.boundingSphere ?? new THREE.Sphere();
  }

  /**
   * Liczba wierzchołków — miara kosztu renderowania.
   *
   * @param geometry Geometria do zbadania.
   * @returns Liczba wierzchołków (0, gdy geometria nie ma pozycji).
   */
  static vertexCount(geometry: THREE.BufferGeometry): number {
    return geometry.getAttribute('position')?.count ?? 0;
  }

  static dispose(geometry: THREE.BufferGeometry): void { geometry.dispose(); }
}

// ── Materiały ────────────────────────────────────────────────────────────────

export interface MaterialOptions {
  color?: ColorLike;
  opacity?: number;
  transparent?: boolean;
  wireframe?: boolean;
  side?: 'front' | 'back' | 'double';
  map?: THREE.Texture | null;
  metalness?: number;
  roughness?: number;
  emissive?: ColorLike;
  flatShading?: boolean;
  depthWrite?: boolean;
}

/**
 * Fabryki materiałów.
 *
 * Wspólne opcje (`color`, `opacity`, `side`, …) tłumaczone są w jednym miejscu,
 * więc zachowują się identycznie w każdym rodzaju materiału.
 */
export class T3Material {
  private static common(options: MaterialOptions): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (options.color !== undefined) out.color = T3Math.color(options.color);
    if (options.opacity !== undefined) { out.opacity = options.opacity; out.transparent = options.transparent ?? options.opacity < 1; }
    if (options.transparent !== undefined) out.transparent = options.transparent;
    if (options.wireframe !== undefined) out.wireframe = options.wireframe;
    if (options.map !== undefined) out.map = options.map;
    if (options.flatShading !== undefined) out.flatShading = options.flatShading;
    if (options.depthWrite !== undefined) out.depthWrite = options.depthWrite;
    if (options.emissive !== undefined) out.emissive = T3Math.color(options.emissive);
    if (options.side) {
      out.side = options.side === 'back' ? THREE.BackSide : options.side === 'double' ? THREE.DoubleSide : THREE.FrontSide;
    }
    return out;
  }

  /**
   * Materiał niereagujący na światło — stały kolor.
   *
   * @param options Kolor, przezroczystość, siatka, tekstura, strona ścianek.
   * @returns Nowy `MeshBasicMaterial`. Najtańszy w renderowaniu; dobry do
   *   helperów, obrysów i elementów interfejsu w 3D.
   */
  static basic(options: MaterialOptions = {}): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial(T3Material.common(options));
  }

  /**
   * Materiał fizyczny (PBR) — domyślny wybór dla realistycznych scen.
   *
   * @param options Opcje wspólne oraz `metalness` (0…1) i `roughness` (0…1).
   * @returns Nowy `MeshStandardMaterial` z metalicznością 0.1 i szorstkością 0.6,
   *   o ile nie podano inaczej.
   * @remarks Wymaga świateł w scenie — bez nich obiekt jest czarny.
   */
  static standard(options: MaterialOptions = {}): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      metalness: options.metalness ?? 0.1,
      roughness: options.roughness ?? 0.6,
      ...T3Material.common(options),
    });
  }

  /**
   * PBR z dodatkami — lakier (`clearcoat`) i przezierność (`transmission`).
   *
   * @param options Opcje jak w `standard` plus `clearcoat` i `transmission` (0…1).
   * @returns Nowy `MeshPhysicalMaterial`.
   * @remarks Kosztowniejszy od `standard` — sięgaj po niego dla szkła, wody i lakieru.
   */
  static physical(options: MaterialOptions & { clearcoat?: number; transmission?: number } = {}): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      metalness: options.metalness ?? 0.1,
      roughness: options.roughness ?? 0.6,
      clearcoat: options.clearcoat ?? 0,
      transmission: options.transmission ?? 0,
      ...T3Material.common(options),
    });
  }

  static phong(options: MaterialOptions & { shininess?: number } = {}): THREE.MeshPhongMaterial {
    return new THREE.MeshPhongMaterial({ shininess: options.shininess ?? 30, ...T3Material.common(options) });
  }

  static lambert(options: MaterialOptions = {}): THREE.MeshLambertMaterial {
    return new THREE.MeshLambertMaterial(T3Material.common(options));
  }

  /**
   * Materiał kreskówkowy — światło w płaskich pasach zamiast gradientu.
   *
   * @param options Opcje wspólne.
   * @returns Nowy `MeshToonMaterial`.
   */
  static toon(options: MaterialOptions = {}): THREE.MeshToonMaterial {
    return new THREE.MeshToonMaterial(T3Material.common(options));
  }

  /**
   * Normalne pokazane jako kolor — narzędzie diagnostyczne.
   *
   * @param options `wireframe` i `flatShading`.
   * @returns Nowy `MeshNormalMaterial`. Pozwala wzrokowo znaleźć odwrócone
   *   ścianki i błędy w normalnych.
   */
  static normal(options: { wireframe?: boolean; flatShading?: boolean } = {}): THREE.MeshNormalMaterial {
    return new THREE.MeshNormalMaterial({ wireframe: options.wireframe ?? false, flatShading: options.flatShading ?? false });
  }

  static depth(): THREE.MeshDepthMaterial { return new THREE.MeshDepthMaterial(); }

  static line(options: { color?: ColorLike; linewidth?: number } = {}): THREE.LineBasicMaterial {
    return new THREE.LineBasicMaterial({ color: T3Math.color(options.color ?? 0xffffff), linewidth: options.linewidth ?? 1 });
  }

  static lineDashed(options: { color?: ColorLike; dashSize?: number; gapSize?: number } = {}): THREE.LineDashedMaterial {
    return new THREE.LineDashedMaterial({
      color: T3Math.color(options.color ?? 0xffffff),
      dashSize: options.dashSize ?? 0.1,
      gapSize: options.gapSize ?? 0.05,
    });
  }

  static points(options: { color?: ColorLike; size?: number; sizeAttenuation?: boolean; map?: THREE.Texture } = {}): THREE.PointsMaterial {
    return new THREE.PointsMaterial({
      color: T3Math.color(options.color ?? 0xffffff),
      size: options.size ?? 0.05,
      sizeAttenuation: options.sizeAttenuation ?? true,
      map: options.map ?? null,
    });
  }

  static sprite(options: { color?: ColorLike; map?: THREE.Texture } = {}): THREE.SpriteMaterial {
    return new THREE.SpriteMaterial({ color: T3Math.color(options.color ?? 0xffffff), map: options.map ?? null });
  }

  /**
   * Materiał z własnymi shaderami.
   *
   * @param vertex Kod shadera wierzchołków (GLSL).
   * @param fragment Kod shadera fragmentów (GLSL).
   * @param uniforms Zmienne przekazywane do shaderów, w formacie `{ nazwa: { value } }`.
   * @returns Nowy `ShaderMaterial`.
   */
  static shader(vertex: string, fragment: string, uniforms: Record<string, { value: unknown }> = {}): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms });
  }

  /**
   * Zmienia kolor istniejącego materiału.
   *
   * @param material Materiał do zmiany (musi mieć pole `color`).
   * @param color Nowy kolor.
   * @returns Ten sam materiał.
   */
  static setColor<T extends THREE.Material & { color?: THREE.Color }>(material: T, color: ColorLike): T {
    if (material.color) material.color.set(T3Math.color(color));
    return material;
  }

  /**
   * Ustawia przezroczystość i sam włącza tryb `transparent`.
   *
   * @param material Materiał do zmiany.
   * @param opacity Krycie 0…1 (1 = pełne).
   * @returns Ten sam materiał.
   * @remarks Bez `transparent` Three ignoruje `opacity` — to najczęstsza pułapka,
   *   dlatego flaga ustawia się tutaj automatycznie.
   */
  static setOpacity<T extends THREE.Material>(material: T, opacity: number): T {
    material.opacity = opacity;
    material.transparent = opacity < 1;
    return material;
  }

  /**
   * Zwalnia zasoby GPU materiału.
   *
   * @param material Materiał albo lista materiałów.
   */
  static dispose(material: THREE.Material | THREE.Material[]): void {
    (Array.isArray(material) ? material : [material]).forEach((m) => m.dispose());
  }
}

// ── Tekstury ─────────────────────────────────────────────────────────────────

/** Wczytywanie i konfiguracja tekstur. Loadery są asynchroniczne. */
export class T3Texture {
  /** Wczytuje obraz jako teksturę. Odrzuca obietnicę, gdy plik nie istnieje. */
  static load(url: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(url, resolve, undefined, () => reject(new Error(`Nie udało się wczytać tekstury: ${url}`)));
    });
  }

  /** Sześcian środowiskowy z sześciu obrazów (px, nx, py, ny, pz, nz). */
  static loadCube(urls: [string, string, string, string, string, string]): Promise<THREE.CubeTexture> {
    return new Promise((resolve, reject) => {
      new THREE.CubeTextureLoader().load(urls, resolve, undefined, () => reject(new Error('Nie udało się wczytać cube map')));
    });
  }

  /** Tekstura z canvasu — do tekstu, wykresów i dynamicznych podpisów. */
  static fromCanvas(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    return new THREE.CanvasTexture(canvas);
  }

  /** Jednolity kolor jako tekstura 1×1 — tam, gdzie API wymaga mapy. */
  static solid(color: ColorLike): THREE.DataTexture {
    const c = T3Math.color(color);
    const data = new Uint8Array([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255]);
    const texture = new THREE.DataTexture(data, 1, 1);
    texture.needsUpdate = true;
    return texture;
  }

  /** Powtarzanie tekstury (kafelkowanie) — ustawia też tryb zawijania. */
  static repeat(texture: THREE.Texture, x: number, y = x): THREE.Texture {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(x, y);
    return texture;
  }

  /** `nearest` zachowuje ostre piksele (pixel art), `linear` wygładza. */
  static filter(texture: THREE.Texture, mode: 'nearest' | 'linear'): THREE.Texture {
    const f = mode === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
    texture.magFilter = f;
    texture.minFilter = f;
    texture.needsUpdate = true;
    return texture;
  }

  static dispose(texture: THREE.Texture): void { texture.dispose(); }
}

// ── Obiekty i transformacje ──────────────────────────────────────────────────

/**
 * Operacje wspólne dla wszystkiego, co stoi w scenie (`Object3D`).
 * Metody zwracają ten sam obiekt, więc dają się łączyć w łańcuch.
 */
export class T3Object {
  /**
   * Ustawia pozycję obiektu.
   *
   * @param object Obiekt scenowy.
   * @param position Nowa pozycja.
   * @returns Ten sam obiekt.
   */
  static setPosition<T extends THREE.Object3D>(object: T, position: Vec3Like): T {
    object.position.copy(T3Math.vec3(position));
    return object;
  }

  /**
   * Przesuwa obiekt o wektor (przyrostowo).
   *
   * @param object Obiekt scenowy.
   * @param delta Przesunięcie.
   * @returns Ten sam obiekt.
   */
  static move<T extends THREE.Object3D>(object: T, delta: Vec3Like): T {
    object.position.add(T3Math.vec3(delta));
    return object;
  }

  /**
   * Ustawia obrót obiektu (bezwzględnie).
   *
   * @param object Obiekt scenowy.
   * @param x Obrót wokół osi X.
   * @param y Obrót wokół osi Y.
   * @param z Obrót wokół osi Z.
   * @param degrees `true` (domyślnie) = stopnie.
   * @returns Ten sam obiekt.
   */
  static setRotation<T extends THREE.Object3D>(object: T, x = 0, y = 0, z = 0, degrees = true): T {
    const f = degrees ? THREE.MathUtils.DEG2RAD : 1;
    object.rotation.set(x * f, y * f, z * f);
    return object;
  }

  static rotate<T extends THREE.Object3D>(object: T, x = 0, y = 0, z = 0, degrees = true): T {
    const f = degrees ? THREE.MathUtils.DEG2RAD : 1;
    object.rotation.x += x * f;
    object.rotation.y += y * f;
    object.rotation.z += z * f;
    return object;
  }

  static setScale<T extends THREE.Object3D>(object: T, scale: Vec3Like | number): T {
    object.scale.copy(T3Math.vec3(scale));
    return object;
  }

  /**
   * Obraca obiekt tak, by „patrzył" na wskazany punkt.
   *
   * @param object Obiekt scenowy.
   * @param target Punkt, w stronę którego ma być skierowany.
   * @returns Ten sam obiekt.
   */
  static lookAt<T extends THREE.Object3D>(object: T, target: Vec3Like): T {
    object.lookAt(T3Math.vec3(target));
    return object;
  }

  static setVisible<T extends THREE.Object3D>(object: T, visible: boolean): T {
    object.visible = visible;
    return object;
  }

  static setName<T extends THREE.Object3D>(object: T, name: string): T {
    object.name = name;
    return object;
  }

  /**
   * Przypina do obiektu dane aplikacji.
   *
   * @param object Obiekt scenowy.
   * @param data Dane scalane z już przypisanymi (istniejące klucze są nadpisywane).
   * @returns Ten sam obiekt.
   */
  static setUserData<T extends THREE.Object3D>(object: T, data: Record<string, unknown>): T {
    object.userData = { ...object.userData, ...data };
    return object;
  }

  static add<T extends THREE.Object3D>(parent: T, ...children: THREE.Object3D[]): T {
    for (const child of children) parent.add(child);
    return parent;
  }

  static remove<T extends THREE.Object3D>(parent: T, ...children: THREE.Object3D[]): T {
    for (const child of children) parent.remove(child);
    return parent;
  }

  /** Kopia obiektu wraz z potomkami. */
  static clone<T extends THREE.Object3D>(object: T, deep = true): T {
    return object.clone(deep) as T;
  }

  /**
   * Szuka obiektu po nazwie w całym poddrzewie.
   *
   * @param root Korzeń przeszukiwania.
   * @param name Nazwa (`object.name`).
   * @returns Pierwszy pasujący obiekt albo `undefined`.
   */
  static find(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
    return root.getObjectByName(name);
  }

  /**
   * Zbiera wszystkie obiekty spełniające warunek.
   *
   * @param root Korzeń przeszukiwania.
   * @param predicate Warunek — dostaje kolejne obiekty poddrzewa.
   * @returns Lista dopasowań (może być pusta).
   * @example
   * T3Object.findAll(scene, (o) => o.name.startsWith('koło'));
   */
  static findAll(root: THREE.Object3D, predicate: (object: THREE.Object3D) => boolean): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    root.traverse((o) => { if (predicate(o)) out.push(o); });
    return out;
  }

  static traverse(root: THREE.Object3D, visit: (object: THREE.Object3D) => void): void {
    root.traverse(visit);
  }

  /**
   * Pozycja obiektu w układzie świata (z transformacjami rodziców).
   *
   * @param object Obiekt scenowy.
   * @returns Nowy wektor z pozycją globalną.
   */
  static worldPosition(object: THREE.Object3D): THREE.Vector3 {
    return object.getWorldPosition(new THREE.Vector3());
  }

  /** Pudełko otaczające obiekt wraz z potomkami. */
  static boundingBox(object: THREE.Object3D): THREE.Box3 {
    return new THREE.Box3().setFromObject(object);
  }

  /**
   * Wymiary obiektu wraz z potomkami.
   *
   * @param object Obiekt scenowy.
   * @returns Wektor `(szerokość, wysokość, głębokość)`.
   */
  static size(object: THREE.Object3D): THREE.Vector3 {
    return T3Object.boundingBox(object).getSize(new THREE.Vector3());
  }

  /**
   * Zwalnia geometrie i materiały w poddrzewie. Bez tego karta traci pamięć GPU
   * przy każdej wymianie modelu — Three nie robi tego automatycznie.
   */
  /**
   * Zwalnia geometrie i materiały w całym poddrzewie.
   *
   * @param object Korzeń poddrzewa do zwolnienia.
   * @remarks Three nie robi tego automatycznie — bez tego karta traci pamięć GPU
   *   przy każdej wymianie modelu.
   */
  static dispose(object: THREE.Object3D): void {
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (material) T3Material.dispose(material);
    });
  }
}

/** Siatka, punkty, linie, sprite'y i grupy. */
export class T3Mesh {
  /**
   * Tworzy siatkę z geometrii i materiału.
   *
   * @param geometry Geometria (np. z `T3Geometry`).
   * @param material Materiał; domyślnie `T3Material.standard()`.
   * @param options Pozycja, nazwa oraz udział w cieniach.
   * @returns Nowa siatka gotowa do dodania do scen.
   * @example
   * T3Mesh.create(T3Geometry.box(), T3Material.standard({ color: '#4fc3f7' }), { position: [0, 1, 0] });
   */
  static create(
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[] = T3Material.standard(),
    options: { position?: Vec3Like; name?: string; castShadow?: boolean; receiveShadow?: boolean } = {},
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    if (options.position) T3Object.setPosition(mesh, options.position);
    if (options.name) mesh.name = options.name;
    mesh.castShadow = options.castShadow ?? false;
    mesh.receiveShadow = options.receiveShadow ?? false;
    return mesh;
  }

  /**
   * Wiele kopii tej samej siatki w jednym obiekcie — dla tysięcy elementów
   * jedyny sposób, by nie zabić wydajności (jedno wywołanie rysowania).
   */
  /**
   * Wiele kopii tej samej siatki w jednym obiekcie.
   *
   * @param geometry Wspólna geometria.
   * @param material Wspólny materiał.
   * @param count Maksymalna liczba instancji.
   * @returns `InstancedMesh` — pozycje ustawia się przez `T3Mesh.setInstance`.
   * @remarks Dla tysięcy elementów jedyny sposób, by nie zabić wydajności:
   *   całość rysuje się jednym wywołaniem.
   */
  static instanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number): THREE.InstancedMesh {
    return new THREE.InstancedMesh(geometry, material, count);
  }

  /**
   * Ustawia pozycję i skalę jednej instancji.
   *
   * @param mesh Obiekt utworzony przez `T3Mesh.instanced`.
   * @param index Numer instancji (0 … count-1).
   * @param position Pozycja instancji.
   * @param scale Skala — liczba oznacza jednakową we wszystkich osiach.
   * @returns Ten sam `InstancedMesh`.
   */
  static setInstance(mesh: THREE.InstancedMesh, index: number, position: Vec3Like, scale: Vec3Like | number = 1): THREE.InstancedMesh {
    const matrix = new THREE.Matrix4().compose(
      T3Math.vec3(position),
      new THREE.Quaternion(),
      T3Math.vec3(scale),
    );
    mesh.setMatrixAt(index, matrix);
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  static points(geometry: THREE.BufferGeometry, material: THREE.PointsMaterial = T3Material.points()): THREE.Points {
    return new THREE.Points(geometry, material);
  }

  static line(points: Vec3Like[], material: THREE.LineBasicMaterial = T3Material.line()): THREE.Line {
    return new THREE.Line(T3Geometry.fromPoints(points), material);
  }

  static lineLoop(points: Vec3Like[], material: THREE.LineBasicMaterial = T3Material.line()): THREE.LineLoop {
    return new THREE.LineLoop(T3Geometry.fromPoints(points), material);
  }

  static sprite(material: THREE.SpriteMaterial = T3Material.sprite()): THREE.Sprite {
    return new THREE.Sprite(material);
  }

  /**
   * Kontener na obiekty — przesunięcie grupy rusza wszystkim naraz.
   *
   * @param children Obiekty do umieszczenia w grupie.
   * @returns Nowa grupa.
   */
  static group(...children: THREE.Object3D[]): THREE.Group {
    const group = new THREE.Group();
    for (const child of children) group.add(child);
    return group;
  }
}

// ── Światła ──────────────────────────────────────────────────────────────────

/** Fabryki świateł wraz z ustawieniami cieni. */
export class T3Light {
  /**
   * Światło rozproszone — jednakowe ze wszystkich stron.
   *
   * @param color Barwa światła.
   * @param intensity Natężenie.
   * @returns Nowe `AmbientLight`. Nie rzuca cieni; służy do rozjaśnienia
   *   zacienionych stron obiektów.
   */
  static ambient(color: ColorLike = 0xffffff, intensity = 0.5): THREE.AmbientLight {
    return new THREE.AmbientLight(T3Math.color(color), intensity);
  }

  /** Światło nieba/ziemi — tanie i naturalne dla scen na zewnątrz. */
  static hemisphere(sky: ColorLike = 0xffffff, ground: ColorLike = 0x444444, intensity = 1): THREE.HemisphereLight {
    return new THREE.HemisphereLight(T3Math.color(sky), T3Math.color(ground), intensity);
  }

  /**
   * Światło kierunkowe — promienie równoległe, jak słońce.
   *
   * @param color Barwa światła.
   * @param intensity Natężenie.
   * @param position Pozycja wyznaczająca kierunek padania (cel to początek układu).
   * @returns Nowe `DirectionalLight`. Cienie włącza `T3Light.enableShadows`.
   */
  static directional(color: ColorLike = 0xffffff, intensity = 1, position: Vec3Like = [5, 10, 7]): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight(T3Math.color(color), intensity);
    T3Object.setPosition(light, position);
    return light;
  }

  /**
   * Światło punktowe — świeci we wszystkie strony, jak żarówka.
   *
   * @param color Barwa światła.
   * @param intensity Natężenie.
   * @param position Pozycja źródła.
   * @param distance Zasięg; 0 = bez ograniczenia.
   * @returns Nowe `PointLight`.
   */
  static point(color: ColorLike = 0xffffff, intensity = 1, position: Vec3Like = [0, 2, 0], distance = 0): THREE.PointLight {
    const light = new THREE.PointLight(T3Math.color(color), intensity, distance);
    T3Object.setPosition(light, position);
    return light;
  }

  /**
   * Reflektor — stożek światła.
   *
   * @param color Barwa światła.
   * @param intensity Natężenie.
   * @param position Pozycja reflektora.
   * @param options `angleDeg` (połowa rozwarcia stożka w stopniach), `penumbra`
   *   (0…1, miękkość krawędzi), `distance` (zasięg), `target` (punkt oświetlany).
   * @returns Nowe `SpotLight`.
   */
  static spot(
    color: ColorLike = 0xffffff,
    intensity = 1,
    position: Vec3Like = [0, 5, 0],
    options: { angleDeg?: number; penumbra?: number; distance?: number; target?: Vec3Like } = {},
  ): THREE.SpotLight {
    const light = new THREE.SpotLight(
      T3Math.color(color),
      intensity,
      options.distance ?? 0,
      THREE.MathUtils.degToRad(options.angleDeg ?? 30),
      options.penumbra ?? 0.2,
    );
    T3Object.setPosition(light, position);
    if (options.target) light.target.position.copy(T3Math.vec3(options.target));
    return light;
  }

  /** Świecący prostokąt (jak panel LED) — działa tylko z materiałami PBR. */
  static rectArea(color: ColorLike = 0xffffff, intensity = 1, width = 1, height = 1): THREE.RectAreaLight {
    return new THREE.RectAreaLight(T3Math.color(color), intensity, width, height);
  }

  /**
   * Włącza rzucanie cieni. `size` to rozdzielczość mapy cieni — im większa,
   * tym ostrzejszy cień i większy koszt pamięci.
   */
  /**
   * Włącza rzucanie cieni przez światło.
   *
   * @param light Światło obsługujące cienie (kierunkowe, punktowe, reflektor).
   * @param size Rozdzielczość mapy cieni — większa daje ostrzejszy cień
   *   kosztem pamięci (rośnie z kwadratem).
   * @param near Bliska granica kamery cieni.
   * @param far Daleka granica kamery cieni — obiekty dalej nie rzucają cienia.
   * @returns To samo światło.
   * @remarks Same cienie wymagają jeszcze `shadows: true` w rendererze oraz
   *   `castShadow`/`receiveShadow` na obiektach.
   */
  static enableShadows<T extends THREE.Light>(light: T, size = 1024, near = 0.5, far = 50): T {
    light.castShadow = true;
    const shadow = (light as unknown as { shadow?: THREE.LightShadow }).shadow;
    if (shadow) {
      shadow.mapSize.set(size, size);
      // `LightShadow.camera` jest typowane jako bazowa `Camera` — near/far ma
      // dopiero kamera perspektywiczna/ortograficzna, którą tam faktycznie jest.
      const cam = shadow.camera as THREE.PerspectiveCamera;
      cam.near = near;
      cam.far = far;
      cam.updateProjectionMatrix();
    }
    return light;
  }
}

// ── Kamery ───────────────────────────────────────────────────────────────────

/** Fabryki i ustawienia kamer. */
export class T3Camera {
  /**
   * Kamera perspektywiczna — obiekty dalsze wydają się mniejsze.
   *
   * @param options `fov` (kąt widzenia w stopniach), `aspect` (proporcje),
   *   `near`/`far` (zakres widoczności), `position`, `lookAt`.
   * @returns Nowa `PerspectiveCamera` skierowana na wskazany punkt.
   */
  static perspective(
    options: { fov?: number; aspect?: number; near?: number; far?: number; position?: Vec3Like; lookAt?: Vec3Like } = {},
  ): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(
      options.fov ?? 60,
      options.aspect ?? 1,
      options.near ?? 0.1,
      options.far ?? 1000,
    );
    T3Object.setPosition(camera, options.position ?? [3, 3, 5]);
    camera.lookAt(T3Math.vec3(options.lookAt ?? [0, 0, 0]));
    return camera;
  }

  /** Kamera bez perspektywy — rzuty techniczne, plany, widoki 2D. */
  static orthographic(
    options: { size?: number; aspect?: number; near?: number; far?: number; position?: Vec3Like } = {},
  ): THREE.OrthographicCamera {
    const size = options.size ?? 5;
    const aspect = options.aspect ?? 1;
    const camera = new THREE.OrthographicCamera(
      -size * aspect, size * aspect, size, -size,
      options.near ?? 0.1, options.far ?? 1000,
    );
    T3Object.setPosition(camera, options.position ?? [0, 0, 10]);
    camera.lookAt(0, 0, 0);
    return camera;
  }

  /**
   * Dopasowanie do rozmiaru widoku. Trzeba wołać po każdej zmianie rozmiaru
   * płótna — inaczej obraz jest rozciągnięty.
   */
  /**
   * Dopasowuje proporcje kamery do rozmiaru widoku.
   *
   * @param camera Kamera perspektywiczna albo ortograficzna.
   * @param width Szerokość widoku w pikselach.
   * @param height Wysokość widoku w pikselach.
   * @returns Ta sama kamera.
   * @remarks Trzeba wołać po każdej zmianie rozmiaru płótna — inaczej obraz
   *   jest rozciągnięty.
   */
  static setAspect(camera: THREE.Camera, width: number, height: number): THREE.Camera {
    const aspect = height === 0 ? 1 : width / height;
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    } else if (camera instanceof THREE.OrthographicCamera) {
      const size = (camera.top - camera.bottom) / 2;
      camera.left = -size * aspect;
      camera.right = size * aspect;
      camera.updateProjectionMatrix();
    }
    return camera;
  }

  /**
   * Odsuwa kamerę tak, by cały obiekt zmieścił się w kadrze.
   *
   * @param camera Kamera perspektywiczna do ustawienia.
   * @param object Obiekt, który ma być widoczny w całości.
   * @param margin Zapas wokół obiektu (1 = ciasno, 1.3 = domyślnie).
   * @returns Ta sama kamera, skierowana na środek obiektu.
   */
  static frameObject(camera: THREE.PerspectiveCamera, object: THREE.Object3D, margin = 1.3): THREE.PerspectiveCamera {
    const box = T3Object.boundingBox(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) / 2 || 1;
    // Odległość z połowy kąta widzenia: r / tan(fov/2) daje wpisanie obiektu w kadr.
    const distance = (radius / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * margin;
    const direction = camera.position.clone().sub(center).normalize();
    if (direction.lengthSq() === 0) direction.set(1, 1, 1).normalize();
    camera.position.copy(center.clone().add(direction.multiplyScalar(distance)));
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    return camera;
  }
}

// ── Scena ────────────────────────────────────────────────────────────────────

/** Scena wraz z tłem, mgłą i środowiskiem. */
export class T3Scene {
  /**
   * Tworzy scenę.
   *
   * @param options `background` (kolor, tekstura albo `null`) i `fog`
   *   (kolor oraz zakres mgły liniowej).
   * @returns Nowa scena.
   */
  static create(
    options: { background?: ColorLike | THREE.Texture | null; fog?: { color?: ColorLike; near?: number; far?: number } } = {},
  ): THREE.Scene {
    const scene = new THREE.Scene();
    if (options.background !== undefined) T3Scene.setBackground(scene, options.background);
    if (options.fog) T3Scene.setFog(scene, options.fog.color ?? 0x000000, options.fog.near, options.fog.far);
    return scene;
  }

  static add(scene: THREE.Scene, ...objects: THREE.Object3D[]): THREE.Scene {
    for (const object of objects) scene.add(object);
    return scene;
  }

  static remove(scene: THREE.Scene, ...objects: THREE.Object3D[]): THREE.Scene {
    for (const object of objects) scene.remove(object);
    return scene;
  }

  static setBackground(scene: THREE.Scene, background: ColorLike | THREE.Texture | null): THREE.Scene {
    scene.background = background === null || background instanceof THREE.Texture
      ? background
      : T3Math.color(background);
    return scene;
  }

  /**
   * Mgła liniowa — obiekty dalsze niż `far` zlewają się z jej barwą.
   *
   * @param scene Scena.
   * @param color Barwa mgły (zwykle taka jak tło).
   * @param near Odległość, od której mgła zaczyna działać.
   * @param far Odległość pełnego zamglenia.
   * @returns Ta sama scena.
   */
  static setFog(scene: THREE.Scene, color: ColorLike, near = 1, far = 100): THREE.Scene {
    scene.fog = new THREE.Fog(T3Math.color(color), near, far);
    return scene;
  }

  /** Mgła wykładnicza — gęstnieje z odległością, naturalniejsza dla plenerów. */
  static setFogExp(scene: THREE.Scene, color: ColorLike, density = 0.02): THREE.Scene {
    scene.fog = new THREE.FogExp2(T3Math.color(color), density);
    return scene;
  }

  /** Mapa środowiskowa — odbicia w materiałach PBR. */
  static setEnvironment(scene: THREE.Scene, texture: THREE.Texture | null): THREE.Scene {
    scene.environment = texture;
    return scene;
  }

  /**
   * Usuwa wszystkie obiekty. `dispose` zwalnia też pamięć GPU — bez tego
   * wielokrotne przeładowanie scen wycieka.
   */
  /**
   * Usuwa wszystkie obiekty ze scen.
   *
   * @param scene Scena do opróżnienia.
   * @param dispose `true` (domyślnie) zwalnia też pamięć GPU; `false` gdy
   *   obiekty mają być użyte dalej.
   * @returns Ta sama scena.
   */
  static clear(scene: THREE.Scene, dispose = true): THREE.Scene {
    for (const child of [...scene.children]) {
      if (dispose) T3Object.dispose(child);
      scene.remove(child);
    }
    return scene;
  }

  /** Liczba obiektów w całym drzewie — szybka miara złożoności scenki. */
  static count(scene: THREE.Scene): number {
    let n = 0;
    scene.traverse(() => { n++; });
    return n - 1;   // bez samej sceny
  }
}

// ── Renderer i pętla ─────────────────────────────────────────────────────────

/** Renderer WebGL oraz pętla animacji. */
export class T3Renderer {
  /**
   * Tworzy renderer WebGL.
   *
   * @param canvas Istniejące płótno; brak = renderer utworzy własne.
   * @param options `antialias`, `alpha` (przezroczyste tło), `shadows`,
   *   `pixelRatio`, `clearColor`.
   * @returns Nowy `WebGLRenderer`.
   * @remarks `pixelRatio` jest ograniczany do 2 — na telefonach z ratio 3–4
   *   koszt rośnie kwadratowo, a różnicy w ostrości praktycznie nie widać.
   */
  static create(
    canvas?: HTMLCanvasElement,
    options: { antialias?: boolean; alpha?: boolean; shadows?: boolean; pixelRatio?: number; clearColor?: ColorLike } = {},
  ): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: options.antialias ?? true,
      alpha: options.alpha ?? false,
    });
    // Ograniczenie do 2 — na telefonach z ratio 3–4 koszt rośnie kwadratowo,
    // a różnicy w ostrości praktycznie nie widać.
    renderer.setPixelRatio(Math.min(options.pixelRatio ?? window.devicePixelRatio ?? 1, 2));
    if (options.shadows) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    if (options.clearColor !== undefined) renderer.setClearColor(T3Math.color(options.clearColor));
    return renderer;
  }

  static setSize(renderer: THREE.WebGLRenderer, width: number, height: number): THREE.WebGLRenderer {
    renderer.setSize(width, height, false);
    return renderer;
  }

  /**
   * Dopasowuje rozmiar renderowania do elementu (i kamerę, gdy podana).
   *
   * @param renderer Renderer.
   * @param element Element, którego rozmiar ma być wzorcem.
   * @param camera Kamera do przeliczenia proporcji.
   * @returns Ten sam renderer.
   */
  static fitTo(renderer: THREE.WebGLRenderer, element: HTMLElement, camera?: THREE.Camera): THREE.WebGLRenderer {
    const width = element.clientWidth || 1;
    const height = element.clientHeight || 1;
    renderer.setSize(width, height, false);
    if (camera) T3Camera.setAspect(camera, width, height);
    return renderer;
  }

  static render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    renderer.render(scene, camera);
  }

  /**
   * Pętla animacji. Zwraca funkcję zatrzymującą — trzeba ją wywołać przy
   * zamykaniu widoku, inaczej pętla działa dalej i trzyma referencje do sceny.
   *
   * `onFrame` dostaje czas od poprzedniej klatki (sekundy), co pozwala pisać
   * ruch niezależny od liczby klatek na sekundę.
   */
  /**
   * Uruchamia pętlę animacji.
   *
   * @param renderer Renderer.
   * @param scene Scena do rysowania.
   * @param camera Kamera.
   * @param onFrame Wywoływane przed każdą klatką; dostaje czas od poprzedniej
   *   klatki i czas od startu (w sekundach), co pozwala pisać ruch niezależny
   *   od liczby klatek na sekundę.
   * @returns Funkcja zatrzymująca pętlę — trzeba ją wywołać przy zamykaniu
   *   widoku, inaczej pętla działa dalej i trzyma referencje do scen.
   * @example
   * const stop = T3Renderer.animate(renderer, scene, camera, (dt) => T3Object.rotate(cube, 0, 90 * dt, 0));
   * // …później: stop();
   */
  static animate(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    onFrame?: (delta: number, elapsed: number) => void,
  ): () => void {
    const clock = new THREE.Clock();
    let running = true;
    const loop = () => {
      if (!running) return;
      const delta = clock.getDelta();
      onFrame?.(delta, clock.getElapsedTime());
      renderer.render(scene, camera);
      renderer.setAnimationLoop(loop);
    };
    renderer.setAnimationLoop(loop);
    return () => {
      running = false;
      renderer.setAnimationLoop(null);
    };
  }

  /**
   * Zrzut ekranu scen jako data URL.
   *
   * @param renderer Renderer.
   * @param scene Scena.
   * @param camera Kamera.
   * @returns Obraz PNG w postaci `data:` URL.
   */
  static screenshot(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): string {
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  }

  static dispose(renderer: THREE.WebGLRenderer): void {
    renderer.setAnimationLoop(null);
    renderer.dispose();
  }
}

// ── Wczytywanie modeli ───────────────────────────────────────────────────────

/**
 * Loadery formatów 3D. Wszystkie są asynchroniczne i importowane leniwie —
 * dodatki Three (`three/examples/jsm/…`) ważą po kilkadziesiąt kilobajtów, więc
 * nie chcemy ich w bundlu, gdy skrypt niczego nie wczytuje.
 */
export class T3Loader {
  /**
   * Wczytuje model glTF/GLB.
   *
   * @param url Adres pliku `.gltf` albo `.glb`.
   * @returns Obiekt z gotową sceną modelu i listą klipów animacji.
   * @throws Gdy pliku nie da się wczytać (brak, błąd sieci, uszkodzony format).
   * @remarks Format zalecany dla scen z materiałami i animacjami.
   */
  static async gltf(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(
        url,
        (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations }),
        undefined,
        () => reject(new Error(`Nie udało się wczytać modelu glTF: ${url}`)),
      );
    });
  }

  static async obj(url: string): Promise<THREE.Group> {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
    return new Promise((resolve, reject) => {
      new OBJLoader().load(url, resolve, undefined, () => reject(new Error(`Nie udało się wczytać modelu OBJ: ${url}`)));
    });
  }

  /**
   * Wczytuje model STL (druk 3D).
   *
   * @param url Adres pliku `.stl`.
   * @returns Geometria — bez materiału, bo STL go nie przenosi.
   * @throws Gdy pliku nie da się wczytać.
   */
  static async stl(url: string): Promise<THREE.BufferGeometry> {
    const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
    return new Promise((resolve, reject) => {
      new STLLoader().load(url, resolve, undefined, () => reject(new Error(`Nie udało się wczytać modelu STL: ${url}`)));
    });
  }

  static async fbx(url: string): Promise<THREE.Group> {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    return new Promise((resolve, reject) => {
      new FBXLoader().load(url, resolve, undefined, () => reject(new Error(`Nie udało się wczytać modelu FBX: ${url}`)));
    });
  }

  /**
   * Parsuje model glTF/GLB trzymany w pamięci — np. wczytany z VFS.
   *
   * @param data Zawartość pliku: `ArrayBuffer` (GLB) albo tekst JSON (glTF).
   * @param resourcePath Katalog bazowy dla zasobów zewnętrznych (tekstur).
   * @returns Scena modelu i lista klipów animacji.
   * @throws Gdy danych nie da się sparsować.
   */
  static async gltfFromData(data: ArrayBuffer | string, resourcePath = ''): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    return new Promise((resolve, reject) => {
      new GLTFLoader().parse(
        data,
        resourcePath,
        (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations }),
        () => reject(new Error('Nie udało się sparsować danych glTF')),
      );
    });
  }
}

// ── Trafienia wskaźnikiem ────────────────────────────────────────────────────

/** Raycasting — wskazywanie obiektów kursorem lub palcem. */
export class T3Raycast {
  /**
   * Trafienia promienia puszczonego z kamery przez punkt na ekranie.
   * `x`/`y` to piksele względem elementu; przeliczenie na współrzędne
   * znormalizowane (-1…1) robimy tutaj, bo to najczęstsze źródło pomyłek.
   */
  /**
   * Raycaster liczy trafienia z macierzy ŚWIATA, a te są przeliczane dopiero
   * przy renderze. Obiekt utworzony i ustawiony w tej samej klatce miałby więc
   * nieaktualną macierz i „trafiał" ze starej pozycji — dlatego odświeżamy je
   * przed każdym testem. To najczęstsza pułapka raycastingu w Three.
   */
  private static syncMatrices(objects: THREE.Object3D[]): void {
    for (const object of objects) {
      const root = object.parent ?? object;
      root.updateMatrixWorld(true);
    }
  }

  /**
   * Trafienia promienia puszczonego z kamery przez punkt na ekranie.
   *
   * @param camera Kamera, z której wychodzi promień.
   * @param element Element widoku — potrzebny do przeliczenia współrzędnych.
   * @param x Współrzędna X w pikselach (jak `event.clientX`).
   * @param y Współrzędna Y w pikselach.
   * @param objects Obiekty do sprawdzenia.
   * @param recursive `true` (domyślnie) = sprawdzaj też potomków.
   * @returns Trafienia posortowane od najbliższego.
   */
  static fromScreen(
    camera: THREE.Camera,
    element: HTMLElement,
    x: number,
    y: number,
    objects: THREE.Object3D[],
    recursive = true,
  ): THREE.Intersection[] {
    const rect = element.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((x - rect.left) / (rect.width || 1)) * 2 - 1,
      -(((y - rect.top) / (rect.height || 1)) * 2 - 1),
    );
    T3Raycast.syncMatrices(objects);
    camera.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(objects, recursive);
  }

  /** Trafienia ze zdarzenia wskaźnika — skrót na najczęstsze użycie. */
  static fromPointerEvent(
    camera: THREE.Camera,
    element: HTMLElement,
    event: { clientX: number; clientY: number },
    objects: THREE.Object3D[],
  ): THREE.Intersection[] {
    return T3Raycast.fromScreen(camera, element, event.clientX, event.clientY, objects);
  }

  /**
   * Najbliższy trafiony obiekt.
   *
   * @param intersections Wynik jednej z metod raycastingu.
   * @returns Obiekt albo `null`, gdy nic nie trafiono.
   */
  static first(intersections: THREE.Intersection[]): THREE.Object3D | null {
    return intersections[0]?.object ?? null;
  }

  /**
   * Promień z dowolnego punktu w zadanym kierunku.
   *
   * @param origin Początek promienia.
   * @param direction Kierunek (normalizowany automatycznie).
   * @param objects Obiekty do sprawdzenia.
   * @param far Maksymalny zasięg.
   * @returns Trafienia posortowane od najbliższego.
   * @example
   * // Czy pod obiektem jest podłoga?
   * T3Raycast.ray(T3Object.worldPosition(box), [0, -1, 0], [floor], 2);
   */
  static ray(origin: Vec3Like, direction: Vec3Like, objects: THREE.Object3D[], far = Infinity): THREE.Intersection[] {
    T3Raycast.syncMatrices(objects);
    const raycaster = new THREE.Raycaster(T3Math.vec3(origin), T3Math.vec3(direction).normalize(), 0, far);
    return raycaster.intersectObjects(objects, true);
  }
}

// ── Animacje ─────────────────────────────────────────────────────────────────

/** Zegar i odtwarzanie animacji z modeli. */
export class T3Animate {
  static clock(): THREE.Clock { return new THREE.Clock(); }

  /** Mikser dla obiektu — wymagany do odtwarzania klipów z glTF/FBX. */
  static mixer(root: THREE.Object3D): THREE.AnimationMixer { return new THREE.AnimationMixer(root); }

  /**
   * Odtwarza klip animacji.
   *
   * @param mixer Mikser utworzony przez `T3Animate.mixer`.
   * @param clip Klip (np. z `T3Loader.gltf`).
   * @param options `loop` (`false` = raz, zatrzymanie na ostatniej klatce),
   *   `speed` (mnożnik tempa).
   * @returns Akcja animacji — pozwala ją później wstrzymać lub zmienić tempo.
   */
  static play(mixer: THREE.AnimationMixer, clip: THREE.AnimationClip, options: { loop?: boolean; speed?: number } = {}): THREE.AnimationAction {
    const action = mixer.clipAction(clip);
    action.setLoop(options.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = options.loop === false;
    action.timeScale = options.speed ?? 1;
    action.reset().play();
    return action;
  }

  static stop(mixer: THREE.AnimationMixer): THREE.AnimationMixer {
    mixer.stopAllAction();
    return mixer;
  }

  /** Postęp animacji — wołane w każdej klatce z czasem delta (sekundy). */
  static update(mixer: THREE.AnimationMixer, delta: number): void { mixer.update(delta); }

  /** Klip po nazwie z listy wczytanej razem z modelem. */
  static findClip(clips: THREE.AnimationClip[], name: string): THREE.AnimationClip | undefined {
    return THREE.AnimationClip.findByName(clips, name) ?? undefined;
  }
}

// ── Krzywe i kształty 2D ─────────────────────────────────────────────────────

/** Krzywe (ścieżki ruchu, kable) i kształty do wyciągania. */
export class T3Curve {
  /** Krzywa gładka przez podane punkty — najprostsza droga do ładnej ścieżki. */
  static catmullRom(points: Vec3Like[], closed = false): THREE.CatmullRomCurve3 {
    return new THREE.CatmullRomCurve3(points.map((p) => T3Math.vec3(p)), closed);
  }

  static line(from: Vec3Like, to: Vec3Like): THREE.LineCurve3 {
    return new THREE.LineCurve3(T3Math.vec3(from), T3Math.vec3(to));
  }

  static quadraticBezier(start: Vec3Like, control: Vec3Like, end: Vec3Like): THREE.QuadraticBezierCurve3 {
    return new THREE.QuadraticBezierCurve3(T3Math.vec3(start), T3Math.vec3(control), T3Math.vec3(end));
  }

  static cubicBezier(start: Vec3Like, c1: Vec3Like, c2: Vec3Like, end: Vec3Like): THREE.CubicBezierCurve3 {
    return new THREE.CubicBezierCurve3(T3Math.vec3(start), T3Math.vec3(c1), T3Math.vec3(c2), T3Math.vec3(end));
  }

  /**
   * Punkt na krzywej.
   *
   * @param curve Krzywa.
   * @param t Położenie wzdłuż krzywej (0 = początek, 1 = koniec); wartości poza
   *   zakresem są przycinane.
   * @returns Punkt w przestrzeni.
   */
  static pointAt(curve: THREE.Curve<THREE.Vector3>, t: number): THREE.Vector3 {
    return curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1));
  }

  /**
   * Kierunek krzywej w danym punkcie.
   *
   * @param curve Krzywa.
   * @param t Położenie wzdłuż krzywej (0…1).
   * @returns Wektor styczny — do obracania obiektu zgodnie z kierunkiem jazdy.
   */
  static tangentAt(curve: THREE.Curve<THREE.Vector3>, t: number): THREE.Vector3 {
    return curve.getTangentAt(THREE.MathUtils.clamp(t, 0, 1));
  }

  static toPoints(curve: THREE.Curve<THREE.Vector3>, divisions = 64): THREE.Vector3[] {
    return curve.getPoints(divisions);
  }

  /** Prostokąt jako kształt 2D — podstawa pod `T3Geometry.extrude`. */
  static rectShape(width = 1, height = 1): THREE.Shape {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, -height / 2);
    shape.lineTo(width / 2, -height / 2);
    shape.lineTo(width / 2, height / 2);
    shape.lineTo(-width / 2, height / 2);
    shape.closePath();
    return shape;
  }

  /** Kształt z listy punktów 2D (obwód). */
  static shapeFromPoints(points: Vec2Like[]): THREE.Shape {
    return new THREE.Shape(points.map((p) => T3Math.vec2(p)));
  }
}

// ── Helpery diagnostyczne ────────────────────────────────────────────────────

/** Obiekty pomocnicze — osie, siatka, obrysy. Widoczne, ale nie do renderu finalnego. */
export class T3Helper {
  static axes(size = 1): THREE.AxesHelper { return new THREE.AxesHelper(size); }

  static grid(size = 10, divisions = 10, color1: ColorLike = 0x444444, color2: ColorLike = 0x222222): THREE.GridHelper {
    return new THREE.GridHelper(size, divisions, T3Math.color(color1), T3Math.color(color2));
  }

  /** Obrys pudełka otaczającego obiekt — do sprawdzania rozmiarów i kolizji. */
  static boxAround(object: THREE.Object3D, color: ColorLike = 0xffff00): THREE.BoxHelper {
    return new THREE.BoxHelper(object, T3Math.color(color));
  }

  static arrow(direction: Vec3Like, origin: Vec3Like = [0, 0, 0], length = 1, color: ColorLike = 0xffff00): THREE.ArrowHelper {
    return new THREE.ArrowHelper(T3Math.vec3(direction).normalize(), T3Math.vec3(origin), length, T3Math.color(color));
  }

  /** Podgląd zasięgu światła kierunkowego (wraz z obszarem cienia). */
  static directionalLight(light: THREE.DirectionalLight): THREE.DirectionalLightHelper {
    return new THREE.DirectionalLightHelper(light);
  }

  static pointLight(light: THREE.PointLight): THREE.PointLightHelper {
    return new THREE.PointLightHelper(light);
  }

  static spotLight(light: THREE.SpotLight): THREE.SpotLightHelper {
    return new THREE.SpotLightHelper(light);
  }

  static camera(camera: THREE.Camera): THREE.CameraHelper { return new THREE.CameraHelper(camera); }

  /** Siatka krawędziowa geometrii — czytelniejsza niż `wireframe` materiału. */
  static wireframe(geometry: THREE.BufferGeometry, color: ColorLike = 0xffffff): THREE.LineSegments {
    return new THREE.LineSegments(new THREE.EdgesGeometry(geometry), T3Material.line({ color }));
  }
}
