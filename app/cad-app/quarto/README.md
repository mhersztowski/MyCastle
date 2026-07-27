# Rysik — rozszerzenie Quarto

Podział pracy: **Rysik jest IDE, Quarto jest kompilatorem**. Edycja, inspektor,
transakcje i undo są po stronie aplikacji (zakładka *Rysik* w cad-app);
numeracja rysunków, cytowania, PDF, revealjs, książka i publikacja — po stronie
Quarto. Formatem natywnym jest `.qmd` — jeden plik, bez konwersji w żadną stronę.

## Zawartość

```
_extensions/rysik/
  _extension.yml              rejestracja filtra
  rysik.lua                   router AST: HTML → punkt montowania, reszta → zrzut
  resources/rysik.css         styl punktów montowania
  resources/rysik-runtime.js  runtime (budowany, patrz niżej)
  scripts/render-scenes.mjs   pre-render zrzutów dla PDF/DOCX
```

## Budowanie runtime'u

Runtime powstaje z **tego samego kodu scen, którego używa edytor** — dwa
renderery znaczyłyby, że dokument u autora i u czytelnika zaczynają się różnić.

```bash
pnpm --filter cad-app build:rysik-runtime
```

## Użycie w projekcie Quarto

```yaml
# _quarto.yml
project:
  type: book
  pre-render: _extensions/rysik/scripts/render-scenes.mjs
filters:
  - rysik
```

Skopiuj katalog `_extensions/rysik` do projektu (albo użyj przycisku
„Zapisz rozszerzenie Quarto” w zakładce Rysik — trafi do
`users/{user}/rysik/_extensions/rysik` w VFS).

## Blok w dokumencie

````markdown
```{.scene3d-terrain}
#| label: fig-wisla
#| fig-cap: "Model terenu Beskidu Śląskiego z cieniowaniem."
#| fig-width: 6.5
#| fig-dpi: 200

exaggeration: 2.4
palette: hypsometric
sunAzimuth: {ref: azimuth}
sunElevation: {expr: "solarElevation(dayOfYear, hour, 49.6)"}
```
````

Klasa jest w kropce (`{.scene3d-terrain}`, nie `{scene3d-terrain}`) — klamry bez
kropki oznaczają komórkę wykonywalną i Quarto próbowałby wysłać ją do silnika.
Dokument bez rozszerzenia nadal się renderuje: jako zwykły blok kodu.

Zmienne dokumentu (suwaki w tekście, wiązane przez `{ref: …}`):

````markdown
```{.rysik-vars}
- {name: azimuth, label: Azymut Słońca, value: 210, min: 0, max: 360, step: 1}
```
````

## Ścieżki renderowania

| Format | Co robi filtr | Interaktywność |
|---|---|---|
| `html` | `<div class="rysik-mount">` + payload w `<script type="application/x-rysik">` | pełna, runtime montuje sceny leniwie (IntersectionObserver) |
| `pdf`, `docx`, `epub` | `![](_scenes/<label>.png)` w Div z id `fig-*` | brak — wartości `ref`/`expr` biorą `pdfDefault` z manifestu |

Podpisy i numerację generuje Quarto, więc `@fig-wisla` działa bez naszego udziału.

## Pre-render

`render-scenes.mjs` liczy `sha256(typ + payload + zmienne + wersja runtime'u)`
i zapisuje go w `_scenes/.cache.json`. Zrzut powstaje tylko wtedy, gdy hash się
zmienił — po podmianie runtime'u wszystkie obrazki unieważniają się same.
Trzymaj `_scenes/` w repozytorium (przy większych projektach z `git-lfs`), wtedy
CI budujące PDF nie potrzebuje ani GPU, ani danych źródłowych.

Wymaga `playwright` (jest w devDependencies monorepo).

## Czego Quarto nie zrobi

Edycji na żywo, reaktywności między blokami, round-tripu (Quarto tylko czyta) —
to wszystko zostaje po stronie Rysika.
