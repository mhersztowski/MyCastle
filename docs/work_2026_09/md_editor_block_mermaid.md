# Blok diagramu w edytorze Markdown — przegląd i kierunki rozwoju

Stan na 2026-08-24. Przegląd obejmuje blok ` ```mermaid ` w edytorze notatek
(`MdEditor`) razem z całym zapleczem w `packages/web-devtools/src/diagrams`.

---

## 1. Mapa: gdzie to mieszka

| Warstwa | Miejsce | Rola |
|---|---|---|
| Widok bloku | `app/mycastle-web/src/components/mdeditor/extensions/DiagramBlockView.tsx` | przełącznik Code / View / Edit, wybór adaptera, render Mermaidem, wybór startera |
| Rejestr widoków | `.../extensions/blockRenderers.ts` | odwrócona zależność: blok rejestruje się sam, edytor go tylko woła |
| Wpięcie | `.../extensions/registerBuiltinBlocks.ts` | ładowanie asynchroniczne, awaria jednego zestawu nie gasi pozostałych |
| Model diagramu | `packages/web-devtools/src/diagrams/model/` | `DiagramDocument` — neutralny, bez składni |
| Adapter Mermaid | `.../diagrams/formats/mermaid/` | parse ⇄ serialize, 10 rodzajów diagramów |
| Edytory graficzne | `.../diagrams/editor/` | React Flow + cztery edytory własne (sekwencja, pakiet, kanban, gantt, timeline) |
| Weryfikacja zewnętrzna | `.../extensions/mermaidRoundTrip.test.ts` | 36 testów przepuszczających nasz zapis przez parser samego Mermaida |

Skala: **102 pliki, ~11 900 linii kodu produkcyjnego + ~6 000 linii testów**,
**809 testów jednostkowych** w `web-devtools` (wszystkie zielone) plus 36 testów
round-tripu w `mycastle-web`.

---

## 2. Co działa dzisiaj

### Trzy tryby bloku

`Code` (tekst), `View` (render `mermaid.render`, biblioteka ładowana leniwie),
`Edit` (edytor graficzny na modelu). Ten sam blok, jedna treść — tryb jest tylko
sposobem patrzenia.

### Dziesięć rodzajów diagramu

`flowchart`, `state`, `class`, `sequence`, `er`, `packet`, `kanban`, `gantt`,
`timeline`, `c4` — każdy z parserem, serializerem, starterem i edytorem
dopasowanym do tego, czym diagram naprawdę jest. Warto docenić rozróżnienie,
które nie jest oczywiste: **nie wszystko jest grafem**. Sekwencja to kolejność w
czasie, pakiet to zakresy bitów, kanban to pudełka, gantt to oś czasu — i każdy
z nich dostał własny edytor zamiast wciśnięcia na płótno React Flow. To decyzja,
która zwykle zapada za późno.

### Zasada zachowania treści

`UnknownLine` z numerem linii i kotwicą (`model/diagram.ts:206`) — czego adapter
nie rozumie, wraca przy zapisie na swoje miejsce. Front matter (`---`) ma osobną
obsługę, bo Mermaid czyta go wyłącznie jako pierwszy blok. To jest różnica
między narzędziem, któremu można powierzyć plik, a takim, które trzeba
sprawdzać po każdym zapisie.

### Weryfikacja przez cudzy parser

`mermaidRoundTrip.test.ts` nie sprawdza, czy nasz model się zgadza — sprawdza,
czy **Mermaid** przyjmuje to, co zapisaliśmy, i czy drugi zapis jest stabilny.
To najmocniejszy pojedynczy element tej pracy: własne testy modelu potrafią być
zgodnie i konsekwentnie błędne.

---

## 3. Architektura — co warto zachować

Trzy rozdzielenia są zrobione dobrze i **nie powinny być naruszane** przy
kolejnych funkcjach:

1. **Model ≠ składnia.** `DiagramDocument` nie wie o Mermaidzie. Nowy język to
   nowy adapter `DiagramFormat`, zero zmian w edytorach.
2. **Rejestr zamiast listy.** Zarówno formaty (`diagramFormats`), jak i widoki
   bloków (`registerBlockRenderer`) rejestrują się same. Edytor markdown nie ma
   w kodzie słowa „mermaid" poza jedną pozycją w liście języków.
3. **Host trzyma historię.** Edytor graficzny emituje `onChange`, undo należy do
   TipTapa. Diagram nie ma własnego stosu cofnięć, który rozjeżdżałby się z
   dokumentem.

Konsekwencja praktyczna: **rozwój idzie przez dokładanie adapterów i edytorów, a
nie przez rozbudowę bloku.** Każda funkcja, która wymagałaby `if (format ===
'mermaid')` w `DiagramBlockView`, jest sygnałem, że projekt się psuje.

---

## 4. Defekty i ryzyka znalezione podczas przeglądu

> **Stan na 2026-08-24: Etapy 1–4 wykonane.** Punkty 4.1–4.4 są naprawione —
> szczegóły przy każdym z nich. Punkt 4.5 (zależność `mermaid` w dwóch
> miejscach) zostaje otwarty.

### 4.1. Diagram nieobsługiwanego rodzaju wchodzi w tryb Edit i daje się zniszczyć

**To najpoważniejsze znalezisko.** Mermaid 11 ma ~23 rodzaje diagramów, my
obsługujemy 10. Dla pozostałych `detect()` zwraca `0`, ale
`DiagramBlockView.tsx:80` ma fallback `?? diagramFormats.get(language ??
'mermaid')`, a `mermaidFormat.parse()` bez pasującego nagłówka **zakłada
flowchart** (`formats/mermaid/index.ts:64`).

Sprawdzone doświadczalnie:

| Wejście | `detect` | `kind` po parse | Wynik `serialize` |
|---|---|---|---|
| `pie title Udziały` + dane | 0 | `flowchart` | `flowchart TB` + oryginał jako unknown → **diagram nie renderuje się** |
| `mindmap` z `root((centrum))` | 0 | `flowchart`, 2 węzły | nagłówek `mindmap` **zgubiony**, gałęzie zinterpretowane jako węzły |
| `journey` z sekcją | 0 | `flowchart`, 1 węzeł | nagłówek zgubiony, `Kawa: 5: Ja` częściowo zjedzone |

Samo wejście w Edit jeszcze nic nie zapisuje, ale pierwsza operacja (dodanie
węzła, „Ułóż") nadpisuje blok i **diagram przestaje istnieć**. Użytkownik widzi
płótno z dwoma węzłami wyjętymi z mindmapy i ma prawo sądzić, że edytuje
mindmapę.

**Poprawione.** `DiagramDocument` dostał pole `unsupported`, a adapter jawną
listę trzynastu nagłówków, których nie obsługuje (`pie`, `mindmap`, `journey`,
`gitGraph`, `quadrantChart`, `requirementDiagram`, `sankey`, `xychart`, `block`,
`architecture`, `radar`, `treemap`, `zenuml`). Dla nich `parse` nie wymyśla
węzłów, całe źródło ląduje w `unknown`, a `serialize` oddaje je bez zmian —
zabezpieczenie działa więc na poziomie modelu, nie tylko interfejsu. `detect`
nadal zwraca 0,95: to *jest* Mermaid i pasek ma to mówić, odmowa dotyczy
wyłącznie edycji graficznej.

W interfejsie przycisk „Edit" jest wyszarzony, obok stoi nazwa rodzaju
(`mindmap — bez edycji graficznej`), a blok wczytany w trybie graficznym wraca
do podglądu. Domyślanie się flowchartu zostaje **wyłącznie** dla tekstu bez
żadnego nagłówka — tam jest domysłem, a nie zignorowaniem autora.
Testy: `formats/mermaid/unsupported.test.ts` (18).

### 4.2. Układ graficzny nie przeżywa zamknięcia notatki

Sprawdzone: przesunięcie węzła daje **bajt w bajt ten sam tekst**. Pozycje żyją
tylko w `lastDocRef` w pamięci komponentu (`mergeLayout`). Zamknięcie notatki =
utrata rozmieszczenia, `autoLayout` liczy od zera.

Dla flowchartu z pięcioma węzłami to nieistotne. Dla diagramu klas z piętnastoma
— to znaczy, że ręczne rozmieszczenie jest pracą do wyrzucenia, więc nikt jej nie
wykona, więc edytor graficzny zostaje narzędziem do drobnych poprawek zamiast do
projektowania.

**Trzy drogi, w kolejności preferencji:**

1. **Front matter z układem** — Mermaid ignoruje nieznane klucze w bloku `---`,
   a `frontMatter.ts` już go rozumie. Zapis `layout: {A: [120, 40], …}` przeżywa
   render, git i cudze narzędzia. Najmniej inwazyjne, wykonalne od razu.
2. Komentarze `%% @layout A 120 40` — działa, ale zaśmieca diagram.
3. Plik towarzyszący — przeczy idei „notatka jest samowystarczalna".

**Poprawione drogą 1.** Układ zapisuje się w kluczu `positions` front mattera:

```
---
positions:
  A: [120, 40]
  G: [0, 0, 300, 200]
---
flowchart TB
  A --> B
```

Dwie liczby to pozycja węzła, cztery — ramka grupy (pozycja i rozmiar).
Klucz nazywa się `positions`, a **nie** `layout`, bo `layout` od Mermaida 11
jest jego własnym ustawieniem (wybór silnika `dagre`/`elk`) i zajęcie go
znaczyłoby ciche nadpisywanie cudzej konfiguracji.

Zapis wchodzi tylko wtedy, gdy elementy mają pozycje — diagram, którego nikt
nie ruszał, nie dostaje ani jednej dodatkowej linii. Pozycje węzłów, których
już nie ma, znikają przy pierwszym zapisie. Wpięcie siedzi w
`mermaidFormat.parse`/`serialize`, więc dziesięć adapterów rodzajów nic o
układzie nie wie.

Że Mermaid to przyjmuje, sprawdzają trzy testy **jego własnym parserem**
w `mermaidRoundTrip.test.ts`. Testy jednostkowe:
`formats/mermaid/layoutFrontMatter.test.ts` (20).

### 4.3. Operacja graficzna brudzi dokument nawet bez zmiany treści

`replaceBlockText` robił `tr.replaceWith` bez porównania z aktualną treścią.
Ponieważ operacja graficzna emituje zapis nawet wtedy, gdy tekst się nie
zmienia, efekt był taki: **dokument stawał się brudny, autosave zapisywał plik,
undo dostawało krok, który nic nie cofa**.

**Poprawione.** Funkcja wyszła z komponentu do `blockText.ts` — właśnie po to,
by dało się to sprawdzić testem na prawdziwym dokumencie ProseMirror (licznik
transakcji). Zwraca teraz `boolean` i nie dispatchuje niczego przy identycznej
treści. Testy: `blockText.test.ts` (5).

### 4.4. Zapis normalizuje formatowanie całego bloku

`    A[Start] --> B[Koniec]` po round-tripie staje się trzema liniami z wcięciem
dwóch spacji. To świadoma cena kanonicznego zapisu, ale warto ją znać: **pierwsza
operacja graficzna przepisuje cały blok**, więc w gicie zobaczysz diff całego
diagramu zamiast jednej zmiany. Dla diagramów pisanych ręcznie i trzymanych w
repo to bywa irytujące.

Rekomendacja: nie walczyć z tym (zachowanie oryginalnego formatowania przy
edycji strukturalnej to studnia bez dna), ale **powiedzieć o tym w interfejsie**
przy pierwszym wejściu w Edit.

### 4.5. `mermaid` jako zależność w dwóch miejscach — ✅ POPRAWIONE

`packages/web-devtools/package.json` (devDependency, do testów) i
`app/mycastle-web/package.json`. Wersje trzeba było trzymać zgodne ręcznie —
rozjazd objawiłby się tym, że testy round-tripu przechodzą, a użytkownik widzi
błąd składni.

**Poprawione katalogiem pnpm.** Wersja stoi raz w `pnpm-workspace.yaml`
(`catalog: mermaid: ^11.4.1`), a oba pakiety odwołują się do niej przez
`"mermaid": "catalog:"`. Rozjazd przestaje być możliwy, zamiast być
pilnowany.

---

## 5. Import z kodu źródłowego

To pytanie, które postawiłeś — i odpowiedź jest ciekawsza, niż się wydaje:
**import z kodu już istnieje, tylko w innym pakiecie i wychodzi innym formatem.**

### Co już mamy

`packages/devtools` to gotowy tor kod → model:

- **parsery**: TypeScript/JavaScript (TS Compiler API), Python, C, C++
  (web-tree-sitter, WASM) — `parsers/`;
- **`CodeModel`** — neutralne IR z klasami, polami, metodami, widocznością,
  statycznością, abstrakcyjnością, **dokumentacją TSDoc** (`DocMeta`: opis,
  `@param`, `@returns`, `@example`, `@deprecated`) i relacjami;
- **`UmlSyncService`** — skan katalogu, generowanie projektu UML, diff kolejnych
  wersji jako historia git-like, zachowanie ręcznego układu po ponownym skanie;
- **backend już to wystawia**: `POST /api/users/{u}/uml/sync`
  (`MycastleHttpServer.ts:2490`) — czyta katalog z Drive **albo z drzewa źródeł
  MyCastle** (`mycastle-code/…`, przez `MYCASTLE_CODE_DIR`), z ochroną przed
  wyjściem poza katalog. Klient: `MinisApiService.ts:516`.

Czyli droga „wskaż katalog z kodem → dostań diagram klas" jest **przejechana od
początku do końca**. Jej wyjściem jest `UmlProject` (`*.umlproj.json`) dla strony
Programming → UML, a nie `DiagramDocument` dla bloku w notatce.

### Zrobione w etapie 3

Most powstał jako `formats/uml/umlProject.ts` w `web-devtools`
(`umlDiagramToDocument` / `documentToUmlDiagram`, 23 testy). Dwie rzeczy okazały
się trudniejsze, niż wyglądały z lotu ptaka:

**Kierunek relacji.** Oba modele mają `source` i `target`, ale znaczą nimi co
innego: UML stawia podklasę jako źródło `generalization` (trójkąt rysuje się na
końcu), a model diagramu trzyma nadklasę po stronie `from`. Pomylenie tego nie
kończy się błędem, tylko diagramem z odwróconym dziedziczeniem — widać to
dopiero, gdy ktoś go przeczyta. Odwracane są `generalization` i `realization`;
kompozycja i agregacja **nie**, bo w obu modelach „całość" jest źródłem.

**Notacja składowej.** UML z `devtools` pisze `- imie: string` (nazwa, potem
typ), a model diagramu `-string imie` (typ przed nazwą, bo taką notację ma
Mermaid). Przepisanie tekstu bez zamiany kolejności dawało `name: "string"` i
`type: "imie"` — rozbiór „udawał się", a klasa pokazywała bzdury. To był
najcichszy błąd w całym moście: nic nie protestowało, testy modelu przechodziły.

Rodzaje relacji dobrane są tak, że round-trip niczego nie gubi — łącznie z parą
myląco nazwaną: UML-owe `directed` (ze strzałką) to `association` modelu, a
UML-owe `association` (bez strzałki) to `link`.

### Czego brakowało: jednego mostu

`CodeModel`/`UmlNodeData` i `DiagramDocument(kind: 'class')` opisują **to samo
pojęcie** w dwóch kształtach:

| Pojęcie | devtools | web-devtools |
|---|---|---|
| klasa | `CodeSymbol` / `UmlNodeData` | `DiagramNode` + `members` |
| pole/metoda | `CodeMember` (rozbite + `text`) | `ClassMember` (rozbite + `raw`) |
| stereotyp | `kind: 'interface' \| 'enum' \| …` | `stereotype: '<<interface>>'` |
| relacja | `RelType` (7 wartości) | `ClassRelationKind` (7 wartości) |
| widoczność | `Visibility` + `VISIBILITY_SIGIL` | `MemberVisibility` |
| dokumentacja | `DocMeta` | **brak** |

Odwzorowanie jest niemal jeden do jednego. Brakująca kolumna (dokumentacja) to
najciekawszy element: `DocMeta` niesie opisy, których Mermaid nie ma gdzie
zapisać — i to jest **właściwy moment, żeby zdecydować, że most gubi
dokumentację świadomie**, zamiast wynajdywać składnię, której nikt poza nami nie
przeczyta.

### Rekomendowany kształt: import przez backend, nie w przeglądarce

`devtools` używa `node:fs` i `node:module` — to pakiet serwerowy. Ciągnięcie TS
Compiler API (~7 MB) i gramatyk tree-sittera do bundla przeglądarki po to, żeby
sparsować plik leżący na serwerze, byłoby błędem.

Przepływ do zbudowania:

```
[blok mermaid w notatce]
   → „Importuj z kodu…" → wybór katalogu/plików (istniejący CodeFilePickerDialog)
   → POST /api/users/{u}/uml/sync   (istnieje)
   → UmlProject                      (istnieje)
   → umlToDiagram()                  ← DO NAPISANIA: ~150 linii, czysta funkcja
   → serialize(mermaidFormat)        (istnieje)
   → treść bloku
```

**Jedyny nowy kod to `umlToDiagram` + `diagramToUml`** — czysta para funkcji,
testowalna bez UI, bez sieci, bez Reacta. Cała reszta jest zbudowana i przetestowana.

### Uwaga o użyteczności — czego się spodziewać

Zanim to powstanie, warto wiedzieć, co import z kodu naprawdę daje:

- **Diagram klas z całego katalogu jest nieczytelny.** Skan `packages/core`
  wyprodukuje kilkadziesiąt klas — to nie jest diagram, to jest wykres kabli.
  Import ma sens jako **„wybierz 3–8 plików"**, nie „wskaż katalog". Interfejs
  powinien do tego zachęcać (domyślnie wybór plików, katalog dopiero po
  rozwinięciu).
- **Wartość jest w aktualizacji, nie w pierwszym imporcie.** Narysowanie klasy
  ręcznie zajmuje minutę. Prawdziwa korzyść to „ten diagram w notatce architektury
  jest z kodu sprzed tygodnia — odśwież" — czyli powtórny import z zachowaniem
  układu i pokazaniem, co się zmieniło. `UmlSyncService` **już umie** i jedno, i
  drugie (dopasowanie po deterministycznym id, `diffDiagrams`, `describeChanges`).
- **Sekwencja z kodu to inna, znacznie trudniejsza sprawa.** Diagram sekwencji
  wymaga analizy przepływu wywołań, a nie deklaracji. Nie próbowałbym — koszt
  ogromny, wynik zawsze do poprawki ręcznej.

---

## 6. Eksport

Dziś eksportu **nie ma żadnego** — ani obrazu, ani kodu, ani innego formatu
tekstowego. `grep` po `toSvg|toPng|download` w całym pakiecie i w bloku nie
zwraca nic.

### 6.1. Eksport obrazu (SVG / PNG) — najwyższy stosunek wartości do kosztu

**Zrobione.** W trybie podglądu pasek ma przyciski **SVG** i **PNG**, czynne
dopiero po udanym renderze — pobierany plik jest dokładnie tym SVG, które widać,
a nie drugim renderem, który mógłby się różnić.

SVG od Mermaida wymagał trzech poprawek, zanim stał się plikiem (`diagramExport.ts`):
**przestrzeń nazw** (w dokumencie HTML bierze się z kontekstu, w osobnym pliku
musi być zapisana), **wymiary liczbowe** (`width="100%"` bez rodzica znaczy „nie
wiadomo ile" — liczby są w `viewBox`) i **białe tło** (przezroczyste znika na
ciemnym slajdzie razem z napisami). Usuwany jest też `max-width`, który ucinałby
PNG w skali większej niż 1.

PNG rysuje się w podwójnej rozdzielczości, bo diagram trafia najczęściej do
prezentacji, gdzie jest powiększany. Obraz idzie przez `Image` z adresu `data:`,
a nie `blob:` — ten drugi bywa traktowany jako inne źródło i „brudzi" canvas,
przez co `toBlob` kończy się błędem bezpieczeństwa.

Nazwa pliku bierze się z tytułu diagramu (front matter albo dyrektywa `title`),
a gdy go nie ma — z rodzaju diagramu. Polskie znaki są transliterowane.
Testy: `diagramExport.test.ts` (16).

Zostaje znane ograniczenie: SVG niesie style, ale nie czcionki. Przy otwarciu
na maszynie bez tej samej rodziny fontów tekst przeskoczy. Zamiana tekstu na
ścieżki to osobna praca — na razie nie było na nią zapotrzebowania.

### 6.2. Eksport do kodu źródłowego — droga już przetarta

Symetrycznie do importu: `diagramToModel` + `generateCode` w `devtools` generują
szkielety **TypeScript / Python / C++** z modelu UML. Z mostem `diagramToUml` z
punktu 5 diagram klas w notatce staje się źródłem szkieletu kodu bez pisania
generatora.

**Ale uczciwie o użyteczności:** generowanie kodu z diagramu jest funkcją, która
świetnie wygląda w demo i rzadko bywa używana w praktyce. Szkielet klasy piszę
szybciej, niż rysuję prostokąty, a wygenerowany kod trzeba i tak przejrzeć.
Wartość jest realna w dwóch wąskich przypadkach:

- **projektowanie przed pisaniem** — kiedy diagram powstaje *zamiast* kodu, na
  etapie ustalania, jakie w ogóle mają być klasy;
- **wiele języków z jednego opisu** — ten sam model danych po stronie TS i
  Pythona (u nas realny przypadek: `core` ⇄ `app/client`).

Poza tym: **preferowałbym import nad eksportem**. Kod jest źródłem prawdy (tak
mówi zresztą CLAUDE.md), diagram jest widokiem. Generowanie kodu z diagramu
odwraca tę zależność i tworzy drugie miejsce, w którym mieszka ta sama prawda.
Jeśli eksport do kodu ma powstać, to z jasnym komunikatem „to jest szkielet do
zaczęcia, nie tor synchronizacji".

### 6.3. Eksport do innych języków diagramów

Adapter `DiagramFormat` jest do tego przygotowany od początku. Ocena kandydatów:

| Format | Wartość | Koszt | Werdykt |
|---|---|---|---|
| **PlantUML** | duża — dominuje w Confluence/JetBrains | średni: klasy łatwo, reszta to osobne składnie | ✅ **zrobione** (diagram klas, obie strony) |
| **Graphviz/DOT** | mała jako eksport, **duża jako import** — mnóstwo narzędzi go pluje (profilery, `pydeps`, `cargo-depgraph`) | niski | ✅ **zrobione** (obie strony — patrz uwaga niżej) |
| **D2** | mała — ładny, ale niszowy | średni | nie teraz |
| **Excalidraw / draw\.io** | pozorna — po eksporcie to już nie jest ten diagram, tylko rysunek | wysoki | **nie** |
| **`*.umlproj.json`** | duża — spina blok w notatce ze stroną Programming → UML | niski (ten sam most co import) | ✅ **zrobione** |

**Zmiana decyzji przy DOT-cie.** W przeglądzie planowaliśmy „import tak, eksport
nie", z uzasadnieniem: eksport do formatu, którego nie umiemy zaimportować, jest
ślepą uliczką. Skoro import powstał, symetria jest darmowa — a bez niej blok
z DOT-em byłby jedynym, którego nie da się edytować graficznie.

Zasada, którą warto sobie zapisać: **eksport do formatu, którego nie umiemy
zaimportować, to ślepa uliczka.** Użytkownik wyeksportuje, poprawi w tamtym
narzędziu i wróci z pytaniem, jak to wciągnąć z powrotem. Dlatego DOT jako
import-tylko, a Excalidraw wcale.

---

## 7. Użyteczność i preferowane stosowanie

Uwagi, które wychodzą z lektury kodu i z tego, jak ten blok jest osadzony w
notatce.

### Kiedy blok graficzny wygrywa, a kiedy przeszkadza

- **Flowchart, state, ER, klasy** — edytor graficzny wygrywa wyraźnie. Kształt
  ma znaczenie, relacje są przestrzenne, a pisanie `A -.->|tak| B` z pamięci jest
  dla większości ludzi barierą.
- **Sequence, gantt, kanban, timeline** — tu **tekst często jest szybszy**.
  Dopisanie linii `Alicja ->> Bob: pytanie` trwa sekundę; znalezienie właściwego
  miejsca w edytorze graficznym — dłużej. Własne edytory dla tych rodzajów są
  dobre dla kogoś, kto nie zna składni, ale nie zastąpią pisania komuś, kto zna.
  To nie jest zarzut — to argument za tym, żeby **tryb Code pozostał domyślny**
  (i tak jest: `initialMode = 'code'`).
- **Packet** — edytor graficzny wygrywa bezapelacyjnie, bo liczenie bitów w
  głowie jest źródłem błędów, a nie ekspresji.

### Tryb bloku nie jest zapamiętywany

`initialMode` jest zawsze `'code'` i nigdzie nie trafia do dokumentu. Dla
diagramu, który jest **ilustracją w dokumencie** (a nie kodem do czytania), to
zły domyślny wybór: czytelnik notatki architektury chce widzieć rysunek, nie
źródło.

**Poprawione.** Tryb zapisuje się w infostringu — ` ```mermaid:view `,
` ```mermaid:edit `, a domyślne `code` jako sam `mermaid` (wartość domyślna nie
trafia do pliku, inaczej każdy diagram dostałby parametr, który nic nie zmienia).
Wzorzec jest ten sam co w blokach `automate` i `pscript`.

Kontrakt rejestru widoków dostał w związku z tym drugi kanał zapisu:
`onLanguageChange` obok `onChange`. To osobne rzeczy — treść bloku i jego
ustawienia — a bez tego kanału ustawienie ginęłoby przy każdym otwarciu
dokumentu. Testy: `diagramBlockMode.test.ts` (10) i round-trip przez konwerter
markdown w `diagramModeRoundTrip.test.ts` (4).

### Wysokość diagramu w trybie View

Tryb Edit liczy wysokość z liczby węzłów, ale tryb View wstawiał SVG bez żadnej
kontroli rozmiaru: duży diagram rozpychał notatkę, mały tonął w pustce.

**Zrobione.** Podgląd ma własny pasek: −/+ (sześć stopni od 50% do 300%), 1:1
i pełny ekran zamykany Escapem. Pełny ekran to własna nakładka `position: fixed`,
a nie okno globalne aplikacji — podgląd nie ma stanu do przeniesienia, a nakładka
działa też poza edytorem (tryb czytania, eksport statyczny).

### Diagnostyka błędów składni

Błąd Mermaida pokazywał się jako surowy komunikat biblioteki, a
`ParseResult.issues` z numerami linii **istniało w kontrakcie i nie było nigdzie
pokazywane**.

**Zrobione, ale inaczej, niż zakładałem.** Przy pisaniu tego okazało się, że
`issues` powstają w **jednym miejscu w całym adapterze** (nierozpoznane końce
krawędzi we flowcharcie) — cała reszta tego, czego parser nie rozumie, ląduje po
cichu w `unknown`. Sam panel błędów byłby więc prawie zawsze pusty.

Panel pod trybem Code pokazuje więc dwie rzeczy: uwagi z numerami linii
(liczonymi od jedynki, bo model liczy od zera) **oraz osobno liczbę linii
zostawionych nietkniętych** — `style`, `click`, `classDef`, komentarze, składnia
spoza modelu. Ta druga informacja jest dla autora ważniejsza: mówi „edytor
graficzny tego nie pokaże, ale zapis odda to nietknięte", czyli odpowiada na
pytanie, które zadaje się przed wejściem w tryb Edit, a nie po nim.

Panel jest zwinięty do jednej linii, bo rozwinięta lista pod każdym diagramem
szybko stałaby się szumem — a wtedy przestaje działać także wtedy, gdy ma rację.
Odmiana liczebnika („1 uwaga", „22 uwagi", „12 uwag") ma własny test, bo
`n === 1 ? … : …` dałoby „22 uwag". Testy: `diagramIssues.test.ts` (7).

### Czego nie robić

- **Nie dodawać kolejnych rodzajów diagramów, dopóki nie ma 4.1 i 4.2.** Jedenasty
  rodzaj bez utrwalonego układu jest wart mniej niż utrwalony układ dla dziesięciu.
- **Nie budować własnego renderera.** Mermaid renderuje dobrze i jest standardem,
  który czyta GitHub, GitLab i Obsidian. Nasza wartość jest w edycji, nie w rysowaniu.
- **Nie sięgać po parser Mermaida do wczytywania** — to już zapisane w
  `flowchart.ts:10` i jest słuszne: tamten parser zwraca strukturę pod render, gubi
  nieznane fragmenty i zmienia się między wersjami.

---

## 8. Kolejność prac

Priorytety ustawione według stosunku wartości do kosztu, nie według atrakcyjności.

**Etap 1 — naprawić to, co szkodzi — ✅ WYKONANE 2026-08-24**

1. ✅ Odmowa edycji dla nieobsługiwanych rodzajów diagramu (4.1).
2. ✅ `replaceBlockText` bez transakcji przy identycznej treści (4.3).
3. ✅ Utrwalanie układu we front matterze (4.2).
4. ✅ Tryb bloku w infostringu (` ```mermaid:view `).

Bilans: **+47 testów** (`web-devtools` 809 → 847, `mycastle-web` +21), dwa nowe
moduły w adapterze Mermaida (`layoutFrontMatter.ts`, obsługa `unsupported`),
dwa w edytorze (`blockText.ts`, `diagramBlockMode.ts`). Typecheck obu pakietów
czysty.

**Etap 2 — eksport, który się opłaca — ✅ WYKONANE 2026-08-24**

5. ✅ Pobranie SVG / PNG z trybu View.
6. ✅ Diagnostyka rozbioru w trybie Code — uwagi z numerami linii **i** liczba
   linii zostawionych poza modelem (patrz §7: sam `issues` okazał się prawie
   zawsze pusty).
7. ✅ Zoom i pełny ekran dla trybu View.

Bilans: **+34 testy**, trzy nowe moduły (`diagramExport.ts`, `diagramIssues.ts`
i testy komponentu `diagramBlockView.test.tsx`). Typecheck czysty.

**Etap 3 — most do kodu — ✅ WYKONANE 2026-08-24**

8. ✅ `umlDiagramToDocument` / `documentToUmlDiagram` — czysta para funkcji,
   23 testy. Szczegóły w §5 powyżej.
9. ✅ **„Z kodu…"** w pasku bloku. Okno jest dwustopniowe: najpierw katalog,
   potem wybór **plików** z listą klas, które w każdym siedzą. Powyżej ośmiu
   plików nie zaznaczamy nic z góry — domyślne „wszystko" zachęcałoby do
   kliknięcia „Wstaw" bez patrzenia, a skan `packages/core` daje wykres kabli.
   Drugi krok nie pyta backendu ponownie: projekt z pierwszego przebiegu ma już
   wszystkie klasy z plikami, więc zawężenie jest filtrowaniem pamięci.
10. ✅ **„Odśwież z kodu"** — pojawia się tylko wtedy, gdy blok wie, skąd
    pochodzi (sekcja `source` we front matterze, obok `positions`). Układ
    przeżywa, bo `mergeLayout` nakłada go na świeży model. Pod blokiem staje
    podsumowanie zmian; **pusta lista też jest wiadomością** — „bez zmian"
    znaczy, że diagram jest aktualny.
11. ✅ **„Do kodu…"** — tylko dla diagramu klas. Nowy endpoint
    `POST /api/users/{u}/uml/codegen` (TypeScript / Python / C++). Okno pokazuje
    pliki i pozwala je pobrać, ale **niczego nie zapisuje**: kod jest źródłem
    prawdy, diagram jego widokiem, i tak to jest napisane w oknie.

Uwagi z realizacji:

- `describeChanges` z `devtools` **nie** zostało użyte. Działa na `UmlProject`,
  a to znaczyłoby trzymanie projektu razem z historią commitów w bloku markdown —
  kilkadziesiąt kilobajtów JSON-a w notatce po to, żeby raz na jakiś czas
  pokazać listę zmian. Porównanie robi `describeDiff` na modelu diagramu, po
  stronie klienta, i podaje liczby zamiast wypisywania każdej składowej: po
  tygodniu pracy w kodzie lista miałaby kilkaset linii.
- Okno importu i `MinisApiService` wchodzą **leniwie**. Nie dla wagi bundla,
  tylko dla zależności: klient API ciągnie pół aplikacji, a blok ma się
  renderować także tam, gdzie jej nie ma (podgląd, eksport statyczny, testy).
  Import jest wtedy niedostępny, a diagram działa.
- Sekcje front mattera (`positions`, `source`) mają teraz wspólny odczyt i
  zapis. Bez tego druga sekcja kasowałaby pierwszą — awaria widoczna dopiero po
  zamknięciu notatki.

Bilans: **+42 testy**, most w `web-devtools`, dwa okna i moduł źródła w
`mycastle-web`, jeden endpoint w backendzie. Typecheck wszystkich trzech czysty.

**Etap 4 — kolejne formaty — ✅ WYKONANE 2026-08-24**

12. ✅ **DOT / Graphviz**, obie strony. Parser jest liniowy i wybaczający, jak
    flowchartowy: rozpoznaje węzły, krawędzie, klastry, `rankdir` i atrybuty,
    a `node [...]`, `overlap` czy `fontname` wracają w `unknown`. Wejście jest
    **normalizowane na instrukcje** (łamanie po `{`, `;`, `}` poza cudzysłowami),
    bo `digraph { A -> B -> C; }` w jednej linii jest równie poprawne jak
    rozpisane na pięć, a pliki z narzędzi bywają jedno- i wieloliniowe.
    Świadomie nie sięgamy po pełny parser języka: podgrafy jako operandy
    krawędzi (`{A B} -> {C D}`), dziedziczone atrybuty zakresów i porty
    (`A:f0 -> B:f1`) kosztowałyby wielokrotnie więcej, niż dają.
13. ✅ **PlantUML**, obie strony, **wyłącznie diagram klas**. PlantUML ma
    kilkanaście rodzajów o zupełnie różnych składniach; pozostałe (sekwencja,
    czynności, stany, przypadki użycia, komponenty, obiekty) dostają jawną
    odmowę przez `document.unsupported` — ten sam mechanizm, który w etapie 1
    powstał dla nieobsługiwanych rodzajów Mermaida. Rozpoznanie idzie po
    **treści**, bo `@startuml` zaczyna każdy diagram; sekwencję sprawdzamy
    dopiero wtedy, gdy w tekście nie ma klas, bo `A -> B : opis` bywa jednym
    i drugim.
14. ✅ **`*.umlproj.json` jako format bloku.** Adapter jest cienki — most
    z etapu 3 robi całą robotę. Sedno jest w zapisie: plik niesie historię
    commitów, listę diagramów i metadane, więc oryginał wraca w
    `meta.umlProject` i jest odtwarzany przy serializacji. Bez tego pierwsza
    poprawka w notatce kasowałaby historię projektu, bez ostrzeżenia.
    Spięcie z Drive dostaliśmy **za darmo**: blok kodu umie być związany
    z plikiem (`externalSrc`), więc ten sam projekt da się poprawiać w notatce
    i na stronie Programming → UML.

Uwagi z realizacji:

- **Kolizja rozpoznawania**, którą wyłapał dopiero test na wszystkich formatach
  naraz: `graph G {` to Graphviz, a `graph TD` to Mermaid — słowo jest to samo,
  różnicę robi klamra. Oba adaptery zgłaszały 0,9 i wygrywał zarejestrowany
  wcześniej, czyli przypadek. Mermaid odmawia teraz tekstu z klamrą w nagłówku.
- Powstał `formats/rejestr.test.ts` — **jedna suita uruchamiana na wszystkich
  czterech adapterach** (rozpoznanie, stabilność zapisu, przenoszenie diagramu
  między formatami). Rozjazd między nimi wychodzi w niej natychmiast; ta sama
  zasada, co w `core-cad-viewer/scene-api/kontrakt.ts`.
- Blok markdown przyjmuje teraz cztery języki: `mermaid`, `umlproj`, `dot`,
  `plantuml` — każdy z zapamiętywanym trybem (` ```dot:view `). Podgląd zawsze
  renderuje Mermaidem, przepuszczając treść przez adapter — bo to Mermaid jest
  rendererem, a nie formatem zapisu.

Bilans: **+71 testów** (886 → 957 w `web-devtools`), trzy nowe adaptery,
poprawka rozpoznawania w czwartym. Typecheck czysty.

---

## 9. Podsumowanie oceny

To jest dojrzały kawałek pracy — lepiej rozwarstwiony niż większość tego, co
powstaje wokół Mermaida. Trzy rzeczy zasługują na wyróżnienie: rozdzielenie
modelu od składni (dzięki czemu kolejne języki są tanie), zachowywanie
nierozpoznanych linii (dzięki czemu można temu powierzyć plik) i weryfikacja
zapisu cudzym parserem (dzięki czemu wiadomo, że działa naprawdę).

Największe braki nie są tam, gdzie się ich spodziewasz. **Import z kodu i eksport
są w gruncie rzeczy zbudowane** — leżą w `packages/devtools`, są wystawione przez
backend i czekają na jeden most o długości ~150 linii. Natomiast to, co realnie
psuje codzienne używanie, jest małe i nudne: utrata układu po zamknięciu notatki,
brak zapamiętanego trybu i możliwość rozjechania diagramu, którego edytor nie
rozumie.

Zrobiłbym najpierw te nudne rzeczy.
