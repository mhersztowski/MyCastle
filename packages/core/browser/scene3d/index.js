/**
 * @mhersztowski/core — scene3d (przeglądarkowe, vanilla ES).
 *
 * Niezależne od żadnej biblioteki obiekty geometrii sceny 3D: parametry,
 * obliczenia tych parametrów (objętość, pole, tworząca, AABB…) oraz generowanie
 * siatki (pozycje/normalne/UV/indeksy). Czysty JS, bez builda — import wprost:
 *
 *   import { BoxGeometry, Geometry, Vec3 } from './scene3d/index.js';
 *
 *   BoxGeometry.volume({ width: 2, height: 1, depth: 3 });   // 6
 *   BoxGeometry.surfaceArea({ width: 2, height: 1, depth: 3 });
 *   const mesh = BoxGeometry.build({ width: 2, height: 1, depth: 3 });
 *
 *   // przez fasadę po typie:
 *   Geometry.build('sphere', { radius: 2, widthSegments: 24 });
 *   Geometry.volume('cone', { radius: 1, height: 3 });
 *
 *   // jako obiekt:
 *   const g = new SphereGeometry({ radius: 2 });
 *   g.volume(); g.build();
 *
 * Konwencja: klasy bez `export` w deklaracji, jeden `export { … }` na końcu;
 * maksimum funkcji statycznych dla wygodnych podpowiedzi w edytorach.
 */
export { Vec3 } from './Vec3.js';
export { Box3 } from './Box3.js';
export { MeshBuilder } from './MeshBuilder.js';

export { BoxGeometry } from './BoxGeometry.js';
export { PlaneGeometry } from './PlaneGeometry.js';
export { CircleGeometry } from './CircleGeometry.js';
export { CylinderGeometry } from './CylinderGeometry.js';
export { ConeGeometry } from './ConeGeometry.js';
export { SphereGeometry } from './SphereGeometry.js';
export { TorusGeometry } from './TorusGeometry.js';

export { Geometry } from './Geometry.js';
