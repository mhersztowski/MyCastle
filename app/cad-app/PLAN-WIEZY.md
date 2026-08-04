# Plan: więzy i parametry w szkicu (i dalej)

Dokument roboczy. Opisuje, co się zmieni **dla osoby rysującej**, a nie tylko
w kodzie.

## O co chodzi w jednym akapicie

Dziś szkic to zbiór linii i okręgów o wpisanych na sztywno współrzędnych.
Więzy istnieją, ale uruchamiają się tylko w chwili dodania — potem rysunek znów
jest „martwy". Po tych zmianach szkic zaczyna **pamiętać intencję**: że te dwa
boki mają być równe, że ta linia jest pozioma, że ta odległość wynosi tyle, ile
mówi parametr. Przeciągnięcie jednego punktu przelicza całą resztę tak, żeby
wszystkie te warunki dalej były spełnione.

To jest różnica między rysunkiem a modelem.

---

## Etap 1 — parametry i wyrażenia

**Co zobaczysz:** w wymiarze zamiast liczby `40` można wpisać `dlugosc * 2`.
Nad rysunkiem stoi lista parametrów z suwakami; przesunięcie suwaka przerysowuje
geometrię.

**Co trzeba zrobić:**
- wyciągnąć istniejący język wyrażeń z Rysika (`expr.ts`) do osobnego pakietu —
  dziś potrafi już liczyć na wielu parametrach naraz i zna funkcje geometryczne
  (`sind`, `cosd`, `atan2`);
- wpierw obłożyć go testami na obecne zachowanie, bo to ręcznie pisany parser
  i błąd w kolejności działań nie krzyknie, tylko po cichu policzy inaczej;
- pozwolić, żeby wartość wymiaru była wyrażeniem, a nie tylko liczbą;
- wykrywać zapętlenia (`bok` zależy od `dlugosc`, a `dlugosc` od `bok`)
  **w chwili wpisywania**, a nie przy liczeniu — komunikat jest wtedy zrozumiały,
  a nie objawia się jako puste pole.

**Skąd wiadomo, że działa:** zmiana jednego parametru przestawia wszystkie
wymiary, które się do niego odwołują; wpisanie zapętlonego wyrażenia daje
komunikat wskazujący pętlę.

---

## Etap 2 — przeciąganie z więzami

Najważniejsza część i najbardziej widoczna.

**Co zobaczysz:** chwytasz punkt myszą i ciągniesz. Rysunek „idzie za ręką", ale
**nie łamie** tego, co zostało ustalone: linia pozioma zostaje pozioma, odległość
50 mm zostaje 50 mm, a to, co nie jest niczym związane, przesuwa się swobodnie.
Punkt całkowicie związany nie rusza się wcale i widać to od razu — nie da się go
złapać.

**Co trzeba zrobić:**
- przeciąganie to **nie** jest wpisanie nowych współrzędnych. To dołożenie
  tymczasowego warunku „bądź tam, gdzie kursor" o niższej ważności niż warunki
  zapisane w szkicu — i przeliczenie całości. Dzięki temu solver sam decyduje,
  co ustąpi;
- liczyć od poprzedniego wyniku, nie od zera. Inaczej przy każdym drgnięciu myszy
  geometria potrafi „przeskoczyć" w inne rozwiązanie tych samych równań;
- ograniczyć częstotliwość przeliczania, żeby przy dużym szkicu ruch pozostał
  płynny;
- kiedy nie da się spełnić warunków — powiedzieć to. Dziś solver po cichu
  rezygnuje i geometria zostaje w miejscu, co wygląda jak zepsute przeciąganie.

**Skąd wiadomo, że działa:** przeciągnięcie końca linii poziomej przesuwa go
w poziomie, a nie odchyla linii; przeciągnięcie punktu z wymiarem 50 mm obraca
odcinek wokół drugiego końca, zamiast go rozciągać.

---

## Etap 3 — ile jeszcze zostało swobody

**Co zobaczysz:** pasek stanu mówi „szkic niedookreślony: 3 stopnie swobody"
albo „w pełni określony". Elementy, które można jeszcze przesunąć, są w innym
kolorze niż te ustalone. Gdy dodasz warunek sprzeczny z istniejącym, program
wskazuje **oba** winne, zamiast odmówić bez wyjaśnienia.

**Co trzeba zrobić:**
- policzyć, ile niezależnych warunków nałożono na ile zmiennych — to wynika
  z macierzy, którą solver i tak buduje;
- rozróżnić „za mało warunków" (rysunek się chwieje) od „za dużo"
  (warunki się wykluczają);
- pokazać to na rysunku kolorem, a nie tylko liczbą w rogu.

**Po co to:** to jest jedyna informacja, która mówi rysującemu, czy skończył.
Bez niej nie wiadomo, czy szkic jest gotowy, czy tylko „na oko dobrze wygląda".

---

## Etap 4 — dosuwanie jako zapisana intencja

**Co zobaczysz:** rysując blisko końca innej linii, widzisz podpowiedź i po
puszczeniu myszy punkty **zostają połączone na stałe** — nie tylko dosunięte.
Przy rysowaniu prawie poziomej linii program proponuje warunek „pozioma".

**Co trzeba zrobić:**
- rozdzielić dwie rzeczy, które dziś są jednym: dosuwanie do siatki jest
  chwilową korektą (nie zostawia śladu), a dosunięcie do końca albo środka
  innego elementu to **propozycja trwałego warunku**;
- dosuwać tylko tam, gdzie została swoboda. Punkt związany warunkiem i tak
  wróci na swoje miejsce, więc dosuwanie go wygląda jak usterka.

---

## Etap 5 — trzeci wymiar (później)

**Co zobaczysz:** w scenie 3D da się powiedzieć „ta bryła 10 cm nad tamtą, osie
równolegle" i to przetrwa przesunięcie tej pierwszej.

**Co trzeba wiedzieć zawczasu:** to nie jest to samo, co szkic 3D. W scenie
wiąże się **całe obiekty** (ich położenie i obrót), a nie pojedyncze punkty.
Solver jest ten sam, ale opis jest inny: sześć liczb na obiekt zamiast trzech
na punkt. Dlatego ten etap jest na końcu — będzie sprawdzianem, czy to, co
powstanie wcześniej, jest naprawdę ogólne, czy tylko dobrze dopasowane do 2D.

---

## Czego ten plan nie zmienia

- Rysowanie bez więzów działa jak dotąd. Kto nie chce warunków, ich nie dodaje
  i nic mu nie przeszkadza.
- Istniejące szkice otwierają się bez zmian — więzów w nich nie ma, więc nie ma
  czego przeliczać.
- Skład tekstu, interfejsy i pozostałe zastosowania **nie są** częścią tego
  planu. Wchodzą dopiero wtedy, gdy zgłosi się drugi chętny na ten sam rdzeń —
  wcześniej „uniwersalność" byłaby zgadywaniem.

## Kolejność i dlaczego taka

Etap 1 jest pierwszy, bo jest tani i od razu użyteczny. Etap 2 jest największy
i to on decyduje, czy całość ma sens — bez przeciągania więzy pozostają
ciekawostką. Etap 3 daje rysującemu wiedzę, czy skończył. Etap 4 sprawia, że
warunki powstają same, zamiast wymagać klikania w menu. Etap 5 sprawdza, czy
rdzeń jest ogólny.

Etapy 2 i 4 trzeba robić w tej kolejności: dosuwanie bez wiedzy o stopniach
swobody walczy z solverem.
