# @mhersztowski/layout

Jeden model danych, cztery sposoby wyliczenia pozycji. Pakiet nie ma zależności
i nie wie nic o Reakcie ani o rysowaniu.

Dwie piaskownice do porównywania trybów na własnych danych:

- **mycastle-web → Programming → Layout Lab** — płaskie prostokąty na SVG;
- **cad-app → Scene 3D → przycisk widżetów** — interfejs `@react-three/uikit`
  wewnątrz kanwy 3D. Widżety są tam wszystkie `positionType="absolute"`, więc
  yoga uikita nie liczy pozycji — robi to ten pakiet. Obszarem jest kanwa, dzięki
  czemu zwężenie panelu bocznego przelicza układ tak samo jak zmiana okna.

## Po co

Szkic CAD, interfejs użytkownika, scena 3D i skład tekstu odpowiadają na to samo
pytanie — „gdzie to leży i jak duże jest" — ale każde z nich rozwiązuje je inną
matematyką. Zwykle kończy się to czterema osobnymi implementacjami układu, które
nie umieją się ze sobą dogadać. Tutaj wspólny jest **model**, a matematyka jest
wyborem zapisanym w dokumencie (`doc.mode`).

## Cztery tryby

| tryb | co wyznacza pozycję | co potrafi | czego nie potrafi |
| --- | --- | --- | --- |
| `static` | wartość albo wyrażenie | wszystko opisać jedną liczbą lub wzorem; natychmiastowe | reagować na coś, czego nie ma we wzorze |
| `anchor` | ułamek wymiaru rodzica + odstęp | trzymać róg / rozciągać się przy zmianie okna (Godot, Unity) | ustawić coś względem **rodzeństwa** |
| `flow` | rodzeństwo w kontenerze | dzielić nadwyżkę (`grow`), zawijać kolumny i rzędy (flex) | pozwolić przeciągnąć dziecko — pozycja jest wyliczona |
| `constraint` | układ równań | ciągnąć myszą to, co i tak zostaje wyrównane; policzyć stopnie swobody | dać odpowiedź jednym przebiegiem — to iteracja |

Kluczowa różnica: w pierwszych trzech trybach kierunek liczenia jest z góry
ustalony (pozycja **wynika z** czegoś), więc obiekt wyliczony nie przyjmie ruchu
myszy — zostałby nadpisany przy najbliższym przeliczeniu. W trybie więzów kierunku
nie ma: „te dwa boki równo" nie mówi, który ma ustąpić. Stąd bierze się i możliwość
przeciągania, i sensowne pytanie *ile swobody zostało*.

## Wyrażenia

Wyrażenia liczy warstwa poniżej solverów (`resolveValues`), więc `a.x + a.w + margines`
działa tak samo w każdym trybie. Wyrażenie widzi:

- parametry dokumentu (`doc.vars`);
- wielkości innych kształtów: `panel.w`, `naglowek.y`;
- rodzica: `parent.w` — dla kształtów najwyższego poziomu jest nim `viewport`.

Kolejność liczenia bierze się z zależności, nie z kolejności zapisu. Cykl jest
zgłaszany razem ze wskazaniem pętli, a reszta dokumentu liczy się dalej.

Sam język wyrażeń jest dostępny osobno: `@mhersztowski/layout/expr` — bez modelu
i solverów, dla miejsc, które potrzebują tylko policzyć `dlugosc * 2`.

## Użycie

```ts
import { solveLayout, dragShape, snapToGrid, lit, expr } from '@mhersztowski/layout';

const wynik = solveLayout(doc);   // { rects, issues, dof? }
const podczasRuchu = dragShape(doc, 'b', snapToGrid(kursor, 10));
```

`dragShape` w trybie więzów nie wpisuje pozycji — daje solverowi punkt wyjścia
i szuka najbliższego stanu spełniającego wszystkie warunki. Dlatego ruch wygląda
jak „idzie za ręką": skoro poprawka jest najmniejsza z możliwych, rusza się tylko
to, co musi.

## Solver więzów

Gauss-Newton z tłumieniem (Levenberg), jakobian liczony różnicami skończonymi.
Obecne więzy są liniowe i jakobian dałoby się wypisać wprost, ale numeryczny
zostaje: pierwszy więz nieliniowy — odległość euklidesowa, kąt, styczność —
wchodzi wtedy jako jedna funkcja reszty, bez dopisywania pochodnych.

Tłumienie robi dwie rzeczy naraz: ratuje układ niedookreślony (macierz normalna
jest wtedy osobliwa) i spośród wielu rozwiązań wybiera najbliższe obecnemu.

Stopnie swobody to `liczba zmiennych − rząd jakobianu`. Sprzeczność jest zgłaszana
z nazwami **wszystkich** winnych więzów, bo przy sprzeczności zawsze winna jest
para, a nie pojedynczy warunek.

## Czego tu nie ma

- Kolejnego renderera. Pakiet zwraca prostokąty; rysowanie należy do hosta.
- Zawijania wierszy w `flow` (`wrap`) i przepływu tekstu — skład tekstu to
  programowanie dynamiczne, a nie żaden z tych czterech.
- Trzeciego wymiaru. Model jest prostokątny; rozszerzenie na `z` i obrót to
  zmiana wektora stanu w solverze więzów, a nie nowy silnik.
