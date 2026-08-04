# Projekt trzech symulacji (poz. 1, 3, 5 z `book/EKSPERYMENTY.md`)

Dokument techniczny: jak zbudować te trzy eksperymenty w **osobnej aplikacji
3D**, która używa `sci-core` jako biblioteki obliczeniowej i ma własną fizykę
tam, gdzie `sci` nie sięga.

> **Poprzednia wersja tego dokumentu zakładała co innego** — że symulacje będą
> blokami `sim` osadzonymi w dokumentach bazy wiedzy. Przy własnej aplikacji
> wnioski wychodzą inne, i to nie w szczegółach: dwa widoki, które wcześniej
> wskazałem jako brakujące (`axis1d`, `scene2d`), **przestają być potrzebne**,
> bo aplikacja ma własny renderer. Zostawiam ślad po tej zmianie, bo pokazuje,
> jak mocno wybór obudowy przesuwa listę rzeczy do zrobienia.

## Gdzie przebiega granica

Jedno zdanie, z którego wynika reszta:

> **`sci-core` odpowiada na pytanie „co się dzieje", aplikacja 3D na „jak to
> wygląda".** Wszystko, co jest stanem w czasie, może iść przez `sci`.
> Wszystko, co jest pikselem, kamerą i materiałem, nie ma z `sci` nic wspólnego.

`sci-core` jest **czystą biblioteką** — zero Reacta, trzy zależności
(`compute-engine`, `mathjs`, `sucrase`). Da się go zaimportować z dowolnej
aplikacji w monorepo przez `workspace:*` i nic z warstwy dokumentu nie przyjdzie
razem z nim.

## Co warto wziąć z `sci` nawet przy własnej fizyce

Siedem rzeczy, w kolejności od najbardziej do najmniej oczywistej.

### 1. `Trajectory.at(t)` — bufor między krokiem fizyki a klatką

To jest **najważniejszy element spięcia** i on jeden uzasadnia sięgnięcie po
`sci` nawet w aplikacji z własnym integratorem.

Solver liczy w swoich krokach — adaptacyjnych, nierównych, czasem bardzo
rzadkich tam, gdzie nic się nie dzieje. Renderer pyta o stan **co klatkę**,
w chwilach, których solver nigdy nie policzył. `Trajectory` rozwiązuje to
wyszukiwaniem binarnym po próbkach plus interpolantem solvera:

```ts
const stan = trajektoria.at(czasSceny);          // dowolne t, nie tylko próbki
const y = trajektoria.value('y_k', czasSceny);   // jedna zmienna
```

W kodzie stoi wprost komentarz „renderer pyta co klatkę" — ta klasa była pisana
pod ten przypadek.

**Pułapka, w którą wpadłem, sprawdzając to.** `Trajectory` bierze interpolanty
jako **trzeci argument konstruktora** i bez nich schodzi do interpolacji
liniowej między próbkami. Rzut poziomy przez `dopri5` na dwie sekundy:

```
próbek solvera: 5
y(0,7 s) bez interpolantów: 7,0874 m
y(0,7 s) z interpolantami:  7,5974 m
analitycznie:               7,5974 m
```

**Pół metra błędu** — bo solver, widząc ruch wielomianowy, słusznie zrobił tylko
cztery kroki, a cięciwa między nimi ścina parabolę. Na wykresie z gęstą siatką
punktów tego nie widać; na scenie 3D odczytywanej co klatkę widać jako spłaszczony
tor.

Wniosek praktyczny: **zawsze przekazuj interpolanty**, a `dopri5` zwraca je
w wyniku obok `samples`:

```ts
const r = dopri5(f, y0, [0, 2], { stateNames: ['x','y','u','w'] });
const traj = new Trajectory(r.samples, r.stateNames, r.interpolants);  // ← trzeci argument
```

To jest dokładnie ten przypadek, przed którym ostrzega komentarz w kodzie
`Trajectory` — i najwyraźniej łatwo go przeoczyć, skoro przeoczyłem go przy
pisaniu tego akapitu.

### 2. Zdarzenia z wyznaczoną chwilą, a nie wykryte po fakcie

```ts
findEventTime(...)  // → EventHit { t, y, index, stopped }
```

Różnica jest zasadnicza dla twoich trzech pozycji: „kula minęła cel między
klatką 41 a 42" to za mało, żeby narysować **moment trafienia**. `sci` zwraca
chwilę zdarzenia wyznaczoną, a nie zgadniętą, plus stan w tej chwili — więc
scena może zatrzymać się dokładnie tam, gdzie trzeba, i pokazać liczbę.

`EventSpec` ma też `apply`, czyli podmianę stanu (odbicie, przeskok), i regułę,
że zero na początku przedziału nie liczy się jako zdarzenie — bez tego każde
odbicie meldowałoby się w kółko.

### 3. Jednostki i wymiary

```ts
parseQuantity('9,81 m/s^2'); toSI(...); sameDimension('N', 'kg*m/s^2');
```

Pisząc własną fizykę łatwo pomylić metry z centymetrami i zobaczyć to dopiero
jako dziwną scenę. Sprawdzanie wymiarów przy wejściu danych kosztuje jedną
linijkę i wyłapuje klasę błędów, których renderowanie nie pokaże.

### 4. Stałe fizyczne (CODATA)

```ts
CONSTANTS.g_n  // 9,80665 m/s²
```

Z regułą, że stała wchodzi jako domyślna **tylko przy zgodnym wymiarze** — więc
`G` w twoim kodzie nie stanie się po cichu stałą Catalana.

### 5. Niezmienniki — kontrola, czy twój integrator nie kłamie

```ts
measureInvariant(...)  // energia, pęd, moment pędu wzdłuż trajektorii
describeInvariant(report)
```

Jeżeli piszesz własny krok całkowania, to jest jedyny tani sposób, żeby
zauważyć, że jest za duży. **Energia, która narasta, jest zwykle jedynym
sygnałem** — wykres wygląda przy tym zupełnie zdrowo. Przy scenie 3D jest
jeszcze gorzej, bo ładna animacja uwiarygodnia błędny wynik.

### 6. Badanie zbieżności

```ts
studyConvergence(...); richardson(...)
```

Do jednorazowego sprawdzenia, czy twój integrator ma rząd, który myślisz, że ma.
Nie wchodzi do pętli renderowania — uruchamiasz raz, w teście.

### 7. `compileGraph` — jeśli chcesz, żeby wzory z bazy sterowały sceną

To jest opcja, nie konieczność, ale ciekawa: bloki ` ```formula ` z dokumentów
podręcznika dają się skompilować do modelu **poza jakimkolwiek dokumentem**:

```ts
const model = compileGraph(buildGraph([parseFormulaBlock('rzut', tekstBloku)]));
const wynik = model.run(wartości, [0, 2], 0.001);
```

Zysk: zmiana wzoru w dokumencie 4-3 zmienia zachowanie sceny w aplikacji, bez
duplikowania fizyki w dwóch miejscach. To jest teza całego modułu `sci` —
„dokument jest warstwą obliczeniową" — i przy osobnej aplikacji działa tak samo.

Koszt: model z grafu obsługuje układy ODE o niewielkiej liczbie zmiennych stanu.
Do kolizji brył i więzów się nie nadaje i nie udaje, że się nadaje.

## Czego nie brać

`ModelViews`, `SimBlock`, `ScriptBlock`, `ReaderView`, `useModelRunner` —
to jest warstwa **dokumentu**: React, panele suwaków, sześć widoków dobieranych
z wymiarów. W aplikacji 3D z własnym rendererem nie ma po nie sięgać.

Wyjątkiem, który warto obejrzeć, jest `worker/protocol` z `sci-core`: przez
granicę wątku idzie **opis modelu**, a nie model. Jeżeli twoja aplikacja będzie
liczyć w workerze, ten protokół jest gotowym wzorem, jak to rozciąć.

## Dwa tryby czasu — i dlaczego dla tych trzech wystarczy prostszy

**Tryb offline:** policz całą trajektorię, potem odtwarzaj. Daje przewijanie,
zatrzymanie, porównanie dwóch przebiegów obok siebie i **powtarzalność**.
`sci-core` jest w tym mocny.

**Tryb on-line:** krok fizyki co klatkę. Konieczny, gdy użytkownik wpływa na
układ w trakcie ruchu.

Dla twoich trzech pozycji **offline wystarcza w całości**, i to nie z lenistwa:

- strzelec — parametry ustawiasz **przed** strzałem, potem chcesz przewijać,
- winda — profil jazdy jest znany z góry,
- migawki — chodzi wprost o pokazanie **całej historii naraz**.

Przeliczenie jest tanie (dwa punkty przez dwie sekundy to mikrosekundy), więc
„interaktywność" robi się przez **przeliczenie od nowa przy każdej zmianie
suwaka**, a nie przez krok on-line. Dodatkowa korzyść: możesz narysować cały tor
naprzód, czego tryb on-line z definicji nie umie.

---

## Poz. 5 — Migawki i trzy wykresy

### Fizyka

Trywialna, ale to jest zaleta: bierzesz ją wprost z `sci`, bez pisania
integratora.

```ts
const model = compileGraph(buildGraph([parseFormulaBlock('kin', `
@ode
@state x, v
@d x = v
@d v = a
@init x = x_0, v = v_0
@vars x: m, v: m/s, a: m/s^2, x_0: m, v_0: m/s, t: s`)]));
```

Sprawdzone uruchomieniem: kompiluje się bez uwag, parametry to `a`, `x_0`, `v_0`.

### Scena

Najprostsza z trzech i **nie potrzebuje 3D**: oś, kulka, znaczniki. Jeżeli
robisz jednolitą aplikację 3D, to jako płaszczyzna w scenie — ale wtedy kamera
powinna stać prostopadle i nie dawać się obracać, bo perspektywa psuje odczyt
odległości, a odczyt odległości jest tu całą treścią.

Modele: sfera (kulka), walec albo linia (oś), płaskie znaczniki. Nic więcej.

**Rzecz, która robi robotę:** znaczniki co **stały odstęp czasu**, nie odległości.
Wtedy ich zagęszczenie samo pokazuje prędkość — i to jest cały sens „zdjęć
migawkowych" z rys. 3-5.

```ts
for (let t = 0; t <= T; t += 0.2) znaczniki.push(traj.value('x', t));
```

Wykresy $x(t)$ i $v(t)$ rysujesz w HTML obok kanwy 3D — nakładanie ich na scenę
niczego nie poprawia.

---

## Poz. 3 — Waga w windzie

### Fizyka

Dwie warstwy. Wskazanie wagi to zwykły wzór:

$$P = m(g + a)$$

Profil przyspieszenia — rozruch, jazda, hamowanie — to **logika, nie równanie**.
Tu jest granica, o której pisałem: `@then` w grafie zmienia zmienne stanu, a nie
parametry, więc profil schodkowy trzeba by przemycić jako fikcyjną zmienną. Przy
własnej aplikacji nie ma powodu tego robić — piszesz funkcję:

```ts
function a(t: number): number {
  if (t < t1) return +a_r;            // rozruch
  if (t < t2) return 0;               // jazda jednostajna
  if (t < t3) return -a_r;            // hamowanie
  return 0;
}
```

i całkujesz `dopri5` z `sci` albo własnym krokiem — układ jest dwuwymiarowy
($y$, $v$), więc jedno i drugie zadziała. Wariant „lina pęka" to jedno
zdarzenie z `EventSpec` i podmiana profilu na $-g$.

Wartość $g$ bierzesz z `CONSTANTS.g_n`, żeby nie wpisywać jej ręcznie.

### Scena

Kabina, człowiek, waga ze wskazówką albo wyświetlaczem. **3D ma tu sens**,
inaczej niż przy pozostałych dwóch: winda jest bryłą, w której się jest, a widok
z wnętrza kabiny (kamera na wysokości oczu) robi z tego coś, czego wykres nie
odda.

Modele: prostopadłościan kabiny z wyciętym przodem, prosta postać, waga jako
walec z tarczą. Materiały bez znaczenia — liczy się liczba na wadze i to, że
zmienia się w chwilach, w których zmienia się przyspieszenie.

**Warto pokazać dwie liczby naraz:** wskazanie wagi i wykres $a(t)$ z zaznaczoną
bieżącą fazą. Bez tego drugiego czytelnik widzi, że liczba skacze, ale nie widzi,
dlaczego.

---

## Poz. 1 — Strzelec i spadający cel

### Fizyka

Dwa niezależne ruchy pod tym samym przyspieszeniem — układ sześciu zmiennych
stanu, który `sci` liczy bez zająknięcia:

```
@state x_k, y_k, u, w, y_c, s
@d x_k = u      @d u = 0
@d y_k = w      @d w = -g
@d y_c = s      @d s = -g
```

Sprawdzone uruchomieniem: blok i graf bez uwag. Trafienie to zdarzenie
`x_k - d = 0` — i tu `findEventTime` daje ci **dokładną chwilę i stan**, więc
scena zatrzyma się w momencie spotkania, a nie klatkę za nim.

Można też policzyć to bez solvera, bo rozwiązanie jest zamknięte. Ale przez
`sci` dostajesz za darmo zdarzenie i trajektorię z interpolacją, a rachunek
i tak jest tani.

### Scena

**Tu 3D naprawdę pomaga**, choć ruch jest płaski — bo pozwala obejść scenę
i zobaczyć, że oba tory leżą w jednej płaszczyźnie, a to bywa mylące na
płaskim rysunku. Kamera domyślnie z boku (widok „książkowy"), z możliwością
obrotu.

Modele: lufa (walec), kula (mała sfera), cel (sześcian albo małpka, bo ten
eksperyment nazywa się w literaturze *monkey and hunter*), wysięgnik trzymający
cel, podłoże jako siatka.

### Warstwa dydaktyczna — bez niej to tylko dwa lecące punkty

Trzy elementy, w kolejności ważności:

1. **Suwak $g$ od 0 do 9,81.** Przy zerze cel wisi, kula leci prosto w niego
   i trafia. Przy 9,81 oba spadają i **też trafia**. To jest teza.
2. **Linia pomocnicza** od lufy do początkowego położenia celu, plus dwa
   odcinki pionowe pokazujące, że oba ciała są od niej odsunięte o **dokładnie
   ten sam** kawałek $\frac{1}{2}gt^2$. Ten element robi z demonstracji dowód.
3. **Suwak prędkości wylotowej.** Punkt spotkania się przesuwa, trafienie
   zostaje — czyli dokładnie zdanie, które pisze Resnick.

Dwa duchy poprzednich strzałów (półprzezroczyste tory) pozwalają porównać
przypadki bez przełączania.

---

## Co z tego wynika dla `sci`

**Mniej, niż wynikało poprzednio.** `axis1d` i `scene2d` były potrzebne tylko
dlatego, że renderowaniem miał zajmować się `ModelViews`. Przy własnej aplikacji
znikają z listy.

Zostaje jedna rzecz, o którą warto `sci` uzupełnić, i jest nią **to samo
ograniczenie, które wyszło przy blokach**: zakresy parametrów. `rangeFor()`
w `compileGraph.ts` daje każdemu suwakowi `min: 0`:

```ts
function rangeFor(value) { const max = Math.abs(value) * 5; return { min: 0, max, ... } }
```

Przy własnym UI możesz to zignorować (sam ustawiasz zakresy kontrolek), ale
jeżeli chcesz brać `model.parameters` jako gotowy opis panelu — a to jest
kuszące i sensowne — to ujemne przyspieszenia i położenia wymagają, żeby
`ParamSchema` umiał zejść poniżej zera. Pół dnia.

Poza tym: **nic**. Solvery, zdarzenia, interpolacja, jednostki, stałe
i niezmienniki są gotowe do użycia z zewnątrz i nie wymagają zmian — sprawdzone
importem z `dist`: wszystkie trzynaście rzeczy z tej listy jest dostępnych poza
Reactem i poza warstwą dokumentu.

Jedna rzecz do rozważenia po stronie ergonomii: skoro pominięcie interpolantów
psuje odczyt o pół metra i nic o tym nie mówi, `Trajectory` mogłaby przyjmować
**cały wynik solvera** zamiast trzech osobnych argumentów:

```ts
Trajectory.from(dopri5(f, y0, span, opts))   // nie do pomylenia
```

To dziesięć linijek i usuwa błąd, który sam popełniłem.

## Podział na pakiety, gdybym to układał

```
app/fizyka-3d/            ← nowa aplikacja (wzorem demo-scene-3d, Vite)
  src/scena/              ← core-scene3d albo własny R3F
  src/fizyka/
    zSci.ts               ← modele z compileGraph + dopri5 + Trajectory
    wlasna.ts             ← to, czego sci nie obejmuje
  src/spiecie/
    useTrajektoria.ts     ← Trajectory.at(t) ⇄ zegar sceny
```

Warstwa `spiecie` jest cała twoja i jest mała — to kilkadziesiąt linii, które
tłumaczą czas sceny na czas symulacji i wyciągają stan. Cała reszta to albo
gotowy `sci`, albo gotowy `core-scene3d`, albo fizyka, którą i tak chcesz pisać
sam.
