# Bloki sci w edytorze Markdown — przegląd i kierunki rozwoju

Stan na 2026-08-24. Przegląd obejmuje bloki `formula`, `sim`, `simscript`,
`exercise`, `field`, `linalg`, `procedure`, `sci-plot` oraz bloki treści
(`figure`, `table`, `callout`, `law`) wraz z całym zapleczem w
`packages/sci-core` i `packages/sci-blocks`.

Przykłady demonstrujące każdy blok leżą w
`data/Minis/Users/marcin/drive/test-sci/` (dziesięć plików, zweryfikowane
parserami — patrz §9).

---

## 1. Skala i stan

| Miara | Wartość |
|---|---|
| `sci-core` | 12 415 linii kodu / 63 pliki, **815 testów** |
| `sci-blocks` | 8 429 linii kodu / 46 plików, **1 105 testów** |
| Dokumenty przykładowe w pakiecie | 62 pliki `.md` |
| Cross-walidacja ze SciPy | 6 fixtures (lorenz, orbita, oscylator, wahadło, rzut) |

Wszystkie testy zielone. To jest, licząc kodem i pokryciem, **największy
spójny podsystem w tym repozytorium** — więcej niż CAD-owy rdzeń i więcej niż
diagramy.

---

## 2. Co jest zbudowane, blok po bloku

### `formula:id` — wzór

Rdzeń wszystkiego. Blok jest jednocześnie tym, co czytelnik widzi, i tym, co
liczy symulacja. Pierwsza linia to matematyka w **LaTeX-u** (decyzja opisana
w `parseFormula.ts:13` — `2 pi sqrt(L/g)` parsuje się na `2i·p·q·r·s·t·(L/g)`,
bo `pi` to `p·i`), dalej dyrektywy `@`.

Pięć rodzajów węzła: `definition`, `ode`, `pde`, `linalg`, `relation`.
Dyrektyw jest ~30, w tym `@state`/`@d`/`@init` (dynamika), `@when`/`@then`/`@stop`
(zdarzenia), `@invariant` (wielkość, która ma zostać stała), `@solver`/`@tol`,
`@vars` (jednostki), `@derivedFrom`/`@approximates`/`@specialCaseOf`/`@assume`
(miejsce w grafie wiedzy), `@strokes` (warunek początkowy z rysika).

Wizualna edycja wzoru przez **MathLive** — kursor chodzi po strukturze wzoru,
na dotyku jest klawiatura matematyczna, a źródłem prawdy zostaje LaTeX w pliku.

### `sim` — symulacja

Blok **niczego nie opisuje**: wskazuje na fizykę stojącą wyżej w tekście
i podaje wartości. Klucze: `model` (zjawisko z biblioteki), `formulas`
(zawężenie), `view` (narzucenie widoków), `expose` (które suwaki pokazać),
`duration`, plus wartości parametrów płasko.

Widok dobiera się **z wymiarów, nie z nazw** (`visualization.ts:6`): kąt +
długość → ramię obrotowe, dwie długości → tor 2D, zmienna i jej pochodna →
przestrzeń fazowa. To jest ta decyzja, dzięki której rdzeń nie zna żadnego
konkretnego zjawiska.

Solvery: `euler`, `rk4`, `verlet`, `dopri5` (krok adaptacyjny), `rosenbrock`
(układy sztywne). Do tego pomiar okresu (dwie metody, wybierane automatycznie
po rozrzucie odstępów — `period.ts:18`), widmo, niezmienniki, badanie
zbieżności metodą Richardsona.

### `simscript` — model w skrypcie

TypeScript w dokumencie, uruchamiany przez `sucrase` + `Function`. Kontrakt
identyczny z `sim`, więc widoki i suwaki to dosłownie ten sam kod. Zamysł jest
wyraźnie zapisany: **ścieżka awansu** — eksperyment zaczyna życie jako blok
w notatce, a po dopracowaniu przenosi się do biblioteki jako plik. Dlatego
TypeScript, a nie JS: typy są od pierwszej chwili.

Skrypt dostaje pod ręką rdzeń biblioteki (`defineModel`, solvery, `Trajectory`,
stałe CODATA, efemerydy planet), a nie dostaje `window`/`fetch` — świadomie,
żeby model dał się później przenieść do Web Workera bez niespodzianek. Autorzy
nie udają, że to piaskownica bezpieczeństwa, i dobrze robią.

### `exercise:id` — zadanie

Jeden blok, **trzy tryby wynikające z treści**, nie z nazwy:

1. `@answer` — autor **nie podaje odpowiedzi**, wskazuje wielkość z grafu;
   klucz liczy ten sam kod co symulację, a dane losuje ziarno z `@given`;
2. `@expected` — odpowiedź przepisana z podręcznika, blok **nie liczy nic**,
   a `statedVariant` wyłuskuje z niej wiodącą wielkość do porównania;
3. brak obu — zadanie jakościowe, oceniane samodzielnie.

Uzasadnienie tej decyzji (`parseExercise.ts:15`) jest trafne: osobny blok na
każdy przypadek dałby setkę bloków i setkę miejsc, w których trzeba pamiętać
o powtórkach.

Wpięcie w harmonogram: uproszczony SM-2, w którym mnożnik odstępu zależy
**od liczby użytych podpowiedzi**, nie tylko od poprawności. Do tego zapis
treści rozwiązania — tekstem albo pociągnięciami rysika — z przycinaniem
historii, bo plik postępów wędruje między telefonem a komputerem.

### `field` — pole na siatce

`@pde` z `@grid`/`@domain`/`@boundary`, jawny schemat różnic skończonych.
Dwa rzędy w czasie: `@d` (dyfuzja) i `@d2` (fala). **Kroku czasowego autor nie
podaje** — dobiera go solver z warunku stabilności, bo za duży krok nie daje
gorszego wyniku, tylko rozbiega się do nieskończoności.

Wynikiem są **klatki**, nie trajektoria. Równania liniowe w polu i laplasjanie
dostają szybką ścieżkę wykrywaną numerycznie (6× szybciej). Limit siatki to
128×128 z jawnym uzasadnieniem: powyżej symulacja przestaje nadawać się do
dokumentu, w którym czytelnik rusza suwakiem.

Warunek początkowy da się **narysować rysikiem** — i to jest jedno z lepszych
rozwiązań w całym pakiecie: pióro nie zostawia bitmapy, tylko listę pociągnięć
kompilowaną do zwykłego wyrażenia, które wraca do bloku `formula` jako
`@strokes`. Dokument dalej trzyma matematykę, a rysunek nie ma rozdzielczości.

### `linalg` — algebra liniowa

`@mat`/`@vec` (2D) albo `@mat3`/`@vec3` (3D) — **wymiar wynika z zapisu**,
autor pisze go raz i nie może się pomylić. Blok ma własny mały ewaluator, bo
`A · v` zależy od typów operandów, a silnik numeryczny sprowadziłby wszystko
do skalarów.

Jedna kanoniczna scena: siatka, kwadrat jednostkowy barwiony znakiem
wyznacznika, kolumny macierzy jako strzałki, kierunki własne jako proste.
Obrót, ścinanie, rzut i odbicie to **ustawienia tej samej sceny**, nie osobne
renderery. Wartości własne 2D ze wzoru zamkniętego, 3D z równania sześciennego
rozwiązanego Cardanem — bez iteracji.

Interakcja zamiast definicji do zapamiętania: chwytasz koniec strzałki i szukasz
położenia, w którym `Av` leży na `v`.

### `procedure` — procedura krokowa

Eliminacja Gaussa i Gram-Schmidt jako **przepisy, nie wzory**: jeden krok naraz,
z opisem, co zrobiliśmy i po co. Scena pokazuje stan po bieżącym kroku — przy
Gramie-Schmidcie to jest sedno, bo dopiero widok rzutu tłumaczy, skąd bierze się
prostopadłość.

### `sci-plot` — kalkulator wykresów

Najnowszy blok (jeszcze niezacommitowany). Rozpoznaje wiersze: jawne `y = f(x)`,
`x = f(y)`, funkcje nazwane, stałe (dostają suwak), punkty, krzywe uwikłane
(maszerujące kwadraty), nierówności. W pliku leży **wyrażenie, nie wynik jego
rozpoznania**, a wartości domyślne nie są zapisywane — te dwie zasady sprawiają,
że różnica w repozytorium pokazuje zmianę, a nie balast.

Jednostka kąta jest tu **znaczeniem zapisu**, nie ustawieniem widoku — dlatego
siedzi w dokumencie i wchodzi do kompilacji.

### Bloki treści

`figure` (obraz albo krzywa liczona ze wzoru), `table` (z podpisem
i identyfikatorem — w tomie jest 27 tablic, do których tekst odsyła po numerze),
`callout` (nasz komentarz, odróżnialny od przepisanej książki), `law` (pozycja
katalogu praw, która **wygląda jak zapowiedź**, gdy nie ma jeszcze treści).

---

## 3. Trzy decyzje architektoniczne warte zachowania

**1. Dokument jest warstwą obliczeniową.** Nie „notatka z osadzonym wykresem",
tylko jedno źródło, z którego wynikają naraz: złożony wzór, symulacja,
wyprowadzenie krok po kroku i klucz odpowiedzi zadania. Konsekwencja praktyczna:
nie ma stanu, który mógłby się rozjechać, bo nie ma drugiej kopii.

**2. Rdzeń nie zna żadnego konkretnego zjawiska.** Widok dobiera się z wymiarów,
stała fizyczna wchodzi jako domyślna **tylko przy zgodnym wymiarze** (inaczej
`\sigma` Lorenza dostałaby stałą Stefana-Boltzmanna), a rodzaj zadania wynika
z treści. Każde miejsce, w którym rdzeń rozpoznawałby nazwę `theta`, byłoby
regresją.

**3. Pakiet nie zna hosta.** `registerSciBlocks(register)` to całe wpięcie;
rozpoznawanie pisma wchodzi portem `(obraz, tryb) => zapis`, a fabryka workera
przychodzi z zewnątrz, bo tylko host wie, jak zbudować workera w swoim
bundlerze. Dzięki temu te same bloki działają w edytorze, w trybie czytania
i w eksporcie statycznym.

---

## 4. Weryfikacja — mocna strona, którą warto rozbudować

Trzy poziomy, wszystkie działające:

1. **Analityczny** — tam, gdzie znamy rozwiązanie zamknięte.
2. **Cross-walidacja ze SciPy** — ten sam układ całkowany niezależnym
   silnikiem (DOP853, ciasne tolerancje). `latexToPython` tłumaczy
   z **MathJSON**, nie z zapisu ascii, a scenariusz niesie punkty kontrolne,
   żeby rozjazd tłumaczenia wyszedł **przed** całkowaniem i nie udawał błędu
   solvera. Fixtures powstają osobnym poleceniem, nigdy w teście — inaczej
   porównywalibyśmy wynik z samym sobą.
3. **Niezmienniki i zbieżność** — `measureInvariant` mierzy, czy wielkość,
   która miała zostać stała, została; `studyConvergence` liczy rząd metody
   z zagęszczania kroku.

To jest poziom rzetelności, jakiego nie ma większość narzędzi tego typu.
Sześć fixtures to jednak mało jak na 62 dokumenty — patrz §7.

---

## 5. Znalezione tarcia i braki

Kolejność według tego, jak często będą przeszkadzać, nie według trudności.

### 5.1. Trzy różne sposoby wiązania bloku z jego matematyką

- `sim` widzi **wszystkie** bloki `formula` w dokumencie (zawężenie: `formulas`);
- `field` i `linalg` szukają bloku o **dokładnie tym samym id** (`field:cieplo`
  ↔ `formula:cieplo`);
- `exercise` deklaruje wzory przez `@uses`.

Trzy konwencje na jedno pojęcie „skąd ten blok bierze matematykę". Komunikat
błędu jest dobry („Nie ma wzoru pola »x« w tym dokumencie"), ale autor musi
pamiętać, która reguła obowiązuje gdzie. **Rekomendacja:** ujednolicić w stronę
`field`/`linalg` (id = id) z opcjonalnym `@uses`, a `sim` bez `formulas`
zostawić jako zgodność wsteczną.

### 5.2. Jednostki w blokach `sim` — pułapka bez ostrzeżenia w edytorze

Wartość parametru trzeba podać **z jednostką** (`"k": "4 N/m"`). Zapis
`"k": 4` daje uwagę „Wartość 4 nie ma jednostki, a oczekiwano N/m" — słuszną,
ale widoczną dopiero po zbudowaniu modelu, w małym tekście pod blokiem.
Potknąłem się o to, pisząc przykłady do tego przeglądu, mimo że czytałem kod.

**Rekomendacja:** dopisywać jednostkę automatycznie przy pierwszym zbudowaniu
(wartość liczbowa + jednostka z `@vars` jest jednoznaczna) albo pokazać to jako
poprawkę jednym kliknięciem. Uwaga w tekście jest właściwa dla niezgodności
wymiaru, nie dla braku, który da się uzupełnić.

### 5.3. `simscript` edytuje się w `<textarea>`

`ScriptBlock.tsx:119` — zwykły `textarea`, bez podświetlania i bez podpowiedzi,
choć komentarz obok mówi o „ściądze z API, tym samym tekście, który host
wstrzykuje do Monaco". Dla bloku, którego **cała racja bytu** to pisanie kodu
z typami przed awansem do biblioteki, to jest najsłabsze ogniwo: TypeScript bez
sprawdzania typów w miejscu pisania to TypeScript tylko z nazwy.

**Rekomendacja:** Monaco z `SCRIPT_API_TYPES` jako lib — mechanizm istnieje
w projekcie (edytor Automate, Hydra Studio), więc to wpięcie, nie budowa.

### 5.4. Zero eksportu wyników

Nie ma sposobu, żeby wyjąć z bloku dane (CSV) ani obraz (PNG/SVG). `grep` po
`csv|download|toBlob|toDataURL` w `sci-blocks` zwraca jedno trafienie — i to
w `InkCanvas`, do wysłania rysunku do rozpoznania.

To boli w dwóch scenariuszach, które są dokładnie tym, po co ktoś buduje taką
bazę: „wstawię ten wykres do sprawozdania" i „policzę to sam w Pythonie, żeby
sprawdzić". **Rekomendacja:** pobranie PNG/SVG z każdego płótna i CSV
z `Trajectory` — obie rzeczy są tanie, bo dane i tak są w pamięci.

### 5.5. `procedure` obsługuje tylko przypadek 2×2

`ProcedureSpec` przyjmuje macierz `[[number, number], [number, number]]` i dwa
wektory 2D. Dla wprowadzenia to wystarcza, ale eliminacja Gaussa pokazuje swój
sens dopiero przy 3×3 (dwa kroki eliminacji, wybór elementu głównego). Skoro
`matrix3` i `compileLinAlg3` już istnieją, rozszerzenie jest naturalne.

### 5.6. Bloki liczące nie mówią, ile kosztują

`useModelRunner` mierzy `elapsedMs` i wie, czy liczy worker, czy wątek
interfejsu — ale dokument z ośmioma symulacjami nie pokazuje nigdzie sumy.
Przy bazie, która ma 62 dokumenty i rośnie, „dlaczego ta strona muli" będzie
pytaniem powtarzalnym. Dane są zbierane; brakuje ich pokazania.

### 5.7. Cross-walidacja pokrywa 6 z 62 dokumentów

Fixtures są dla lorenza, orbity, oscylatora, wahadła i rzutu. Reszta dokumentów
— w tym wszystkie pola PDE i cała algebra liniowa — nie ma zewnętrznego
drugiego zdania. Dla PDE to szczególnie warte uwagi, bo jawny schemat różnic
skończonych ma warunki stabilności, których błędne wyliczenie objawia się
dopiero na gęstszej siatce.

---

## 6. Uwagi o użyteczności i preferowanym stosowaniu

### Który blok kiedy

- **`formula` + `sim`** — wtedy, gdy zjawisko *jest* równaniem i chcesz, żeby
  czytelnik ruszył parametrem. To jest tryb domyślny i najmocniejszy.
- **`simscript`** — gdy równanie nie wystarcza: zderzenia, warunki logiczne,
  pętle po obiektach, dane z tablic. Nie używać go do rzeczy, które są układem
  ODE — tracisz wtedy wyprowadzenie, graf wiedzy i cross-walidację.
- **`sci-plot`** — gdy chodzi o **kształt funkcji**, a nie o zjawisko. Wykres
  paraboli nie potrzebuje grafu wzorów ani jednostek, a `sim` zmusiłby do obu.
- **`field`** — tylko dla zjawisk, w których treścią jest **obraz**, a nie
  liczba. Dyfuzja i fala tak; ruch punktu materialnego nie.
- **`linalg` / `procedure`** — matematyka, w której treścią jest geometria
  albo droga, nie wynik. Przy `procedure` warto pamiętać, że wartością jest
  komentarz do kroku, więc dokument bez tekstu wokół traci połowę sensu.

### Rzeczy, które warto powiedzieć autorowi wprost

Trzy pułapki, na które natknąłem się, pisząc przykłady — wszystkie są opisane
w kodzie, ale żadna nie jest widoczna z poziomu edytora:

1. **`@relation` musi stać w pierwszej linii bloku.** Postawione po wzorze
   powoduje, że wzór ląduje wśród „nierozpoznanych linii", a blok zgłasza
   „równanie nie ma treści" — komunikat mylący, bo treść jest, tylko została
   przeczytana jako dyrektywa.
2. **Wartości w `sim` z jednostką** (§5.2).
3. **`law` wymaga `@source`** nawet wtedy, gdy pozycja nie ma jeszcze treści.
   To akurat słuszne (zapowiedź bez wskazania miejsca jest bezużyteczna) i
   komunikat mówi to wprost.

Wniosek ogólniejszy: **te bloki mają dobre komunikaty błędów, ale nie mają
dokumentacji składni dostępnej w miejscu pisania.** Podpowiedź dyrektyw przy
wpisywaniu `@` w bloku `formula` byłaby prawdopodobnie największą pojedynczą
poprawą użyteczności — większą niż jakikolwiek nowy rodzaj bloku.

### Czego nie robić

- **Nie dokładać rodzajów bloków, dopóki wiązanie z §5.1 nie jest jedno.**
  Dwunasty blok z trzynastą konwencją to koszt, który płaci autor dokumentu.
- **Nie iść w WebGPU dla pól.** Decyzja jest już podjęta i uzasadniona
  liczbami (96×96 w 72 ms, 128×128 w 226 ms), a większe siatki przestają być
  ilustracją w dokumencie.
- **Nie robić z `simscript` piaskownicy.** Kod autora dokumentu ma tyle samo
  uprawnień co autor — udawanie inaczej dałoby fałszywe poczucie
  bezpieczeństwa przy realnym koszcie.

---

## 7. Kolejność prac

> **Stan na 2026-08-24: wszystkie cztery etapy wykonane.** Szczegóły przy
> każdym punkcie; odstępstwa od planu opisane wprost.

**Etap 1 — usunąć tarcia autorskie — ✅ WYKONANE**

1. ✅ **Ściąga dyrektyw** zamiast autouzupełniania. Katalog (`formula/directives.ts`)
   jest **danymi**, a test czyta listę wprost ze źródła parsera i porównuje
   w obie strony — dyrektywa dodana bez opisu (albo odwrotnie) wywala test. To
   jedyny sposób, żeby ściąga pozostała prawdziwa dłużej niż tydzień.
   Podpowiadania w trakcie pisania nie robimy: wymagałoby przejęcia klawiatury
   edytora, w którym blok mieszka, a ryzyko (kursor, cofanie, zaznaczenie) jest
   większe niż zysk.
2. ✅ **Goła liczba znaczy wartość w jednostce z `@vars`.** Rygor `parseQuantity`
   zostaje w rdzeniu — zła jednostka to nadal błąd, bo cicha konwersja byłaby
   zgodą na bezsens.
3. ✅ **Monaco w `simscript`**, wstrzykiwane portem `setCodeEditor` — tak samo
   jak rozpoznawanie pisma i fabryka workera. Edytor waży kilka megabajtów, a
   bloki działają też w eksporcie statycznym; bez wstrzyknięcia zostaje pole
   tekstowe, czyli uczciwy tryb zapasowy.
4. ✅ **`@relation` działa niezależnie od miejsca w bloku** — nie tylko lepszy
   komunikat, ale naprawiona przyczyna. Przy przejściu na `relation` zbieramy
   z powrotem to, co zdążyło się rozejść: rozbiór na przypisanie i linie uznane
   za nierozpoznane.

**Etap 2 — wyjmowanie wyników — ✅ WYKONANE**

5. ✅ **PNG z płócien.** Obraz bierzemy z pierwszego płótna w kontenerze
   widoków, a nie z propa przeciąganego przez cztery renderery — widoki
   powstają dynamicznie z `suggestViews`, więc każdy nowy rodzaj widoku
   znaczyłby cztery zmiany. Rysujemy w podwójnej skali na białym tle:
   przezroczyste znika na ciemnym slajdzie razem z osiami.
6. ✅ **CSV z przebiegów i z klatek pola.** Wielkości o różnej liczbie próbek
   wyrównujemy po czasie — wielkość urwana zdarzeniem nie może przesuwać
   kolumn, bo wtedy plik kłamie o tym, co z czym się wiąże. Pola idą zapisem
   „długim" (`t, ix, iy, wartość`), który czyta każde narzędzie bez parsera.
7. ✅ **Koszt liczenia w pasku pod wykresem**, razem z informacją, czy liczy
   worker, czy wątek interfejsu.

**Etap 3 — ujednolicenie i domknięcie — ✅ WYKONANE**

8. ✅ **Jedna konwencja: identyfikator = identyfikator.** `sim:okres` zawęża do
   wzoru o tej nazwie **razem z jego zależnościami** (`@derivedFrom`) — samo
   zawężenie do jednego bloku byłoby regresją, bo graf bez wzoru pośredniego
   albo się nie skompiluje, albo weźmie brakującą wielkość za parametr. Samo
   `sim` widzi wszystkie wzory jak dotąd, żeby istniejące dokumenty nie
   wymagały poprawek. Komunikat o braku wzoru mówi teraz, **jak blok ma
   wyglądać**, i podpowiada najbliższą istniejącą nazwę — literówka jest
   najczęstszą przyczyną, a autor patrzy wtedy na blok wzoru i nie widzi w nim
   nic złego.
9. ✅ **Gauss dla dowolnego rozmiaru z wyborem elementu głównego.** Element
   główny wybieramy największy co do wartości bezwzględnej i **mówimy o tym
   w opisie kroku**: to nie jest szczegół numeryczny do przemilczenia, tylko
   miejsce, w którym widać różnicę między „metoda działa" a „metoda działa
   dokładnie".
10. ✅ **Cross-walidacja pól** — nowy scenariusz (`validation/pdeScenario.ts`),
    skrypt referencyjny liczący **metodą linii** w SciPy i test porównujący.

    Po drodze wyszły dwie rzeczy, obie warte zapisania:

    - **Błąd w skrypcie referencyjnym, nie w solverze.** W metodzie linii punkty
      brzegowe też są niewiadomymi i bez wyzerowania ich pochodnej zaczynają
      ewoluować według równania. Przy dyfuzji ledwo to widać, przy fali daje
      odbicie o złej fazie.
    - **Fala z gaussowską plamką nie nadaje się na przypadek walidacyjny.** Oba
      silniki rozjeżdżały się o 20–30%, a zagęszczenie siatki tego nie
      poprawiało. Rozstrzygnęło porównanie z **rozwiązaniem zamkniętym**: dla
      mody własnej `sin(πx)sin(πy)` oba trafiają w `cos(cπ√2·t)` — SciPy
      z błędem 0,03 pp, nasz schemat zbieżnie (2,2 → 1,1 → 0,5 pp dla siatek
      24, 48, 96). Rozjazd brał się z wysokich częstości przestrzennych stromej
      plamki, dla których każda dyskretyzacja ma własną dyspersję. Przypadkiem
      walidacyjnym jest więc moda własna: to sprawdza solver, a nie różnicę
      między siatkami.

    Doszedł też test **zbieżności**: sama tolerancja dobrana luźno przepuści
    błąd w schemacie, a dobrana ciasno wywali się przy zmianie siatki.

**Etap 4 — nowe możliwości — ✅ WYKONANE**

11. ✅ **Blok `compare`** — kilka przebiegów tego samego modelu na jednej osi
    i jednej skali. Uwagi z każdego przebiegu dostają jego etykietę: przy trzech
    przebiegach „Parametr X nie występuje" bez wskazania, którego dotyczy,
    zmusza do zgadywania.
12. ✅ **Powierzchnie `z = f(x, y)` w `sci-plot`.** Rozpoznanie sprawdza
    zależność od osi, a nie samą nazwę po lewej — `z = 3` musi zostać stałą,
    inaczej suwak `z` przestałby działać. Punkty nieokreślone zostają jako
    `NaN`: zero byłoby kłamstwem, bo płaska plama w środku wykresu wygląda na
    własność funkcji, nie na jej brak. Three.js wchodzi leniwie, jak
    w `LinAlgStage3D`.

---

## Bilans

| Pakiet | Testy przed | Testy po |
|---|---|---|
| `sci-core` | 815 | **880** |
| `sci-blocks` | 1 105 | **1 143** |
| `web-devtools` (etapy diagramów) | 809 | **957** |
| `mycastle-backend` | 281 (+32 nieuruchamiane) | **324** |

Typecheck `mycastle-web`, `web-devtools` i backendu czysty.

---

## 8. Podsumowanie oceny

To jest praca, w której najlepsze nie są funkcje, tylko **konsekwencja
w trzymaniu jednej tezy**: dokument nie ilustruje obliczeń, dokument *jest*
obliczeniem. Widać ją w każdym module — w tym, że widok wybiera się z wymiarów
a nie z nazw; w tym, że zadanie nie ma wpisanej odpowiedzi, tylko wskazanie na
graf; w tym, że rysunek rysika nie zostaje bitmapą, tylko wraca do wzoru jako
wyrażenie. Każde z tych rozstrzygnięć było łatwiejsze do zrobienia inaczej.

Weryfikacja stoi wyżej niż w większości narzędzi tego rodzaju: trzy poziomy,
z czego jeden to niezależny silnik, a fixtures powstają poza testem.

Braki nie są w silniku — silnik jest solidny. Są **w warstwie kontaktu
z autorem i z czytelnikiem**: składnia nie podpowiada się przy pisaniu,
wiązanie bloków ma trzy konwencje, a wyniku nie da się z bazy wyjąć ani jako
obrazka, ani jako danych. To są rzeczy tanie do zrobienia i to one decydują,
czy z bazy korzysta się codziennie, czy tylko się ją ogląda.
