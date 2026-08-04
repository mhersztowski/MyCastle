# Plan: domknięcie silnika fizyki naukowej w `sci-core`

Dokument roboczy. Opisuje, czym silnik obliczeniowy bazy wiedzy różni się od
silnika fizyki w grze i co trzeba dopisać, żeby ta różnica była prawdziwa,
a nie deklarowana.

## Teza

Silnik gry ma wyglądać wiarygodnie w 16 ms. Silnik naukowy ma dawać **wynik
z kontrolowanym błędem** — i umieć ten błąd pokazać. Wszystko poniżej wynika
z tego jednego zdania:

| | silnik gry | silnik naukowy |
|---|---|---|
| krok czasowy | stały, związany z klatką | adaptacyjny, sterowany tolerancją |
| integrator | semi-implicit Euler | RK45 / symplektyczny / implicit dla sztywnych |
| kolizje | 80% silnika, przybliżone | rzadkie, ale rozwiązywane dokładnie jako zdarzenia |
| kontrola błędu | brak | rdzeń systemu |
| jednostki | „1 unit ≈ metr" | pełne SI z analizą wymiarową |
| usypianie obiektów | optymalizacja | fałszowanie wyniku |

## Punkt wyjścia (stan na start planu)

Jest już zbudowane i działa:

- bloki `sim` (model z wzorów dokumentu) i `simscript` (model w TypeScripcie)
  — `sci-blocks/src/register.ts`, `SimBlock.tsx`, `ScriptBlock.tsx`
- wspólny kontrakt `PhenomenonModel` dla obu ścieżek — `graph/compileGraph.ts`,
  `model/defineModel.ts`
- solvery `euler` / `rk4` / `verlet` ze **stałym krokiem** — `numeric/solvers.ts`
- `Trajectory` z odczytem po czasie (interpolacja **liniowa**) — `numeric/trajectory.ts`
- jednostki SI i analiza wymiarowa na granicach — `units/quantity.ts`
- stałe CODATA — `units/constants.ts`
- zdarzenia `@when` / `@then` / `@stop` wykrywane **po kroku** — `graph/events.test.ts`
- walidacja krzyżowa ze SciPy — `validation/`

Czego brakuje — i to jest zakres tego planu:

1. adaptacyjnego kroku z tolerancjami
2. dense output (dziś `Trajectory.at()` interpoluje liniowo)
3. zdarzeń rozwiązywanych dokładnie, nie z dokładnością `dt`
4. metod dla układów sztywnych
5. **miary jakości wyniku** — dziś nie da się odpowiedzieć „czy to jest dobre"
6. analizy wyniku (energia, widmo, okres)
7. biblioteki nazwanych zjawisk (dziś fizyka może przyjść tylko z bloków `formula`)

---

## Etap 0 — miara jakości wyniku ✅ ZROBIONE

Pierwszy, bo staje się kryterium akceptacji dla etapów 1–3. Bez niego nie da się
wykazać, że nowy solver cokolwiek poprawia.

**0a. `numeric/convergence.ts`** — policz to samo z krokiem `h`, `h/2`, `h/4`;
z ilorazu różnic wyjdzie **rząd metody**, z ekstrapolacji Richardsona
**oszacowanie błędu** najgęstszego przebiegu. Działa bez rozwiązania
analitycznego, więc stosuje się do dowolnego modelu z dokumentu.
Test: RK4 → rząd ≈ 4, Verlet → ≈ 2, Euler → ≈ 1.

**0b. `numeric/invariants.ts` + dyrektywa `@invariant`** — autor deklaruje
wielkość, która ma zostać stała (energia, pęd, moment pędu). Silnik mierzy dryf
w procentach na okres i melduje. To jest ta rzecz, której silnik gry nie robi
nigdy.

**0c. panel w `BlockShell`** — „błąd ≈ 1e-7 · energia dryfuje 0,3 %/okres".
Czytelnik widzi jakość wyniku obok wyniku.

**Co powstało:**

- `numeric/convergence.ts` — `studyConvergence()` mierzy rząd metody
  i oszacowanie błędu bez znajomości rozwiązania; `richardson()` osobno.
- `numeric/invariants.ts` — `measureInvariant()` rozróżnia **stable /
  oscillation / drift**; `describeInvariant()` daje zdanie do panelu.
- `@invariant nazwa = wyrażenie` w `formula/parseFormula.ts` (z round-tripem)
  → mierzone automatycznie w `compileGraph`, wynik w `PhenomenonResult.invariants`.
- `ManualModelSpec.invariants` — ta sama ścieżka dla `simscript`.
- Przenoszenie raportu przez granicę workera (`worker/protocol.ts`).
- `sci-blocks/src/QualityPanel.tsx` wpięty w `ModelViews` pod widokami.
- `dokumenty/orbita.md` deklaruje energię właściwą i moment pędu.

**Czego się przy okazji dowiedzieliśmy:**

1. Solvery narastały czasem (`t += dt`), więc przedział [0, 10] kończył się na
   9.999999999999996. Nieszkodliwe przy samym całkowaniu, ale badanie zbieżności
   porównuje stany *w tej samej chwili* — poprawione na `t = t0 + i·dt`.
2. Wolny symbol w zwykłym wzorze staje się parametrem z suwakiem, bo graf widzi,
   że nikt go nie liczy. Niezmiennik stoi **poza grafem**, więc literówka dałaby
   po cichu NaN — stąd osobne sprawdzenie nazw.
3. Teza „Verlet trzyma orbitę lepiej niż RK4" jest prawdziwa dopiero **po tysiącu
   obiegów**. Przy 343 obiegach RK4 jest dokładniejszy (2,7e-10 wobec 6,2e-10) —
   jest przecież czwartego rzędu. Różnica leży w *rodzaju* błędu (drift kontra
   oscillation), nie w jego chwilowej wielkości, i to właśnie mierzy `trend`.

## Etap 1 — Dormand–Prince RK45 z adaptacyjnym krokiem ✅ ZROBIONE

- `numeric/dopri5.ts`: para 5(4) z FSAL, estymacja błędu na krok, sterowanie
  przez `rtol`/`atol`, odrzucanie kroków, `maxSteps`/`minStep` → `IntegrationError`.
- **Dense output** rzędu 4 (Hairer): `Trajectory` dostała opcjonalne
  `interpolants`, więc `at()` przestaje interpolować liniowo, gdy je ma.
- Z dokumentu: `@solver dopri5` (alias `rk45`) oraz `@tol 1e-9`.
- Nieudane całkowanie wraca jako `PhenomenonResult.error`, nie jako wyjątek —
  blok w dokumencie ma dalej stać na swoim miejscu i powiedzieć, co się stało.
- `ScriptApi` dostał `dopri5`, `measureInvariant`, `studyConvergence`.

*Decyzja:* napisane własne (~230 linii) zamiast `odex` z npm — `odex` to
Bulirsch–Stoer bez dense output w potrzebnej formie, a pakiet trzyma konwencję
„trzydzieści linii na metodę uczy więcej fizyki niż wrapper" (`solvers.ts`).

**Czego się przy okazji dowiedzieliśmy:**

1. **Tolerancja jest kontraktem „nie gorzej niż", a nie „najlepiej jak się da".**
   Zmierzone na oscylatorze: RK4 z dt = 0,01 daje błąd 4,5e-10, a dopri5
   z `rtol` = 1e-6 tylko 1,2e-6 — i to jest poprawne, bo o więcej nikt nie
   prosił. Zysk pojawia się przy **zmiennej skali czasowej**: na orbicie
   o mimośrodzie 0,7 adaptacja potrzebuje ponad 3× mniej wywołań prawej strony
   niż stały krok o tej samej dokładności. Na oscylatorze prawie żadnego —
   tam nie ma czego adaptować.
2. **Adaptacja psuje wykrywanie zdarzeń.** Spadek swobodny jest wielomianem
   stopnia 2, więc metoda piątego rzędu liczy go bezbłędnie, sterowanie widzi
   zero i rozciąga krok do granic możliwości — próg „y = 0" zostaje przestrzelony
   o cały krok (zmierzone: 3,1 s zamiast 1,0 s). Doraźnie ograniczamy `maxStep`,
   gdy blok ma `@when`, i mówimy o tym w `issues`. Właściwe rozwiązanie to etap 2.
3. Domyślny limit miliona kroków to w dokumencie kilka sekund zamrożonej strony,
   zanim padnie komunikat o sztywności. Dla bloków z dokumentu obniżony do 200 000.

## Etap 2 — zdarzenia jako rozwiązywanie równania ✅ ZROBIONE

- `numeric/events.ts`: `EventSpec` (funkcja `g`, kierunek, `stop`, `apply`),
  `crossesZero`, `findEventTime` — metoda **Illinois** (regula falsi z połowieniem
  zastałego końca), bo czysta bisekcja potrzebowałaby ~35 wywołań `g` na zdarzenie.
- `dopri5` przyjmuje `events`: po każdym zaakceptowanym kroku szuka miejsca
  zerowego **na dense output**, przycina krok do chwili zdarzenia, wykonuje
  `apply` i liczy dalej od tego punktu. Nie kosztuje to ani jednego dodatkowego
  kroku całkowania.
- `Trajectory.events` — chwile zdarzeń są wynikiem symulacji tak samo jak
  położenia, tylko odpowiadają na pytanie „kiedy".
- `compileComparison` w `formula/expression.ts`: `@when y < 0` rozkłada się na
  funkcję `y` i kierunek „w dół". Warunek złożony (koniunkcja) rozkładu nie ma —
  wraca wtedy do trybu przybliżonego i mówi o tym w `issues`.
- `dokumenty/rzut-ukosny.md` liczy się teraz metodą adaptacyjną; zasięg bez oporu
  zgadza się ze wzorem v₀²·sin 2α / g do sześciu miejsc.

**Zmierzone:** chwila lądowania w spadku swobodnym wychodzi 1,000000000 s
zamiast dawnych 3,1 s, i **nie zależy** ani od `rtol`, ani od kroku startowego.
Kolejne odbicia piłki (e = 0,8) wypadają w 1,0 · 2,6 · 3,88 · 4,904 s — dokładnie
ciąg geometryczny z rachunku.

**Czego się przy okazji dowiedzieliśmy:**

1. **Stan w chwili zdarzenia nie jest dokładnie na progu.** Jest nim z dokładnością
   szukania (~1e-11) i **z dowolnym znakiem**: piłka po odbiciu bywa o włos pod
   ziemią. Pierwsza wersja rozpoznawała „jestem na progu" przez `g === 0` i przez
   to gubiła każde kolejne odbicie. Trzeba jawnej flagi „to zdarzenie właśnie
   zaszło" i zajrzenia minimalnie w głąb następnego kroku.
2. **Interpolant nie może być domknięciem.** Model liczy się w workerze, a przez
   `postMessage` przechodzą wyłącznie struktury — funkcja ginęła na tej granicy
   i aplikacja czytała po cięciwie mimo że solver policzył lepiej. Dense output
   jest teraz zapisem współczynników (`Interpolant` + `evalInterpolant`), więc
   przeżywa podróż do workera razem ze zdarzeniami.
3. Krok przerwany zdarzeniem obowiązuje na krótszym odcinku, niż go policzono —
   stąd pole `scale` w interpolancie zamiast przeliczania współczynników.

## Etap 3 — układy sztywne ✅ ZROBIONE

- `numeric/linsolve.ts` — eliminacja Gaussa z wyborem elementu głównego. Osobno
  od `linalg/procedures.ts`, bo tamta zwraca **kroki z opisem** (treścią lekcji
  jest droga), a tu potrzeba samego wyniku setki razy na sekundę.
- `numeric/rosenbrock.ts` — **RODAS3** (4 stopnie, rząd 3(2), γ = ½, L-stabilna),
  jakobian z różnic skończonych albo podany przez autora, dense output Hermite'a.
- Wykrycie sztywności w `dopri5`: iloraz różnic dwóch ostatnich próbek pochodnej
  przybliża h·λ; przekroczenie granicy stabilności przez kilkanaście kroków
  z rzędu kończy się komunikatem **wskazującym metodę niejawną**.
- Z dokumentu: `@solver rosenbrock` (alias `stiff`, `implicit`).
- `dokumenty/uklad-sztywny.md` — nowy dokument o przetłumionym obwodzie (R = 100 kΩ).

**Zmierzone na tym obwodzie** (R = 100 kΩ, przedział 5 ms):

| metoda | czas | wynik |
|---|---|---|
| `rosenbrock` | 71 ms | amplituda prądu 5,00·10⁻⁵ A = U₀/R ✓ |
| `dopri5` | 2 ms | odmawia: „układ jest sztywny… użyj rosenbrock" |
| `rk4` (stały krok) | **1 ms** | **NaN**, bez słowa ostrzeżenia |

Ostatni wiersz jest najlepszym uzasadnieniem etapu 0, jakie się trafiło:
najszybsza metoda daje wynik, który nie jest liczbą, i sama z siebie nigdy
się do tego nie przyzna.

**Czego się przy okazji dowiedzieliśmy:**

1. **Rosenbrock wymaga postaci autonomicznej.** Bez włączenia czasu do stanu
   metoda gubi człon z ∂f/∂t i przestaje być rzędu drugiego dla równań
   z wymuszeniem — zmierzone na y' = −10⁶(y − cos t): błąd rzędu 10⁴ zamiast
   10⁻⁶. A wymuszenie to reguła w układach, dla których ta metoda powstała.
2. **Para 2(1) nie wystarcza.** Pierwsza wersja (ROS2) była poprawna, ale jej
   estymator rzędu pierwszego wymusza krok ~√tol: obwód RC o stałej czasowej
   mikrosekundy liczony przez sekundę wyczerpywał limit 200 tys. kroków. Kuszący
   skrót — przepuszczenie estymatora przez `I − γhJ` — obniża koszt stukrotnie
   i **jest ślepy na błąd w kierunku sztywnym**: solver meldował sukces przy
   błędzie 10⁻¹. Dopiero para 3(2) z RODAS3 ma estymator, który to unosi
   (730 próbek tam, gdzie ROS2 potrzebował 47 575).
3. **`err === 0` i `err = NaN` wymagają przeciwnych reakcji.** Oba solvery miały
   je w jednej gałęzi (`err > 0 ? … : MIN_FACTOR`), więc po dojściu do stanu
   ustalonego — gdzie błąd jest **dokładnie** zerem — krok był skracany aż do
   granicy i całkowanie kończyło się błędem. Wielomian niskiego stopnia daje
   dokładne zero, więc to nie był przypadek teoretyczny.
4. Współczynniki metody sprawdza się **pomiarem rzędu** (`studyConvergence`
   z etapu 0). Pierwsza wersja RODAS3 dawała rząd 1,09 zamiast 3 — brakowało
   mnożnika γ po prawej stronie. Żaden pojedynczy wynik by tego nie pokazał.

## Etap 4 — biblioteka zjawisk (rejestr modeli) ✅ ZROBIONE

- `models/registry.ts` — `registerModel` / `buildModel` / `knownModels`.
  Kluczowe rozróżnienie: **opcje** kształtują model (ile ciał, czy przybliżać
  małe kąty), **parametry** to suwaki. Wpis deklaruje nazwy swoich opcji, dzięki
  czemu blok `sim` zostaje płaski, a literówka w nazwie parametru nadal jest
  wyłapywana.
- `models/builtin.ts` — trzy zjawiska na start:
  - `oscylator` — swobodny, tłumiony i wymuszony w **jednym** modelu, bo to są
    wartości parametrów, nie osobne zjawiska; z deklaracją energii jako
    niezmiennika (przy c > 0 panel pokaże jej ubytek — to fizyka, nie usterka),
  - `wahadlo` — domyślnie **pełne** równanie; `smallAngle` włącza przybliżenie,
    żeby dało się pokazać oba obok siebie,
  - `nbody` — zjawisko, dla którego rejestr powstał: liczba równań wynika
    z liczby ciał, więc w dokumencie nie da się ich wypisać.
- `documentModel.ts` — `"model": "…"` w bloku `sim` wybiera bibliotekę; bez tego
  klucza wszystko działa jak dotąd.
- `dokumenty/trzy-ciala.md` — dokument pokazujący obie drogi naraz: wzory
  do czytania i sprawdzania rachunkiem, dwanaście równań ruchu z biblioteki.

**Czego się przy okazji dowiedzieliśmy:**

1. **Deklaracja niezmiennika musi widzieć wartości parametrów.** Energia
   oscylatora zależy od masy i stałej sprężystości, a te są znane dopiero
   w `run()`, nie w chwili budowy modelu. `ManualModelSpec.invariants` dostał
   więc trzeci argument z nastawami.
2. **Rejestr wbudowanych wymaga jawnego importu.** `registry.ts` nie może
   importować `builtin.ts` (cykl), więc plik z zjawiskami ładuje `index.ts` dla
   efektu ubocznego — a test, który importuje sam rejestr, musi zrobić to samo.
3. **Analiza wymiarowa nie odpuszcza jednostkom umownym.** `G: 1` w bloku jest
   odrzucane, bo parametr zadeklarowano w m³/(kg·s²) — trzeba napisać
   `"1 m^3/(kg s^2)"`. Brzydkie, ale jednoznaczne: „2" przy kącie może znaczyć
   stopnie albo radiany, i właśnie po to ta reguła istnieje.
4. **Konfiguracja Lagrange'a jest niestabilna** — i widać to w danych. Prędkości
   zaokrąglone do pełnych metrów na sekundę rozjeżdżają trójkąt o 0,7 % w ciągu
   półtora obiegu; z pięcioma cyframi po przecinku odchyłka spada poniżej promila.

**Nie zrobione, świadomie:** rzutu z oporem i Układu Słonecznego nie dokładano
do rejestru — oba mają już własne dokumenty zbudowane z wzorów, a tam, gdzie
dokument uczy o zjawisku, równania mają stać w tekście.

## Etap 5 — pełne API dla `simscript` ✅ ZROBIONE

- `ScriptApi` ma teraz cały rdzeń: `dopri5`, `rosenbrock`, `findEventTime`,
  `measureInvariant`, `studyConvergence` oraz **bibliotekę** (`buildModel`,
  `registerModel`). Bez tego autor skryptu pisałby własną pętlę Eulera i tracił
  wszystko, co przez cztery etapy zostało zmierzone.
- `defaultScriptApi()` — lista symboli jako **wartość**, nie tylko typ. Bez tego
  nie da się oprzeć testu na tym, co skrypt faktycznie dostaje.
- **Test spójności** deklaracji z API, w obie strony: każdy symbol ma deklarację
  i żadna deklaracja nie opisuje symbolu, którego nie ma.
- `SCRIPT_API_TYPES` rozszerzone o `Trajectory` (jako klasę — skrypt bywa po
  drugiej stronie granicy i składa trajektorię z próbek), `EventSpec`, solvery
  o stałym kroku i bibliotekę.
- `ScriptBlock` pokazuje ściągę „co jest dostępne w skrypcie" — **dosłownie te
  same deklaracje**, które host wstrzykuje do Monaco.

**Czego się przy okazji dowiedzieliśmy:**

1. **Test spójności zadziałał od razu**: sześć symboli (`euler`, `verlet`,
   `findEventTime`, `buildModel`, `registerModel`, `Trajectory`) było w API bez
   jednej linijki deklaracji. Dokładnie ten rozjazd, dla którego powstał — autor
   pisze funkcję, którą edytor podkreśla na czerwono, choć ona istnieje.
2. **Deklaracje żyły martwe.** `SCRIPT_API_TYPES` nie było używane nigdzie poza
   rdzeniem: blok w dokumencie ma zwykłe pole tekstowe, nie Monaco. Rdzeń może
   mieć najlepsze solvery świata — jeśli nikt nie wie, że są, każdy skrypt
   zacznie od własnej pętli.
3. **Backtick w komentarzu wewnątrz deklaracji zamyka template literal.** Cały
   plik przestawał się parsować; komunikat esbuilda wskazywał zupełnie inne
   miejsce.
4. **`return` na końcu wiersza kończy instrukcję** — skrypt złożony jako
   `` `return ${kod};` `` z kodem zaczynającym się od nowej linii zwracał
   `undefined`. Druga wspierana forma (przypisanie do `model`) jest na to
   odporna i to ona powinna być pokazywana w przykładach.

## Etap 6 — analiza wyniku ✅ ZROBIONE

- `analysis/spectrum.ts` — FFT radix-2 w miejscu, okno Hanninga, widmo
  amplitudowe w jednostkach sygnału (sinus o amplitudzie A daje prążek A),
  `dominantFrequency` z interpolacją paraboliczną przez trzy prążki.
- `analysis/period.ts` — okres z **przejść przez średnią** (dokładność rzędu dt²
  dzięki interpolacji chwili przejścia) oraz z widma; `periodOf` wybiera metodę
  po rozrzucie odstępów, bo to nie jest kwestia gustu: równe odstępy znaczą
  jedno drganie, nierówne — przebieg złożony.
- `ViewKind: 'spectrum'` — widok **na żądanie**, nie domyślny.
- Rysowanie widma w `ModelViews` z tych samych przebiegów, co wykres czasowy.
- `dokumenty/rezonans.md` pokazuje widmo i tłumaczy, co z niego odczytać.

**Zmierzone na modelu z biblioteki:** amplituda w rezonansie 2,5 m wobec wzoru
F₀/(c·ω₀) = 2,5; okres wahadła przy θ₀ = 2 rad o 37 % dłuższy od szkolnego
2π√(L/g) — zdanie z podręcznika, które dotąd trzeba było przyjąć na wiarę.

**Czego się przy okazji dowiedzieliśmy:**

1. **Przepróbkowanie jest obowiązkowe, nie opcjonalne.** Solver adaptacyjny
   zostawia próbki gęsto tam, gdzie rozwiązanie zakręca, a transformata wymaga
   równych odstępów. Sygnał prosto z solvera prawie nigdy nie nadaje się do FFT
   w postaci, w jakiej wyszedł.
2. **Widma nie da się dobrać z wymiarów.** Cała reszta widoków wynika z jednostek
   (kąt → ramię, długość → tor), ale o tym, czy widmo ma treść, decyduje
   **kształt rozwiązania** — a ten jest znany dopiero po policzeniu. Stąd widok
   na żądanie zamiast heurystyki, która myliłaby przy każdym rozpadzie
   wykładniczym.
3. **Model ręczny nie wypełniał `series` zmiennymi stanu**, a model z grafu tak.
   Wykres czasowy dla zjawiska z biblioteki wychodził przez to pusty — wyszło
   dopiero przy liczeniu widma z `series.x`. Kontrakt jest teraz domykany
   w `defineModel`, a nie w każdym modelu z osobna.

## Etap 7 — walidacja krzyżowa nowych metod ✅ ZROBIONE

- Scenariusz niesie teraz **metodę** referencyjną (`DOP853`/`Radau`/`LSODA`/`BDF`)
  i **zdarzenia**; `solve_reference.py` przekazuje jedno i drugie do `solve_ivp`.
- Trzy nowe układy — po jednym na metodę bez potwierdzenia z zewnątrz:
  orbita (verlet), obwód sztywny (rosenbrock, referencja Radau), rzut ukośny
  (dopri5 + zdarzenie).
- Zmierzone rozjazdy: 3,3·10⁻⁶ · 3,3·10⁻⁶ · 1,4·10⁻⁹; progi z marginesem ~30.
- **Chwila lądowania** porównana z SciPy: zgodność do ósmej cyfry, mimo że obie
  strony szukają miejsca zerowego zupełnie inną metodą (Brent kontra Illinois).
- `src/numeric/rzadMetody.test.ts` — pomiar rzędu obu metod adaptacyjnych.

**Czego się przy okazji dowiedzieliśmy:**

1. **Cross-walidacja jest ślepa na błędy współczynników w metodach
   adaptacyjnych.** Sanity check przez wstrzyknięcie usterki (`A21` = 1/4 zamiast
   1/5 w tablicy Dormanda–Prince'a) **nie wywrócił ani jednego testu** — ani
   jednostkowego, ani porównania ze SciPy. Sterowanie błędem po prostu skraca
   krok, aż wynik znów jest dokładny; płaci się pracą, której nikt nie mierzył.
   Dopiero pomiar rzędu przy wyłączonej adaptacji zbija wynik z 5,0 do 4,0.
   Regułą jest więc: **stały krok → wystarczy trajektoria, adaptacyjny → trzeba
   osobno mierzyć rząd.**
2. **Punkty kontrolne porównywały się bezwzględnie.** Dla orbity, gdzie
   przyspieszenie ma rząd 10¹⁴, ostatni bit podwójnej precyzji to 0,04 — i sama
   inna kolejność mnożeń między JS-em a Pythonem wystarczała, żeby odrzucić
   tłumaczenie idealnie poprawne. Porównanie jest teraz względne.
3. Zdarzenie kończące skraca przedział, więc `t_eval` poza chwilą zdarzenia nie
   ma odpowiednika w wyniku — fixture rzutu ma 53 punkty zamiast 60 i to jest
   poprawne zachowanie obu stron.

## Etap 8 — wydajność ✅ ZROBIONE

Jedyny etap, w którym nie chodzi o poprawność — i dlatego jedyny, który wolno
było robić dopiero teraz: każdą zmianę pilnują testy rzędu metody (etap 0)
i cross-walidacja ze SciPy (etap 7).

- Bufory przydzielone **raz** zamiast czterech–siedmiu tablic na krok
  w `euler`, `rk4`, `verlet` i `dopri5`.
- Wyniki prawej strony **kopiowane** do buforów: bez tego solver zakładałby po
  cichu, że `f` nigdy nie zwraca tej samej tablicy dwa razy. Kopiowanie n liczb
  kosztuje 3 % i zdejmuje pułapkę, która dawałaby błędny wynik bez ostrzeżenia.
- `bench/solvers.mjs` — powtarzalny pomiar, uruchamiany ręcznie.

| przebieg | przed | po | zysk |
|---|---|---|---|
| rk4, 200 tys. kroków | 42,7 ms | 23,9 ms | ×1,8 |
| verlet, 24 zmienne, 100 tys. kroków | 80,2 ms | 56,1 ms | ×1,4 |
| dopri5, rtol 1e-12, t ≤ 2000 | 390,9 ms | 294,6 ms | ×1,3 |

**Czego się przy okazji dowiedzieliśmy:**

1. **`Float64Array` jest wolniejszy** — 61,0 ms wobec 43,8 ms przy 24 zmiennych
   i 46,7 ms wobec 43,8 ms przy 2400. V8 trzyma tablice samych liczb jako
   `PACKED_DOUBLE_ELEMENTS`, co dorównuje tablicom typowanym, a te drugie mają
   własny narzut dostępu. Założenie z planu zostało **odrzucone pomiarem**;
   zmiana kosztowałaby publiczny typ `State`, czyli każdy skrypt w każdym
   dokumencie — za spowolnienie.
2. **Wybór metody bije wszystkie mikrooptymalizacje razem.** To samo wahadło:
   `rk4` ze stałym krokiem 10⁻⁴ liczy się 23,9 ms, `dopri5` z tolerancją 10⁻⁹ —
   **1,2 ms**. Etap 1 dał więc dwadzieścia razy więcej niż etap 8.
3. **Cztery piąte czasu zjadają wyrażenia, nie solver.** Ten sam układ przez graf
   wzorów to 93,8 ms, z prawą stroną w JS — 23,9 ms. Tam jest następne pole do
   pracy, gdyby kiedyś zabrakło szybkości.
4. Worker jest podpięty w aplikacji (`createModelWorker` w `KnowledgePage`
   i `CodeBlockWithLang`), więc ta część planu była już zrobiona — sprawdzone,
   a nie założone.

---

## Co dalej

Wszystkie osiem etapów zamkniętych. Naturalne kierunki, gdyby wracać:

- **Koszt wyrażeń** (punkt 3 wyżej) — cztery piąte czasu modelu z dokumentu.
- **Metody wyższego rzędu dla układów sztywnych** — RODAS3 wystarcza, ale
  RADAU5 dałby dokładność przy krokach o rząd dłuższych.
- **Zdarzenia w metodzie niejawnej** — dziś sprawdzane po kroku; dense output
  Hermite'a jest za słaby, żeby rozwiązywać je z tolerancją rozwiązania.


## Kolejność i zależności

```
0 (miara) ──► 1 (adaptacyjny) ──► 2 (zdarzenia) ──► 3 (sztywne)
                    │                                    │
                    └──────────► 7 (walidacja) ◄─────────┘
4 (biblioteka) ──► 5 (API skryptu)
6 (analiza) — niezależny, ale najlepiej po 1
8 (wydajność) — na końcu, po 0..3
```

Etapy 0–2 to rdzeń i większość roboty. Etap 4 daje najszybciej widoczny efekt
dla czytelnika dokumentów, więc można go przestawić przed 3.

## Zasady obowiązujące w każdym etapie

- **Test przed implementacją** (konwencja projektu). Fizyka daje darmowe wzorce:
  oscylator, spadek swobodny i orbita kołowa mają rozwiązania analityczne.
- Jednostki żyją na wejściu i wyjściu, **nigdy w pętli solvera**.
- Nowa metoda całkowania to osobna funkcja z tym samym interfejsem, nie
  przełącznik w środku istniejącej — wybór metody jest decyzją fizyczną.
- Komentarze mówią **dlaczego**, nie co.
