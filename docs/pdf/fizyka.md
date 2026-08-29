---
title: "Termodynamika statystyczna"
subtitle: "Fragment rozdziału 4: rozkład Maxwella–Boltzmanna"
author: "Fragment testowy"
date: "2026"
lang: pl-PL
documentclass: book
classoption: [10pt, openany]
linestretch: 1.35
indent: true
toc: true
toc-depth: 3

# pandoc-crossref — etykiety po polsku
figureTitle: "Rys."
tableTitle: "Tab."
figPrefix: "rys."
# Bez eqnPrefix: równania numeruje LaTeX (\begin{equation}), a odsyłacze
# idą przez \eqref — pandoc-crossref wstawia po prefiksie spację, której
# nie da się wyłączyć, a polskie „wzór" trzeba odmieniać („ze wzorów 1.2").
tblPrefix: "tab."
secPrefix: "§"
---

\mainmatter

# Rozkład prędkości cząsteczek

Gaz doskonały opisujemy przez własności makroskopowe — ciśnienie, objętość,
temperaturę — a każda z nich jest średnią po ruchu miliardów cząsteczek. Ten
rozdział pokazuje, jak z założeń o ruchu pojedynczej cząsteczki wyprowadzić
rozkład prędkości w całym gazie, i dlaczego wynik ma kształt, który ma.
Zakładamy znajomość rachunku całkowego oraz pojęcia gęstości prawdopodobieństwa.

## Założenia modelu

Rozważamy gaz zamknięty w naczyniu o objętości $V$, złożony z $N$ jednakowych
cząsteczek o masie $m$. Przyjmujemy cztery założenia, z których każde ma
konsekwencję dla postaci wyniku:

1. Cząsteczki poruszają się swobodnie między zderzeniami.
2. Zderzenia są sprężyste — energia kinetyczna układu nie ubywa.
3. Żaden kierunek nie jest wyróżniony (izotropia).
4. Rozmiary cząsteczek są pomijalne wobec średniej drogi swobodnej.

Założenie trzecie jest tym, które najbardziej upraszcza rachunek: pozwala
zapisać rozkład jako funkcję samej wartości prędkości, bez zależności od
kierunku.

## Gęstość prawdopodobieństwa

Niech $f(v)\,\mathrm{d}v$ oznacza prawdopodobieństwo, że wybrana losowo
cząsteczka ma prędkość z przedziału $[v, v+\mathrm{d}v]$. Z założeń modelu
wynika, że funkcja ta ma postać

```{=latex}
\begin{equation}\label{eq:maxwell}
f(v) = 4\pi \left(\frac{m}{2\pi k_B T}\right)^{3/2} v^2
       \exp\!\left(-\frac{mv^2}{2k_B T}\right),
\end{equation}
```

gdzie $k_B$ to stała Boltzmanna, a $T$ — temperatura bezwzględna. Zależność \eqref{eq:maxwell} nazywamy **rozkładem Maxwella–Boltzmanna**.

Kształt tej funkcji wynika z iloczynu dwóch czynników działających przeciwnie.
Czynnik $v^2$ rośnie — bo im większa prędkość, tym więcej kierunków, którymi
cząsteczka może się poruszać z tą prędkością. Czynnik wykładniczy maleje — bo
duża prędkość znaczy dużą energię, a stanów o dużej energii jest w równowadze
mało. Iloczyn ma maksimum, i to maksimum jest tym, co widać na rys. \ref{fig:maxwell}.

```{=latex}
\begin{figure}[htbp]
\centering
\begin{tikzpicture}[scale=0.85]
  % osie
  \draw[->,thick] (0,0) -- (6.4,0) node[below left] {\small $v$ [m/s]};
  \draw[->,thick] (0,0) -- (0,3.9) node[left] {\small $f(v)$};

  % trzy krzywe: T = 300 K, 600 K, 1200 K (skalowane jakościowo)
  \draw[thick,domain=0:6.2,samples=120,smooth]
    plot (\x, {3.4*(\x/1.3)^2*exp(-(\x/1.3)^2)});
  \draw[thick,dashed,domain=0:6.2,samples=120,smooth]
    plot (\x, {2.4*(\x/1.9)^2*exp(-(\x/1.9)^2)});
  \draw[thick,dotted,domain=0:6.2,samples=120,smooth]
    plot (\x, {1.7*(\x/2.7)^2*exp(-(\x/2.7)^2)});

  % opisy krzywych
  \node[right] at (1.6,2.5) {\scriptsize $T_1$};
  \node[right] at (2.6,1.5) {\scriptsize $T_2 > T_1$};
  \node[right] at (4.0,0.85) {\scriptsize $T_3 > T_2$};

  % zaznaczenie prędkości najbardziej prawdopodobnej
  \draw[gray] (1.3,0) -- (1.3,1.25);
  \node[below] at (1.3,0) {\scriptsize $v_p$};
\end{tikzpicture}
\caption{Rozkład Maxwella--Boltzmanna dla trzech temperatur. Wzrost temperatury
przesuwa maksimum w prawo i obniża je: cząsteczek jest tyle samo, więc pole pod
każdą krzywą jest jednakowe.}
\label{fig:maxwell}
\end{figure}
```

## Trzy charakterystyczne prędkości

Z rozkładu \eqref{eq:maxwell} wyprowadza się trzy wielkości, które łatwo pomylić,
bo wszystkie mają wymiar prędkości i wszystkie zależą od $\sqrt{T/m}$.

**Prędkość najbardziej prawdopodobna** $v_p$ odpowiada maksimum funkcji.
Przyrównując pochodną do zera otrzymujemy

```{=latex}
\begin{equation}\label{eq:vp}
v_p = \sqrt{\frac{2k_B T}{m}}.
\end{equation}
```

**Prędkość średnia** $\bar{v}$ to wartość oczekiwana:

```{=latex}
\begin{equation}\label{eq:vsr}
\bar{v} = \int_0^\infty v f(v)\,\mathrm{d}v = \sqrt{\frac{8k_B T}{\pi m}}.
\end{equation}
```

**Prędkość średnia kwadratowa** $v_{\mathrm{rms}}$ wiąże się bezpośrednio
z energią kinetyczną, więc to ona pojawia się w równaniu stanu:

```{=latex}
\begin{equation}\label{eq:vrms}
v_{\mathrm{rms}} = \sqrt{\overline{v^2}} = \sqrt{\frac{3k_B T}{m}}.
\end{equation}
```

Zachodzi między nimi stały porządek, niezależny od gazu i temperatury:

$$
v_p < \bar{v} < v_{\mathrm{rms}},
$$

w stosunku $1 : 1{,}128 : 1{,}225$. Wynika on z asymetrii rozkładu — jego prawy
ogon jest długi, więc średnia leży na prawo od maksimum, a średnia kwadratowa
jeszcze dalej, bo podnoszenie do kwadratu wzmacnia wkład dużych prędkości.

: Prędkości charakterystyczne wybranych gazów w temperaturze 300 K {#tbl:predkosci}

| Gaz      | $M$ [g/mol] | $v_p$ [m/s] | $\bar{v}$ [m/s] | $v_{\mathrm{rms}}$ [m/s] |
|----------|------------:|------------:|----------------:|-------------------------:|
| $\mathrm{H_2}$ |        2,02 |        1571 |            1773 |                     1926 |
| He       |        4,00 |        1116 |            1259 |                     1368 |
| $\mathrm{N_2}$ |       28,01 |         422 |             476 |                      517 |
| $\mathrm{O_2}$ |       32,00 |         395 |             445 |                      484 |
| $\mathrm{CO_2}$ |       44,01 |        337 |             380 |                      412 |

@Tbl:predkosci pokazuje rzecz, która ma konsekwencje astronomiczne:
prędkość cząsteczek wodoru w temperaturze pokojowej jest porównywalna
z prędkością ucieczki z Księżyca (2380 m/s). Dlatego ciała niebieskie o małej
masie tracą lekkie gazy, a zachowują ciężkie.

## Związek z równaniem stanu

Ciśnienie gazu jest efektem zderzeń cząsteczek ze ściankami. Rozważmy ściankę
prostopadłą do osi $x$ o powierzchni $A$. Cząsteczka odbijająca się sprężyście
przekazuje jej pęd $2mv_x$. Sumując po wszystkich cząsteczkach i przechodząc do
średniej otrzymujemy

```{=latex}
\begin{equation}\label{eq:cisnienie}
pV = \tfrac{1}{3} N m \overline{v^2}.
\end{equation}
```

Podstawiając \eqref{eq:vrms} do \eqref{eq:cisnienie} dostajemy równanie stanu gazu
doskonałego:

```{=latex}
\begin{equation}\label{eq:stan}
pV = N k_B T.
\end{equation}
```

Warto zauważyć, co się właśnie stało: wielkość czysto makroskopowa —
temperatura, mierzona termometrem — okazała się miarą średniej energii
kinetycznej ruchu postępowego. To jest sedno interpretacji statystycznej.

### Ćwiczenia

**1.** `[10]` Wykaż, że stosunek $v_{\mathrm{rms}}/v_p$ nie zależy ani od masy
cząsteczki, ani od temperatury.

**2.** `[20]` Oblicz $v_{\mathrm{rms}}$ dla azotu w temperaturze 20 °C
i porównaj z prędkością dźwięku w powietrzu (343 m/s). Wyjaśnij, dlaczego obie
wielkości są tego samego rzędu.

**3.** `[25][M]` Wyprowadź wzór \eqref{eq:vsr}, całkując rozkład \eqref{eq:maxwell}.
Wskazówka: podstaw $u = mv^2/2k_BT$.

**4.** `[30][M]` Wykaż, że pole pod krzywą rozkładu jest równe jedności dla
każdej temperatury — to warunek normalizacji.

**5.** `[40][HM]` Wyprowadź rozkład Maxwella–Boltzmanna z rozkładu
kanonicznego, nie zakładając izotropii z góry, lecz wyprowadzając ją
z niezależności składowych prędkości.

## Słownik pojęć

**Gęstość prawdopodobieństwa** — funkcja $f(v)$, której całka po przedziale
daje prawdopodobieństwo trafienia w ten przedział. Wprowadzona w §1.2.

**Prędkość średnia kwadratowa** — pierwiastek ze średniej kwadratów prędkości,
$v_{\mathrm{rms}} = \sqrt{\overline{v^2}}$; wielkość wiążąca rozkład z energią
kinetyczną. Wprowadzona w §1.3.

**Rozkład Maxwella–Boltzmanna** — rozkład prędkości cząsteczek gazu doskonałego
w równowadze termodynamicznej, wzór \eqref{eq:maxwell}. Wprowadzony w §1.2.

**Stała Boltzmanna** — $k_B = 1{,}380649 \cdot 10^{-23}$ J/K; przelicznik między
temperaturą a energią. Wartość dokładna od redefinicji układu SI w 2019 roku.

## Uwaga o źródłach

Wartości liczbowe w @tbl:predkosci wyliczono ze wzorów \eqref{eq:vp}–\eqref{eq:vrms}
dla $T = 300$ K, z masami molowymi zaokrąglonymi do dwóch miejsc. Stała
Boltzmanna według definicji SI z 2019 roku. Nie podano tu odsyłaczy do
literatury — jest to fragment testowy, a nie praca wymagająca aparatu
bibliograficznego.
