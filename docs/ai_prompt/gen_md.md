# MyCastle Markdown — kompletna referencja składni

> **Cel tego dokumentu.** To jest prompt/specyfikacja dla agenta AI generującego pliki `.md`
> dla edytora Markdown w MyCastle (`MdEditor`, oparty o TipTap). Opisuje **wszystkie**
> obsługiwane elementy — standardowy Markdown, rozszerzenia GFM oraz **własne bloki projektu**.
> Generuj wyłącznie składnię opisaną tutaj. Jeśli element nie jest tu wymieniony, nie wymyślaj go.

---

## 0. Jak działa format (kontekst dla agenta)

Edytor robi round-trip **Markdown ↔ TipTap (HTML)** przez dwie funkcje w
`app/mycastle-web/src/components/mdeditor/utils/markdownConverter.ts`:

- `markdownToHtml(md)` — wczytanie pliku do edytora,
- `htmlToMarkdown(html)` — zapis edytora do pliku `.md`.

Zasady, o których musisz pamiętać generując treść:

1. **Zwykły Markdown działa normalnie** (CommonMark + część GFM, silnik Showdown przy wczytywaniu,
   Turndown przy zapisie).
2. **Bloki własne** używają albo **fence'ów z identyfikatorem języka** (np. ` ```pscript `,
   ` ```automate `, ` ```event `), albo **inline'owej składni `@[...]`**.
3. **Block ID** — edytor nadaje każdemu blokowi UUID zapisywany jako komentarz HTML
   `<!-- bid:UUID -->` w linii **bezpośrednio nad** blokiem. **Nie musisz** ich pisać ręcznie —
   edytor dogeneruje brakujące. Możesz je pominąć w generowanej treści.
4. **Kodowanie URL.** Segmenty w inline'owych embedach `@[...]` (info, component, uiform) są
   `encodeURIComponent`-owane przy zapisie. Pisząc ręcznie prosty tekst bez znaków specjalnych
   (`:`, `]`, `/`, nowa linia) możesz podać go wprost; znaki specjalne **muszą** być URL-encoded.
5. **Puste linie** wokół bloków blokowych (fence, embed renderowany jako blok, kolumny) są zalecane.

---

## 1. Standardowy Markdown (StarterKit)

| Element            | Składnia                          |
|--------------------|-----------------------------------|
| Nagłówki H1–H6     | `# H1` … `###### H6` (styl ATX)   |
| Akapit             | zwykły tekst                      |
| **Pogrubienie**    | `**tekst**`                       |
| *Kursywa*          | `*tekst*`                         |
| ~~Przekreślenie~~  | `~~tekst~~`                       |
| Kod inline         | `` `kod` ``                       |
| Cytat              | `> cytat` (wielolinijkowy OK)     |
| Lista punktowana   | `- pozycja` lub `* pozycja`       |
| Lista numerowana   | `1. pozycja`                      |
| Linia pozioma      | `---` lub `***`                   |
| Link               | `[tekst](https://url)` lub `[tekst](https://url "tytuł")` |

Blok kodu z podświetlaniem składni (lowlight, ~common języki):

````markdown
```javascript
const x = 42;
```

```python
def hello():
    print("world")
```
````

---

## 2. Rozszerzenia GFM / rich text

### 2.1 Lista zadań (task list)

```markdown
- [x] Zrobione
- [ ] Niezrobione
```

### 2.2 Highlight (zaznaczenie)

```markdown
To jest ==podświetlony== fragment.
```

### 2.3 Tabele

Prosta tabela (gdy bez własnych szerokości/wyrównania) — zapisywana jako pipe-table:

```markdown
| Nagłówek 1 | Nagłówek 2 |
|------------|------------|
| Komórka 1  | Komórka 2  |
| Komórka 3  | Komórka 4  |
```

Tabela z własnymi szerokościami/wyrównaniem komórek zapisuje się jako surowy HTML
`<table>` ze `style="width:…; text-align:…"`. Do generowania treści preferuj wersję pipe.

### 2.4 Wyrównanie tekstu

Wyrównanie (`TextAlign`) dotyczy nagłówków, akapitów i komórek tabel. Zapisywane jest jako atrybuty
`style` na HTML — nie ma czystej składni Markdown. Generuj normalny tekst; wyrównanie ustawia użytkownik w UI.

---

## 3. Matematyka (KaTeX)

Inline:

```markdown
Wzór $E = mc^2$ jest znany.
```

Blok:

```markdown
$$
\frac{a}{b} = \frac{c}{d}
$$
```

(`$$...$$` w jednej linii też działa: `$$E=mc^2$$`.)

---

## 4. Media

### 4.1 Obraz

Prosty (zapisywany jako Markdown):

```markdown
![tekst alternatywny](https://example.com/obraz.png)
![tekst alt](https://example.com/obraz.png "tytuł")
```

Z własną szerokością/wyrównaniem zapisuje się jako HTML `<img style="width:50%; float:left;" …>`.

### 4.2 Audio (HTML)

```html
<audio src="https://example.com/audio.mp3" controls></audio>
<audio src="https://example.com/audio.mp3" data-title="Nazwa" controls autoplay loop></audio>
```

### 4.3 Wideo (HTML)

```html
<video src="https://example.com/video.mp4" controls style="width: 100%; margin-left: auto; margin-right: auto; display: block;"></video>
<video src="https://example.com/video.mp4" data-title="Tytuł" poster="thumb.jpg" controls muted></video>
```

---

## 5. Inline'owe embedy `@[...]`

Wszystkie poniższe to **inline** (w tekście). Renderowane jako interaktywne komponenty w edytorze.

### 5.1 Encje PIM: person / task / project

```markdown
Osoba: @[person:UUID]      ← konkretny rekord
Osoba: @[person:]          ← pusty = picker w UI
Zadanie: @[task:UUID]
Projekt: @[project:UUID]
```

### 5.2 InfoMark — przypis/tooltip inline

Format: `@[info:{text}:{title}:{body}:{bodyPath}]` — **każdy segment URL-encoded**.

- `text` — widoczna etykieta (z kropkowanym podkreśleniem),
- `title` — nagłówek popovera,
- `body` — treść popovera (renderowana jako Markdown+GFM),
- `bodyPath` — opcjonalna ścieżka do pliku `.md` w drive użytkownika (ma priorytet nad `body`).

```markdown
Zobacz @[info:API:REST%20API:Dokumentacja%20pod%20https%3A%2F%2Fapi.example.com:Docs%2FAPI.md] po szczegóły.
```

(Puste segmenty zostaw puste: `@[info:termin::definicja:]`.)

### 5.3 Formularze UI

```markdown
@[uiform:form-id]                          ← referencja po ID
@[uiform:{"id":"form-123","title":"Mój formularz"}]   ← inline JSON
```

### 5.4 Form Engine (plik `.form.json`)

```markdown
@[form:ścieżka/do/formularz.form.json]
```

### 5.5 Automate Flow (embed przepływu)

```markdown
@[automate:FLOW_UUID]            ← uruchamiany ręcznie
@[automate:FLOW_UUID:autorun]    ← auto-uruchomienie przy otwarciu dokumentu
```

### 5.6 CAD / Scene 3D viewer

Format: `@[cad:{mode}:{pełny_url_viewera}]` (URL **nie** jest enkodowany — zachowuje `://`).
Tryby: `cad` (2D), `cad3d` (3D), `scene3d` (scena 3D, domyślny), `electronics`.

```markdown
@[cad:scene3d:http://localhost:1898/viewer/scene/moj-projekt]
@[cad:cad3d:http://localhost:1898/viewer/cad/detal]
@[cad:electronics:http://localhost:1898/viewer/elec/plytka]
```

---

## 6. Bloki wykonywalne i strukturalne (fence z identyfikatorem)

### 6.1 Plugin Script — ` ```pscript `

Wykonywalny blok JavaScript renderowany w dokumencie. Format fence'a:

```
pscript:{blockId}:{mode}:{encodedLabel}
```

- `blockId` — UUID bloku (opcjonalny; edytor uzupełni),
- `mode` — `manual` (domyślny) lub `auto` (uruchom na mount + przy przeładowaniu pluginów),
- `encodedLabel` — etykieta bloku, `encodeURIComponent`.

W kodzie dostępne są (z `script-runtime`): `auth`, `http` (fetch z Bearerem), `md`, `table`,
`reactive`, namespace'y pluginów oraz imperatywne `display.text/table/list/json`.
Zwracana wartość (string / `md` / `table` / `reactive` / ReactElement) jest renderowana.

Przykład (zwróć uwagę na otaczające **cztery** backticki — to tylko zapis w tej referencji):

`````markdown
```pscript:auto:Powitanie
const name = (await auth.me?.())?.name ?? 'świat';
return md`**Cześć, ${name}!**`;
```
`````

Minimalnie wystarczy ` ```pscript ` bez parametrów.

### 6.2 Automate Script — ` ```automate `

Wykonywalny blok skryptu Automate. Format fence'a (wszystkie parametry opcjonalne, stała kolejność):

```
automate[:{blockId}][:autorun][:html][:t={tag1,tag2}][:h={wysokość_px}]
```

- `:autorun` — auto-uruchomienie,
- `:html` — renderuj wynik jako HTML zamiast kodu (domyślnie `code`),
- `:t=...` — tagi po przecinku (każdy URL-encoded),
- `:h=360` — wysokość okna w px.

W kodzie: API Automate (`api.log.info(...)`, dostęp do flows/datasetów) oraz `display.*`.

`````markdown
```automate:autorun:html:t=raport,dzienny:h=400
api.log.info('Start');
display.text('Wynik tutaj');
```
`````

Minimalnie: ` ```automate ` bez parametrów.

### 6.3 Event Block — ` ```event `

Blok wydarzenia kalendarzowego, treść = JSON. Pola:
`eventName`, `start` (`YYYY-MM-DDTHH:mm`), `end` (opcj.), `description`,
`taskId`, `taskName`, `projectName`.

`````markdown
```event
{
  "eventName": "Spotkanie zespołu",
  "start": "2026-06-10T14:00",
  "end": "2026-06-10T15:00",
  "description": "Kwartalny przegląd",
  "taskId": "task-uuid",
  "taskName": "Planowanie Q2",
  "projectName": "Projects"
}
```
`````

---

## 7. Układ kolumnowy

```html
<div data-column-layout class="md-editor-columns">

<div data-column style="width: 50%;">

Treść kolumny 1 — pełny Markdown działa w środku.

</div>

<div data-column style="width: 50%;">

Treść kolumny 2.

</div>

</div>
```

Zostaw puste linie wokół wewnętrznej treści, by Markdown w kolumnach był parsowany.

---

## 8. Block ID (komentarz HTML)

```markdown
<!-- bid:123e4567-e89b-42d3-a456-426614174000 -->
# Nagłówek z ID
```

Marker w **osobnej linii bezpośrednio nad** blokiem (heading, akapit, cytat, lista, blok kodu, tabela).
Generując treść **możesz je pomijać** — edytor nadaje brakujące automatycznie.

---

## 9. Ściąga: polecenia slash (`/`) → wstawiany element

Lista odpowiada temu, co użytkownik może wstawić w edytorze (i co powinieneś umieć wygenerować):

| Slash                  | Wstawia                                            |
|------------------------|----------------------------------------------------|
| `/text`                | akapit                                             |
| `/h1` `/h2` `/h3`      | nagłówek H1/H2/H3                                  |
| `/bullet list`         | lista punktowana                                  |
| `/numbered list`       | lista numerowana                                  |
| `/task list`           | lista zadań `- [ ]`                               |
| `/quote`               | cytat                                             |
| `/code block`          | blok kodu ` ```lang `                             |
| `/divider`             | `---`                                             |
| `/link`                | `[tekst](url "tytuł")`                            |
| `/table 2x2…5x5`       | tabela                                            |
| `/image` `/audio` `/video` | media                                         |
| `/math block` `/inline math` | `$$…$$` / `$…$`                             |
| `/person` `/task` `/project` | `@[person:]` `@[task:]` `@[project:]`       |
| `/ui form`             | `@[uiform:form-id]`                               |
| `/form`                | `@[form:ścieżka]`                                 |
| `/automate flow`       | `@[automate:flow-id]`                             |
| `/cad view`            | `@[cad:scene3d:url]`                              |
| `/script`              | blok ` ```automate `                              |
| `/plugin script`       | blok ` ```pscript `                               |
| `/page`                | `[nazwa](ścieżka/do/strony.md)` (+ tworzy plik)   |
| `/event`               | blok ` ```event ` (dialog wydarzenia)             |
| `Plugin Script: {label}` | szablon `pscript` z załadowanego pluginu        |

---

## 10. Pełny przykład „kitchen sink"

`````markdown
# Raport tygodniowy

Krótki **wstęp** z *kursywą*, ~~poprawką~~ i ==podświetleniem==. Zobacz
@[info:SLA:Service%20Level%20Agreement:Czas%20reakcji%20%3C%204h:] dla definicji.

## Zadania

- [x] Zebrać dane
- [ ] Wysłać podsumowanie do @[person:]

## Metryki

| Metryka   | Wartość |
|-----------|---------|
| Przychód  | 12 400  |
| Konwersja | 3.2%    |

Wzór konwersji: $c = \frac{zamówienia}{wizyty}$.

## Wynik na żywo

```pscript:auto:Licznik
return md`Aktualny czas serwera: **${new Date().toISOString()}**`;
```

## Wydarzenie

```event
{
  "eventName": "Retrospektywa",
  "start": "2026-06-12T10:00",
  "end": "2026-06-12T11:00",
  "description": "Podsumowanie sprintu",
  "projectName": "Projects"
}
```

## Podgląd 3D

@[cad:scene3d:http://localhost:1898/viewer/scene/obudowa]

---

Powiązana strona: [Specyfikacja](Docs/spec.md).
`````

---

## 11. Zasady dla agenta (podsumowanie)

1. Używaj **tylko** elementów z tej referencji.
2. Bloki wykonywalne/strukturalne (`pscript`, `automate`, `event`, kolumny) otaczaj pustymi liniami.
3. Inline embedy `@[...]` z znakami specjalnymi w segmentach → **URL-encode** segmenty
   (dotyczy szczególnie `@[info:...]` i inline-JSON `@[uiform:{...}]`).
4. W `@[cad:mode:url]` URL zostaw nieenkodowany.
5. Block ID (`<!-- bid:... -->`) możesz pominąć — generuje je edytor.
6. Tabele i obrazy preferuj w wersji czysto-markdownowej; HTML stosuj tylko gdy potrzebne są
   własne szerokości/wyrównanie (lub dla audio/wideo/kolumn, które nie mają składni Markdown).
7. `pscript` mode: `manual` (domyślny) albo `auto`. `automate` viewMode: `code` (domyślny) albo `html` (`:html`).
