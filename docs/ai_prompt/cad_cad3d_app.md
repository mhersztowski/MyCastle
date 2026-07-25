# CAD 3D (cad-app) — specyfikacja formatu sceny dla modelu AI

> **Cel dokumentu.** Ten plik jest _promptem referencyjnym_ dla modelu AI, który ma
> generować **projekty (sceny) parametryczne dla trybu „CAD 3D" w cad-app**. Model
> na jego podstawie tworzy plik `*.cad3d.json` (drzewo feature'ów), który użytkownik
> otworzy w cad-app przez **File → Open CAD 3D from Server…**.
>
> Źródłem prawdy jest kod: `app/cad-app/src/cad3d/types.ts`,
> `app/cad-app/src/cad3d/occ/occEvaluate.ts`, `occConvert.ts`,
> `packages/core-cad/src/entity/types.ts`, `packages/core-cad/src/project/Project.ts`.
> W razie rozbieżności obowiązuje kod.

---

## 1. Model mentalny

CAD 3D to **parametryczny modeler bryłowy** (feature-based, styl FreeCAD/SolidWorks)
oparty na **OpenCascade.js (OCC)**. Bryła powstaje przez sekwencyjne wykonanie
**listy feature'ów** (drzewa). Każdy feature albo:

- **dodaje** materiał (extrude, revolve, loft, sweep, helix) — fuzja boolean (union),
- **odejmuje** materiał (pocket, hole, groove, loft_cut, sweep_cut) — cut boolean,
- **modyfikuje** bieżącą bryłę (mirror, shell, fillet, chamfer, linear_pattern, polar_pattern),
- jest **szkicem 2D** (`sketch`) — nie tworzy bryły, tylko dostarcza profil dla innych feature'ów,
- jest **odniesieniem** (`datum_*`) — geometria pomocnicza.

Kluczowa zasada: **feature operacyjne (extrude/revolve/…) odwołują się do szkiców
przez `sketchId`.** Najpierw musi w drzewie istnieć `sketch`, potem feature, który go używa.

---

## 2. Format pliku i lokalizacja

- **Rozszerzenie:** `.cad3d.json`
- **Zawartość:** `JSON.stringify(FeatureTree, null, 2)` — czyli obiekt `{ version: 1, features: [...] }`.
- **Ścieżka na serwerze VFS (cad-backend):**
  `/users/{userId}/projects/{nazwa}.cad3d.json`
  Na dysku: `app/cad-backend/data/users/{userId}/projects/{nazwa}.cad3d.json`
  (`userId` domyślnie `default`).
- Nazwa pliku bez rozszerzenia = nazwa projektu widoczna w przeglądarce plików.
  Znaki `/\:*?"<>|` są zamieniane na `_`.

**Ważne:** cały plik to _jeden_ obiekt JSON. Szkice mają pole `projectData`, które jest
**stringiem** (zserializowanym JSON-em 2D projektu) — patrz §6. To „JSON w JSON-ie".

---

## 3. Układ współrzędnych i jednostki

- Jednostki: **milimetry** (`mm`). Kąty w polach feature'ów: **stopnie**, o ile nie
  zaznaczono inaczej. Kąty w encjach szkicu (`arc.startAngle/endAngle`): **radiany**.
- Świat 3D: prawoskrętny, oś **Z w górę** dla płaszczyzny XY.
- Szkic rysowany jest w **lokalnym 2D (x, y)** i osadzany w świecie wg wybranej
  płaszczyzny (`plane`) + `offset`:

| `plane` | Lokalne (x,y) → świat | Kierunek „normal" ekstruzji | Zastosowanie |
|---------|-----------------------|------------------------------|--------------|
| `XY`    | `(x, y, offset)`      | wzdłuż **+Z**                | domyślny, „widok z góry" |
| `XZ`    | `(x, offset, y)`      | wzdłuż osi **Y**             | „widok z przodu", pionowy |
| `YZ`    | `(offset, y, -x)`     | wzdłuż osi **X**             | „widok z boku" |
| `face`  | wg `planeMatrix`      | normalna face                | szkic na ścianie bryły (zaawansowane) |

> Dla generowania scen od zera **zalecany jest `XY`** — jest najprostszy i najbardziej
> przewidywalny. `face`/`planeMatrix` wymaga policzenia macierzy 4×4 z istniejącej
> bryły i jest podatny na błędy — unikaj, chyba że to konieczne.

---

## 4. Struktura najwyższego poziomu

```jsonc
{
  "version": 1,
  "features": [
    /* Feature[] w kolejności wykonania */
  ]
}
```

`Feature` to unia typów (pole dyskryminujące: `type`). Wspólna baza każdego feature:

```jsonc
{
  "id": "<UUID>",       // unikalny; użyj crypto.randomUUID()-podobnych stringów
  "type": "<FeatureType>",
  "name": "<etykieta w drzewie>",
  "enabled": true       // false = feature pominięty w ewaluacji
}
```

`FeatureType` ∈:
`sketch`, `extrude`, `pocket`, `hole`, `groove`, `revolve`, `mirror`, `shell`,
`loft`, `loft_cut`, `sweep`, `sweep_cut`, `helix`, `fillet`, `chamfer`,
`linear_pattern`, `polar_pattern`, `datum_point`, `datum_line`, `datum_plane`, `datum_cs`.

---

## 5. Model ewaluacji (jak drzewo staje się bryłą)

Ewaluator (`evaluateFeatureTreeOcc`) idzie po `features` **po kolei** i utrzymuje
jedną „akumulowaną" bryłę (`accumulated`):

1. `sketch` — pomijany w budowie bryły (rysowany tylko jako wireframe; służy jako profil).
2. **Additive** (`extrude`, `revolve`, `loft`, `sweep`, `helix`):
   - jeśli `accumulated` nie istnieje → staje się nią,
   - jeśli istnieje → **fuzja boolean (union)** z akumulacją.
3. **Subtractive / modifiers** (`pocket`, `hole`, `groove`, `loft_cut`, `sweep_cut`,
   `mirror`, `shell`, `fillet`, `chamfer`, `linear_pattern`, `polar_pattern`):
   - **wymagają wcześniejszej bryły** (`accumulated`). Bez niej feature jest pomijany
     (a pocket/hole zgłaszają błąd). **Nigdy nie umieszczaj pocket/hole/fillet przed
     pierwszym feature additive.**
   - `mirror` i patterny w trybie `tool_shapes` potrafią działać też bez wcześniejszej
     bryły (budują z `featureIds`).
4. Każdy feature owinięty jest w try/catch — błąd jednego nie wywala całej sceny,
   ale ten feature nic nie doda.

**Konsekwencje praktyczne dla AI:**
- Poprawna kolejność: **sketch(e) → additive → cut/modyfikatory**. Sketch użyty przez
  feature musi wystąpić w tablicy **przed** tym feature.
- Pierwszy feature tworzący bryłę musi być additive.
- Fillet/chamfer/shell działają na całej bieżącej bryle (albo na wskazanych krawędziach/ścianach).

---

## 6. Szkic (`sketch`) — profil 2D

```jsonc
{
  "id": "sk-1",
  "type": "sketch",
  "name": "Profil podstawy",
  "enabled": true,
  "plane": "XY",          // XY | XZ | YZ | face
  "offset": 0,            // przesunięcie płaszczyzny wzdłuż jej normalnej (mm)
  "planeMatrix": [...],   // TYLKO dla plane="face": 16 liczb (THREE.Matrix4, column-major)
  "faceRef": {...},       // TYLKO dla plane="face": { hintNormal:[x,y,z], hintPoint:[x,y,z] }
  "projectData": "<STRING: JSON.stringify(Project2D)>",
  "constraints": [ /* opcjonalne SketchConstraint[] — patrz §6.3 */ ]
}
```

### 6.1. `projectData` — osadzony projekt 2D

`projectData` to **string** = `JSON.stringify(...)` obiektu o kształcie
`Project.toJSON()`:

```jsonc
{
  "version": "1.0.0",
  "settings": { "name": "Sketch", "units": "mm", "gridSize": 10, "precision": 2 },
  "layers": {
    "layers": [
      { "id": "0", "name": "0", "color": "#ffffff",
        "lineType": "solid", "lineWidth": 1, "visible": true, "locked": false }
    ],
    "activeId": "0"
  },
  "entities": [ /* Entity[] — geometria 2D szkicu */ ]
}
```

Warstwa `"0"` musi istnieć (domyślna). Encje referują ją przez `layerId: "0"`.

### 6.2. Encje 2D (pole `entities`)

Każda encja ma **wspólną bazę** (wszystkie pola wymagane):

```jsonc
{
  "id": "<UUID>",
  "type": "<line|circle|arc|polyline|rect|point|...>",
  "layerId": "0",
  "color": "bylayer",       // "bylayer" lub hex "#rrggbb"
  "lineType": "bylayer",    // "bylayer" | "solid" | "dashed" | "dotted" | "dashdot"
  "lineWidth": "bylayer",   // "bylayer" | liczba
  "visible": true,
  "locked": false,
  "extrudeHeight": 0,       // 0 = płaski 2D (zawsze 0 dla profili CAD 3D)
  "boundingBox": { "minX": 0, "minY": 0, "maxX": 0, "maxY": 0 }  // policz z geometrii
}
```

Typy istotne dla profili CAD 3D (używane przez OCC do budowy wire → face):

| type | dodatkowe pola | znaczenie |
|------|----------------|-----------|
| `line` | `x1,y1,x2,y2` | odcinek |
| `circle` | `cx,cy,radius` | okrąg (zamknięty kontur) |
| `arc` | `cx,cy,radius,startAngle,endAngle` (radiany, CCW) | łuk |
| `rect` | `x,y,width,height` | prostokąt (lewy-dolny róg + wymiary); zamknięty |
| `polyline` | `points: [{x,y},…]`, `closed: bool` | łamana; `closed:true` → kontur |
| `point` | `x,y` | punkt (nie tworzy konturu; np. znacznik) |

> Encje `text`, `image`, `freehand`, `dimension`, `box3d`, `cylinder3d`, `sphere3d`
> istnieją w core-cad, ale **nie są profilami** dla CAD 3D — nie używaj ich w szkicach
> feature'owych.

**Reguły tworzenia konturu (profilu) dla extrude/revolve/loft/…:**
- Kontur musi być **zamknięty**. Zamknięte „od ręki": `circle`, `rect`, `polyline` z `closed:true`.
- Zamknięty kontur można też złożyć z **wielu** `line`/`arc`/otwartych polilinii —
  OCC łączy je w łańcuch (chaining) po współrzędnych końców. Końce muszą się stykać.
- Dla **otworu w profilu** (pierścień, np. koło z dziurą) dodaj wewnętrzny zamknięty
  kontur (np. drugi, mniejszy `circle`) — OCC potraktuje go jako wewnętrzną pętlę.
- Preferuj **jedną `polyline closed`** dla profili wielokątnych (prościej niż zbiór linii).

### 6.3. `constraints` (opcjonalne)

Pole `constraints` na szkicu to tablica `SketchConstraint`:
```jsonc
{ "id":"c1", "type":"horizontal", "refs":["<lineId>"], "value": null, "visible": true }
```
`type` ∈ `coincident | horizontal | vertical | parallel | perpendicular | tangent |
equal | symmetric | distance | horizontal_distance | vertical_distance | radius |
diameter | angle | fixed`. `refs` używa formatu `entityId` lub `entityId.punkt`
(`.p1/.p2/.center`). **Dla generowanych statycznie scen constraints można pominąć** —
geometria jest już zadana wprost współrzędnymi. Dodawaj je tylko, gdy chcesz zapisać
intencję projektową; nie są wymagane do zbudowania bryły.

---

## 7. Referencja feature'ów operacyjnych

Poniżej pełne zestawy pól (z wartościami domyślnymi z `types.ts`). Podawaj **wszystkie**
pola danego typu — ewaluator zakłada ich obecność.

### 7.1. `extrude` — wyciągnięcie profilu (additive)

```jsonc
{
  "id":"ex-1", "type":"extrude", "name":"Pad", "enabled":true,
  "sketchId":"sk-1",       // szkic z zamkniętym profilem
  "entityIds":[],          // [] = użyj WSZYSTKICH encji szkicu; inaczej wybrane id
  "extrudeType":"dimension", // "dimension" | "symmetric" | "through_all"
  "height":50,             // mm (dla extrudeType="dimension"/"symmetric")
  "symmetric":false,       // rozciąga na obie strony płaszczyzny
  "reversed":false,        // odwróć kierunek
  "direction":"normal",    // "normal" | "X" | "Y" | "Z"
  "taper":0                // kąt pochylenia ścian (deg); 0 = proste
}
```

### 7.2. `revolve` — obrót profilu wokół osi (additive)

```jsonc
{
  "id":"rev-1", "type":"revolve", "name":"Revolve", "enabled":true,
  "sketchId":"sk-1", "entityIds":[],
  "revolveType":"dimension",     // "dimension" | "symmetric" | "through_all"
  "axis":"sketch_vertical",      // "sketch_vertical"(=Y) | "sketch_horizontal"(=X) | "X" | "Y" | "Z"
  "angle":360,                   // stopnie
  "symmetric":false, "reversed":false, "segments":64,
  "revolveTypeExt":"angle",      // "angle" | "to_last" | "to_first" | "up_to_face" | "two_angles"
  "axisExt":"Y",                 // "X"|"Y"|"Z"|"datum_reference"|"sketch_vertical"|"sketch_horizontal"
  "angle2":0,                    // drugi kąt (dla "two_angles")
  "autoRefresh":true
}
```

> **KRYTYCZNE (revolve):** oś obrotu **nie może przecinać profilu**. Cały profil musi
> leżeć po jednej stronie osi. Dla `axis:"sketch_vertical"` (oś Y, linia x=0) wszystkie
> `x` profilu muszą mieć ten sam znak (np. wszystkie `x > 0`). W przeciwnym razie
> OCC zgłasza błąd „oś przecina profil". Odległość profilu od osi = promień wewnętrzny
> powstałej bryły (np. otwór na wał).

### 7.3. `pocket` — kieszeń/wybranie (subtractive)

```jsonc
{
  "id":"po-1", "type":"pocket", "name":"Pocket", "enabled":true,
  "sketchId":"sk-2", "entityIds":[],
  "extrudeType":"dimension", "height":50,
  "symmetric":true,   // domyślnie true — pocket idzie w obie strony płaszczyzny (pewniej trafia w bryłę)
  "reversed":false, "direction":"normal", "taper":0
}
```
Wymaga wcześniejszej bryły. Szkic definiuje kontur cięcia; `height` to głębokość.

### 7.4. `hole` — otwór wiercony (subtractive)

```jsonc
{
  "id":"ho-1", "type":"hole", "name":"Hole", "enabled":true,
  "sketchId":"sk-holes",   // szkic zawierający OKRĘGI = pozycje otworów
  "diameter":6,            // wspólna średnica wszystkich otworów z tego szkicu
  "depthType":"dimension", // "dimension" | "through_all"
  "depth":25, "reversed":false,
  "tapered":false, "taperAngle":90,
  "drillPoint":"angled",   // "flat" | "angled" (stożkowe dno)
  "drillPointAngle":118,
  "counterType":"none",    // "none" | "countersink" | "counterbore"
  "counterDiameter":10, "counterDepth":3, "counterAngle":90
}
```
> `hole` bierze **środki okręgów** ze szkicu jako pozycje otworów (promień okręgów jest
> ignorowany — obowiązuje `diameter`). Aby zrobić kilka otworów, wstaw kilka okręgów.
> Kierunek wiercenia: dla szkicu na płaszczyźnie preset (XY/XZ/YZ) wierci „w bryłę"
> (+normal); `reversed` odwraca.

### 7.5. `groove` — rowek obrotowy (subtractive)

Jak `revolve`, ale odejmuje materiał. Pola identyczne jak `revolve` (bez `*Ext` — proste):
```jsonc
{
  "id":"gr-1","type":"groove","name":"Groove","enabled":true,
  "sketchId":"sk-3","entityIds":[],
  "revolveType":"dimension","axis":"sketch_vertical","angle":360,
  "symmetric":false,"reversed":false,"segments":32
}
```

### 7.6. `mirror` — lustrzane odbicie (modifier)

```jsonc
{
  "id":"mi-1","type":"mirror","name":"Mirror","enabled":true,
  "plane":"YZ",                 // legacy preset: "XY"|"XZ"|"YZ"
  "planeMode":"YZ",             // "XY"|"XZ"|"YZ"|"datum_plane"
  "datumPlaneId":null,          // gdy planeMode="datum_plane"
  "mode":"content",             // "content"=odbij całą bryłę i scal | "tool_shapes"=odbij wybrane featury
  "featureIds":[],              // dla mode="tool_shapes"
  "autoRefresh":true
}
```

### 7.7. `shell` — wydrążenie / ścianka (modifier)

```jsonc
{
  "id":"sh-1","type":"shell","name":"Shell","enabled":true,
  "thickness":5,
  "facesToRemove":[],   // FaceRef[] — ściany otwarte (usunięte). Puste = zamknięta wydrążona bryła
  "mode":"skin",        // "skin" | "pipe" | "recto_verso"
  "joinType":"arc",     // "arc" | "intersection"
  "intersection":false,
  "inwards":true,       // true = drąży do wewnątrz (ubytek), false = pogrubia na zewnątrz
  "autoRefresh":true
}
```
`FaceRef = { hintNormal:[x,y,z], hintPoint:[x,y,z] }` — wskazuje ścianę przez jej
world-normal i centroid. Trudne do zgadnięcia „na sucho"; dla prostych scen zostaw
`facesToRemove:[]`.

### 7.8. `fillet` / `chamfer` — zaokrąglenie / fazowanie krawędzi (modifier)

```jsonc
{ "id":"fi-1","type":"fillet","name":"Fillet","enabled":true,
  "radius":2, "useAllEdges":true, "edges":[], "autoRefresh":true }

{ "id":"ch-1","type":"chamfer","name":"Chamfer","enabled":true,
  "size":1, "size2":1, "chamferType":"equal", // "equal" | "two_distances"
  "useAllEdges":true, "edges":[], "autoRefresh":true }
```
> `useAllEdges:true` zaokrągla/fazuje **wszystkie** krawędzie bryły — najprostsze i
> deterministyczne. Selekcja pojedynczych krawędzi wymaga `edges: FaceRef[]` (hint =
> midpoint + kierunek krawędzi) i jest trudna do wygenerowania bez interakcji — używaj
> `useAllEdges:true`, chyba że użytkownik prosi inaczej.

### 7.9. `loft` / `loft_cut` — przejście między przekrojami

```jsonc
{ "id":"lo-1","type":"loft","name":"Loft","enabled":true,
  "sections":[ { "sketchId":"sk-a" }, { "sketchId":"sk-b" } ],
  "ruled":false, "closed":false }
```
Wymaga ≥2 szkiców-przekrojów (na różnych `offset`/płaszczyznach). `loft_cut` = ubytek.

### 7.10. `sweep` / `sweep_cut` — przeciągnięcie profilu po ścieżce

```jsonc
{ "id":"sw-1","type":"sweep","name":"Sweep","enabled":true,
  "profileSketchId":"sk-profile",  // zamknięty przekrój
  "pathSketchId":"sk-path",        // ścieżka (otwarta: line/arc/polyline)
  "cornerStyle":"transformed",     // "transformed"|"round"|"right_angle"
  "orientationMode":"standard",    // "standard"|"fixed"|"frenet"
  "transformMode":"constant" }     // "constant"|"inscribed"
```

### 7.11. `helix` — spirala (additive, np. gwint/sprężyna)

```jsonc
{ "id":"he-1","type":"helix","name":"Helix","enabled":true,
  "profileSketchId":"sk-profile",
  "axis":"Y",              // "sketch_vertical"|"sketch_horizontal"|"X"|"Y"|"Z"
  "mode":"pitch_height",   // "pitch_height"|"pitch_turns"|"turns_height"
  "pitch":10, "height":50, "turns":5, "radius":20,
  "taper":0, "leftHanded":false, "reversed":false }
```

### 7.12. Patterny — `linear_pattern` / `polar_pattern` (modifier)

```jsonc
{ "id":"lp-1","type":"linear_pattern","name":"LinearPattern","enabled":true,
  "mode":"tool_shapes",           // "content"|"tool_shapes"
  "featureIds":["ho-1"],          // które featury powielić (tool_shapes)
  "direction":"sketch_horizontal","reversed":false,
  "length":100,"occurrences":4,
  "direction2Enabled":false,"direction2":"sketch_vertical","length2":100,"occurrences2":2,
  "autoRefresh":true }

{ "id":"pp-1","type":"polar_pattern","name":"PolarPattern","enabled":true,
  "mode":"tool_shapes","featureIds":["ho-1"],
  "axis":"sketch_normal","reversed":false,
  "angle":360,"occurrences":6,"autoRefresh":true }
```

### 7.13. `datum_*` — geometria odniesienia (nie tworzy bryły)

```jsonc
{ "type":"datum_point",  "position":[0,0,0] }
{ "type":"datum_line",   "position":[0,0,0], "direction":[1,0,0], "length":100 }
{ "type":"datum_plane",  "position":[0,0,0], "normal":[0,0,1], "size":100 }
{ "type":"datum_cs",     "position":[0,0,0], "rotation":[0,0,0], "size":60 }  // rotation = Euler XYZ (deg)
```
(Każdy z wspólną bazą `id/type/name/enabled`.)

---

## 8. Wzorce (recipes)

- **Płyta z otworami:** `sketch(rect na XY)` → `extrude(height)` → `sketch(okręgi na XY
  w miejscach otworów)` → `hole(diameter, through_all)`. (Ewentualnie powiel patternem.)
- **Bryła obrotowa (tuleja, koło, wałek):** `sketch(profil przekroju po jednej stronie
  osi)` → `revolve(360°, axis:sketch_vertical)`.
- **Skrzynka wydrążona (obudowa):** `sketch(rect)` → `extrude` → `shell(thickness,
  facesToRemove: [góra])`. (Bez selekcji ściany → zamknięte pudełko z pustką w środku.)
- **Zaokrąglone narożniki:** dowolna bryła → `fillet(useAllEdges:true, radius)`.
- **Kołnierz z okręgiem śrub:** bryła → `sketch(1 okrąg w promieniu podziałowym)` →
  `hole` → `polar_pattern(featureIds:[hole], occurrences:N, angle:360)`.
- **Rura zgięta:** `sketch(profil kołowy)` + `sketch(ścieżka: linie/łuki)` → `sweep`.

---

## 9. Kompletny przykład — koło pasowe (V-belt pulley)

Profil przekroju (zamknięta polilinia, wszystkie `x>0` → revolve wokół osi Y daje bryłę
z centralnym otworem i rowkiem klinowym):

```jsonc
{
  "version": 1,
  "features": [
    {
      "id": "sk-pulley",
      "type": "sketch",
      "name": "Profil koła pasowego",
      "enabled": true,
      "plane": "XY",
      "offset": 0,
      "projectData": "{\"version\":\"1.0.0\",\"settings\":{\"name\":\"Profil koła pasowego\",\"units\":\"mm\",\"gridSize\":10,\"precision\":2},\"layers\":{\"layers\":[{\"id\":\"0\",\"name\":\"0\",\"color\":\"#ffffff\",\"lineType\":\"solid\",\"lineWidth\":1,\"visible\":true,\"locked\":false}],\"activeId\":\"0\"},\"entities\":[{\"id\":\"prof-1\",\"type\":\"polyline\",\"layerId\":\"0\",\"color\":\"bylayer\",\"lineType\":\"bylayer\",\"lineWidth\":\"bylayer\",\"visible\":true,\"locked\":false,\"extrudeHeight\":0,\"boundingBox\":{\"minX\":7.5,\"minY\":-9,\"maxX\":40,\"maxY\":9},\"points\":[{\"x\":7.5,\"y\":-9},{\"x\":40,\"y\":-9},{\"x\":40,\"y\":-4},{\"x\":30,\"y\":0},{\"x\":40,\"y\":4},{\"x\":40,\"y\":9},{\"x\":7.5,\"y\":9}],\"closed\":true}]}"
    },
    {
      "id": "rev-pulley",
      "type": "revolve",
      "name": "Koło pasowe",
      "enabled": true,
      "sketchId": "sk-pulley",
      "entityIds": [],
      "revolveType": "dimension",
      "axis": "sketch_vertical",
      "angle": 360,
      "symmetric": false,
      "reversed": false,
      "segments": 64,
      "revolveTypeExt": "angle",
      "axisExt": "Y",
      "autoRefresh": true
    }
  ]
}
```

Parametry profilu: otwór ⌀15 (promień 7,5), średnica zewn. ⌀80 (promień 40), szerokość
18 mm (y od −9 do +9), rowek klinowy: dno na promieniu 30 (głębokość 10), rozwarcie ±4.
Profil w całości ma `x ∈ [7,5; 40]` (po stronie x>0) → oś Y nie przecina profilu ✓.

---

## 10. Szablon minimalny (do skopiowania i wypełnienia)

Wyciągnięty prostokąt (płyta 100×60×10 mm) — start do dalszych operacji:

```jsonc
{
  "version": 1,
  "features": [
    {
      "id": "sk-base", "type": "sketch", "name": "Base", "enabled": true,
      "plane": "XY", "offset": 0,
      "projectData": "{\"version\":\"1.0.0\",\"settings\":{\"name\":\"Base\",\"units\":\"mm\",\"gridSize\":10,\"precision\":2},\"layers\":{\"layers\":[{\"id\":\"0\",\"name\":\"0\",\"color\":\"#ffffff\",\"lineType\":\"solid\",\"lineWidth\":1,\"visible\":true,\"locked\":false}],\"activeId\":\"0\"},\"entities\":[{\"id\":\"r1\",\"type\":\"rect\",\"layerId\":\"0\",\"color\":\"bylayer\",\"lineType\":\"bylayer\",\"lineWidth\":\"bylayer\",\"visible\":true,\"locked\":false,\"extrudeHeight\":0,\"boundingBox\":{\"minX\":0,\"minY\":0,\"maxX\":100,\"maxY\":60},\"x\":0,\"y\":0,\"width\":100,\"height\":60}]}"
    },
    {
      "id": "ex-base", "type": "extrude", "name": "Pad", "enabled": true,
      "sketchId": "sk-base", "entityIds": [],
      "extrudeType": "dimension", "height": 10,
      "symmetric": false, "reversed": false, "direction": "normal", "taper": 0
    }
  ]
}
```

---

## 11. Checklist walidacji (zanim oddasz plik)

1. **Poprawny JSON** — całość parsuje się `JSON.parse`; `projectData` jest _stringiem_
   (escapowane cudzysłowy), a po `JSON.parse(projectData)` też jest poprawnym JSON-em.
2. **`version: 1`** na górze; każdy feature ma `id`, `type`, `name`, `enabled`.
3. **Unikalne `id`** wszystkich feature'ów i encji.
4. **Kolejność**: każdy `sketchId`/`profileSketchId`/`pathSketchId`/`sections[].sketchId`
   wskazuje na `sketch` **wcześniej** w tablicy. Pierwszy feature bryłowy jest additive.
   `pocket`/`hole`/`fillet`/`shell`/… nie stoją przed pierwszym additive.
5. **Profil zamknięty** dla extrude/revolve/loft/sweep (circle/rect/polyline-closed lub
   stykający się łańcuch linii/łuków).
6. **Revolve/groove**: cały profil po jednej stronie osi (np. wszystkie `x>0` dla
   `sketch_vertical`).
7. **Hole**: szkic zawiera **okręgi** (środki = pozycje otworów).
8. **Encje 2D** mają komplet pól bazowych (w tym `layerId:"0"`, `extrudeHeight:0`,
   `boundingBox` policzony z geometrii). Warstwa `"0"` obecna w `layers`.
9. **Jednostki**: mm; kąty feature'ów w stopniach, kąty łuków w radianach.
10. **Nie używać** encji `text/image/dimension/box3d/…` jako profili feature'owych.

## 12. Częste błędy

| Objaw | Przyczyna | Naprawa |
|-------|-----------|---------|
| „oś Y przecina profil" | profil ma x po obu stronach 0 | przesuń profil na `x>0` |
| „szkic nie tworzy zamkniętego konturu" | polyline `closed:false` lub linie się nie stykają | zamknij kontur / dociągnij końce |
| „pocket wymaga wcześniejszej bryły" | pocket/hole przed extrude | najpierw additive |
| „sketch nie zawiera żadnych okręgów" (hole) | brak `circle` w szkicu otworów | dodaj okręgi w pozycjach |
| bryła pusta / brak render | fuzja boolean się nie powiodła albo profil zdegenerowany | uprość geometrię, sprawdź stykanie konturu |
| `projectData` nie działa | podano obiekt zamiast stringa | `projectData` MUSI być `JSON.stringify(...)` |
```
