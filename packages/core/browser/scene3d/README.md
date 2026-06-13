# scene3d — obiekty geometrii sceny 3D (vanilla ES, bez zależności)

Niezależne od jakiejkolwiek biblioteki (brak three.js itp.) obiekty geometrii:
**parametry**, **obliczenia tych parametrów** (objętość, pole, tworząca, AABB,
liczba wierzchołków/trójkątów) oraz **generowanie siatki** (pozycje / normalne /
UV / indeksy). Czysty JavaScript, bez builda — import wprost w przeglądarce.

## Konwencja

- Klasy deklarowane **bez `export`** w deklaracji; jeden `export { … }` na końcu pliku.
- **Maksimum funkcji statycznych** — edytor podpowiada od razu po `BoxGeometry.` / `Geometry.`.
- Każda geometria ma też zwykły konstruktor (obiekt z metodami delegującymi do statyk).

## Import

```js
import { BoxGeometry, SphereGeometry, Geometry, Vec3 } from './scene3d/index.js';
```

## Wspólne API geometrii

Dla `box`, `plane`, `circle`, `cylinder`, `cone`, `sphere`, `torus`:

| funkcja (statyczna)        | zwraca |
| -------------------------- | ------ |
| `defaults()`               | domyślne parametry |
| `normalize(params)`        | parametry uzupełnione domyślnymi |
| `volume(params)`           | objętość (płaszczyzna/koło → 0) |
| `surfaceArea(params)`      | pole powierzchni |
| `boundingBox(params)`      | `{ min, max, size, center }` |
| `vertexCount(params)`      | liczba wierzchołków siatki |
| `triangleCount(params)`    | liczba trójkątów siatki |
| `build(params)`            | `{ positions, normals, uvs, indices }` |

Dodatkowo specyficzne: `BoxGeometry.diagonal`, `CylinderGeometry.slantHeight` /
`lateralArea`, `ConeGeometry.slantHeight` / `lateralArea`, `CircleGeometry.area` /
`arcLength`, `SphereGeometry.circumference`, itd.

## Przykłady

```js
BoxGeometry.volume({ width: 2, height: 1, depth: 3 });        // 6
BoxGeometry.surfaceArea({ width: 2, height: 1, depth: 3 });   // 22
const mesh = BoxGeometry.build({ width: 2, height: 1, depth: 3, widthSegments: 2 });

// obiekt
const s = new SphereGeometry({ radius: 2, widthSegments: 24 });
s.volume();           // 33.51…
s.boundingBox();      // { min, max, size, center }
s.build();            // siatka

// fasada po typie (string)
Geometry.types();                                  // ['box','plane','circle','cylinder','cone','sphere','torus']
Geometry.build('cone', { radius: 1, height: 3 });  // siatka
Geometry.volume('torus', { radius: 3, tube: 1 });  // 59.21…

// matematyka
Vec3.cross(Vec3.of(1, 0, 0), Vec3.of(0, 1, 0));    // { x:0, y:0, z:1 }
```

## Wynik `build()` → `MeshData`

```ts
{
  positions: number[],  // [x,y,z, …]  (długość = wierzchołki × 3)
  normals:   number[],  // [x,y,z, …]
  uvs:       number[],  // [u,v, …]    (długość = wierzchołki × 2)
  indices:   number[],  // [a,b,c, …]  (długość = trójkąty × 3)
}
```

Bufory są gotowe do wgrania do dowolnego renderera (WebGL/Three/własny) —
moduł sam w sobie niczego nie renderuje.

## Pliki

`Vec3.js`, `Box3.js`, `MeshBuilder.js` (matematyka i akumulator siatki),
`BoxGeometry.js`, `PlaneGeometry.js`, `CircleGeometry.js`, `CylinderGeometry.js`,
`ConeGeometry.js`, `SphereGeometry.js`, `TorusGeometry.js`, `Geometry.js`
(fasada), `index.js` (barrel).
