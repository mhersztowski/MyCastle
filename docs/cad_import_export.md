# CAD App — Import / Export plików

## Przegląd

| Format | Rozszerzenie | Import | Eksport | Charakter |
|--------|--------------|--------|---------|-----------|
| JSON (projekt) | `.cad.json` | ✅ zastępuje projekt | ✅ | pełny zapis projektu |
| DXF | `.dxf` | ✅ dodaje do projektu | ✅ | 2D CAD (AutoCAD R2000) |
| SVG | `.svg` | — | ✅ | 2D wektor (web) |
| OBJ | `.obj` | — | ✅ | siatka 3D (Wavefront) |
| STL | `.stl` | — | ✅ | siatka 3D (ASCII) |
| STEP | `.step` | — | ✅ | bryła 3D B-Rep (ISO 10303) |
| glTF | `.gltf` | — | ✅ | scena 3D JSON |
| glTF Binary | `.glb` | — | ✅ | scena 3D binarna |
| Scena 3D (serwer) | `.scene.json` | ✅ z serwera | ✅ na serwer | dane Scene 3D |

---

## Import

### JSON — `Open JSON (local)…` / `Open CAD from Server…`

Ładuje pełny projekt. **Zastępuje** cały bieżący projekt (encje, warstwy, ustawienia, historia).

Akceptuje pliki `.json` i `.cad.json` w formacie eksportowanym przez tę aplikację.

---

### DXF — `Import DXF (local)…`

Parsuje plik DXF (format R2000 i nowsze). **Dodaje** wczytane encje do istniejącego projektu — nie kasuje bieżącej zawartości.

#### Obsługiwane typy encji DXF

| Typ DXF | Wynikowa encja | Uwagi |
|---------|---------------|-------|
| `LINE` | `line` | punkty start/end z group codes 10/20 i 11/21 |
| `CIRCLE` | `circle` | środek (10/20), promień (40) |
| `ARC` | `arc` | środek (10/20), promień (40), kąty (50/51) w stopniach → radiany |
| `LWPOLYLINE` | `polyline` | wierzchołki z par (10/20), closed = bit 1 grupy 70 |

#### Nieobsługiwane typy DXF (pomijane)

`POLYLINE`/`VERTEX` (stary format), `TEXT`, `MTEXT`, `SPLINE`, `ELLIPSE`, `INSERT` (referencje bloków), `HATCH`, `DIMENSION`, `LEADER` i wszystkie inne.

#### Warstwy

Nazwa warstwy (group code 8) jest dopasowywana do istniejących warstw projektu po nazwie. Jeśli warstwa o takiej nazwie nie istnieje, encja trafia na aktywną warstwę.

---

## Eksport

### JSON — `Save JSON (local)` / `Save CAD to Server…`

Zapisuje pełny projekt jako JSON. Zawiera: wszystkie encje (w tym zablokowane i niewidoczne), wszystkie warstwy, ustawienia projektu (nazwa, jednostki, siatka).

---

### SVG — `Export SVG`

Eksport 2D do formatu SVG. Używa osi Y odwróconej (CAD: Y w górę → SVG: Y w dół). Margines 20 jednostek dookoła. Tło `#1e1e1e`.

#### Obsługiwane encje

| Encja | Element SVG | Uwagi |
|-------|-------------|-------|
| `line` | `<line>` | |
| `circle` | `<circle>` | |
| `arc` | `<path d="M…A…">` | large-arc-flag wyliczany automatycznie |
| `rect` | `<rect>` | |
| `polyline` (open) | `<polyline>` | |
| `polyline` (closed) | `<polygon>` | |
| `dimension` | `<line>` × 3 + `<text>` | linie odniesienia + linia wymiarowa + wartość liczbowa |

#### Pomijane encje

`text`, `image`, `freehand`, `box3d`, `cylinder3d`, `sphere3d` — nie mają odpowiednika 2D w SVG.

---

### DXF — `Export DXF`

Format DXF R2000 (`AC1015`). Zawiera sekcję `TABLES` z definicjami warstw (kolor jako indeks ACI) oraz sekcję `ENTITIES`.

#### Mapowanie encji na typy DXF

| Encja | Typ DXF | Uwagi |
|-------|---------|-------|
| `line` | `LINE` | Z=0 |
| `circle` | `CIRCLE` | |
| `arc` | `ARC` | kąty konwertowane z radianów na stopnie |
| `rect` | `LWPOLYLINE` | 4 wierzchołki, closed (flag 70=1) |
| `polyline` | `LWPOLYLINE` | flag 70: 1=closed, 0=open |
| `dimension` | `LINE` × 3 | 2 linie odniesienia + linia wymiarowa; opis tekstowy nie jest eksportowany |
| `box3d` | `LWPOLYLINE` | rzut footprintu na XY (4 narożniki), Z ignorowane |
| `cylinder3d` | `CIRCLE` | promień podstawy, Z ignorowane |
| `sphere3d` | `CIRCLE` | promień, Z ignorowane |

#### Pomijane encje

`text`, `image`, `freehand` — nie są konwertowane do DXF.

> **Uwaga:** Obiekty 3D (`box3d`, `cylinder3d`, `sphere3d`) eksportują tylko rzut na płaszczyznę XY. Do eksportu bryły 3D użyj formatu **STEP**.

---

### OBJ — `Export OBJ`

Eksport siatki 3D przez Three.js `OBJExporter`. Obejmuje wszystkie widoczne encje we wszystkich widocznych warstwach.

Encje 2D z `extrudeHeight > 0` eksportowane są jako siatki bryłowe (ExtrudeGeometry). Encje 2D płaskie (`extrudeHeight = 0`) eksportowane jako linie/krzywe (wireframe). Prymitywy 3D (`box3d`, `cylinder3d`, `sphere3d`) eksportowane jako siatki 3D z właściwą geometrią.

Kolor encji zawarty w pliku `.obj` jako materiał.

---

### STL — `Export STL`

Eksport siatki 3D w formacie STL ASCII przez Three.js `STLExporter`. Identyczna zawartość jak OBJ — te same encje, ta sama geometria.

Nadaje się do druku 3D i importu do FreeCAD/Blender/slicer. Nie zawiera informacji o kolorach.

---

### STEP — `Export STEP`

Eksport B-Rep (boundary representation) przez OpenCascade.js (WASM). Format ISO 10303 — preferowany do wymiany między systemami CAD (FreeCAD, CATIA, SolidWorks, Fusion 360 itd.).

**Pierwsze użycie ładuje silnik WASM (~30 MB) — może trwać kilka sekund.**

#### Co jest eksportowane

| Encja | Typ OCC | Warunek |
|-------|---------|---------|
| `box3d` | bryła prostopadłościenna (`BRepPrimAPI_MakeBox`) | zawsze |
| `cylinder3d` | bryła walcowa (`BRepPrimAPI_MakeCylinder`) | zawsze |
| `sphere3d` | bryła kulista (`BRepPrimAPI_MakeSphere`) | zawsze |
| `circle` | wytłoczony walec | `extrudeHeight > 0` |
| `rect` | wytłoczony prostopadłościan | `extrudeHeight > 0` |
| `polyline` (closed) | pryzmat | `extrudeHeight > 0` |
| `circle` (płaski) | okrąg (wire OCC) | `extrudeHeight = 0` |
| `arc` (płaski) | łuk (edge OCC) | `extrudeHeight = 0` |
| `line` (płaski) | odcinek (edge OCC) | `extrudeHeight = 0` |
| `rect` (płaski) | prostokąt (wire OCC) | `extrudeHeight = 0` |
| `polyline` closed (płaski) | wielobok (wire OCC) | `extrudeHeight = 0` |

#### Encje pomijane w STEP

- `line`, `arc`, `polyline` (open) z `extrudeHeight > 0` — otwarte wire nie tworzy face, pryzmat niemożliwy
- `text`, `image`, `freehand`, `dimension` — brak reprezentacji B-Rep
- `box3d` z `width=0`, `height=0` lub `depth=0` — degenerate shape

Wszystkie widoczne kształty trafiają do jednego `TopoDS_Compound` w pliku STEP. Warstwy ani kolory nie są przenoszone do STEP.

> **Wskazówka:** Aby wyeksportować 2D kształt jako bryłę do STEP, ustaw `extrudeHeight` w panelu Properties na wartość większą od 0.

---

### glTF / glTF Binary — `Export glTF` / `Export glTF Binary`

Eksport sceny 3D przez Three.js `GLTFExporter`. Identyczna zawartość jak OBJ/STL — wszystkie widoczne encje.

- `.gltf` — format JSON z base64-encoded geometrią
- `.glb` — format binarny (kompaktowy), zalecany do importu w Blender/Unity/Unreal

Zawiera materiały z kolorami encji.

---

## Encje a formaty — tabela zbiorcza

| Encja | SVG | DXF eks. | OBJ/STL | STEP (bryła) | STEP (wire/edge) | DXF imp. |
|-------|-----|----------|---------|--------------|------------------|----------|
| `line` | ✅ | ✅ LINE | ✅ | — (open) | ✅ edge | ✅ |
| `circle` | ✅ | ✅ CIRCLE | ✅ | ✅ gdy extrude | ✅ wire | ✅ |
| `arc` | ✅ | ✅ ARC | ✅ | — (open) | ✅ edge | ✅ |
| `rect` | ✅ | ✅ LWPOLY | ✅ | ✅ gdy extrude | ✅ wire | — |
| `polyline` (closed) | ✅ | ✅ LWPOLY | ✅ | ✅ gdy extrude | ✅ wire | ✅ |
| `polyline` (open) | ✅ | ✅ LWPOLY | ✅ | — (open) | — | ✅ |
| `dimension` | ✅ (linie) | ✅ (linie) | ✅ | — | — | — |
| `text` | — | — | ✅ | — | — | — |
| `image` | — | — | — | — | — | — |
| `freehand` | — | — | ✅ | — | — | — |
| `box3d` | — | ✅ footprint | ✅ | ✅ bryła | — | — |
| `cylinder3d` | — | ✅ footprint | ✅ | ✅ bryła | — | — |
| `sphere3d` | — | ✅ footprint | ✅ | ✅ bryła | — | — |

> Kolumna **STEP (bryła)** dotyczy encji z `extrudeHeight > 0` lub prymitywów 3D.
> Kolumna **STEP (wire/edge)** dotyczy encji płaskich (`extrudeHeight = 0`).
