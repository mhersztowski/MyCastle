import {
  Vec3, BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry,
  TorusGeometry, Geometry, MeshBuilder,
} from '../scene3d/index.js';

/**
 * Przykład: obiekty geometrii scene3d — parametry, obliczenia tych parametrów
 * i generowanie siatki. Czysta matematyka — bez serwera, tokenu i zależności.
 *
 * @param {(...args:any[])=>void} log
 */
export async function runScene3dExample(log = console.log) {
  log('— scene3d: geometria —');

  // 1) Box — parametry + obliczenia (objętość, pole, przekątna, AABB)
  const box = { width: 2, height: 1, depth: 3 };
  log('Box', box, '→ V =', BoxGeometry.volume(box), '| S =', BoxGeometry.surfaceArea(box),
    '| przekątna =', BoxGeometry.diagonal(box).toFixed(3));
  log('   AABB.size =', BoxGeometry.boundingBox(box).size.toArray());

  // 2) Wzory analityczne dla brył obrotowych
  log('Sphere r=2  → V =', SphereGeometry.volume({ radius: 2 }).toFixed(3),
    '| S =', SphereGeometry.surfaceArea({ radius: 2 }).toFixed(3));
  log('Cone r=1 h=3 → V =', ConeGeometry.volume({ radius: 1, height: 3 }).toFixed(3),
    '| tworząca =', ConeGeometry.slantHeight({ radius: 1, height: 3 }).toFixed(3));
  log('Cylinder (frustum) rt=1 rb=2 h=3 → V =',
    CylinderGeometry.volume({ radiusTop: 1, radiusBottom: 2, height: 3 }).toFixed(3),
    '| pobocznica =', CylinderGeometry.lateralArea({ radiusTop: 1, radiusBottom: 2, height: 3 }).toFixed(3));
  log('Torus R=3 r=1 → V =', TorusGeometry.volume({ radius: 3, tube: 1 }).toFixed(3),
    '| S =', TorusGeometry.surfaceArea({ radius: 3, tube: 1 }).toFixed(3));

  // 3) Generowanie siatki + statystyki
  const mesh = SphereGeometry.build({ radius: 1, widthSegments: 24, heightSegments: 16 });
  log('Sphere.build → ', MeshBuilder.counts(mesh),
    '| pierwszy wierzchołek =', mesh.positions.slice(0, 3).map((n) => +n.toFixed(3)));

  // 4) Fasada po typie (string) — przegląd wszystkich geometrii z domyślnymi parametrami
  log('Geometry.types():', Geometry.types().join(', '));
  for (const t of Geometry.types()) {
    const p = Geometry.defaults(t);
    const c = MeshBuilder.counts(Geometry.build(t, p));
    log(`  ${t.padEnd(9)} V=${Geometry.volume(t, p).toFixed(3).padStart(8)}  ` +
      `S=${Geometry.surfaceArea(t, p).toFixed(3).padStart(8)}  (v=${c.vertices}, t=${c.triangles})`);
  }

  // 5) Vec3 — matematyka pomocnicza
  const n = Vec3.normalize(Vec3.cross(Vec3.of(1, 0, 0), Vec3.of(0, 1, 0)));
  log('Vec3.cross(x, y) znormalizowany =', n.toArray());

  // 6) Obiekt geometrii (instancja zamiast statyk)
  const g = new ConeGeometry({ radius: 2, height: 4, radialSegments: 8 });
  log('new ConeGeometry(...).volume() =', g.volume().toFixed(3),
    '| .build() →', MeshBuilder.counts(g.build()));
}
