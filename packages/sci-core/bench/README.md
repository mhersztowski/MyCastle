# Pomiary czasu całkowania

```bash
pnpm --filter @mhersztowski/sci-core build
node bench/solvers.mjs
```

Uruchamiane **ręcznie**, nie jako test: czasy zależą od maszyny, więc próg
w teście albo byłby tak luźny, że niczego nie pilnuje, albo migotałby na cudzym
laptopie. Zmianę, która przyspiesza kosztem poprawności, wyłapią testy rzędu
metody (`src/numeric/rzadMetody.test.ts`) i cross-walidacja ze SciPy.

## Zmierzone (MacBook, Node 20, etap 8)

| przebieg | przed | po | zysk |
|---|---|---|---|
| rk4, 200 tys. kroków, prawa strona w JS | 42,7 ms | 23,9 ms | ×1,8 |
| verlet, 24 zmienne, 100 tys. kroków | 80,2 ms | 56,1 ms | ×1,4 |
| dopri5, rtol 1e-12, t ≤ 2000 | 390,9 ms | 294,6 ms | ×1,3 |

Zysk pochodzi z jednej zmiany: bufory przydzielone raz zamiast czterech–siedmiu
tablic na każdy krok. Wyniki prawej strony są **kopiowane** do tych buforów —
bez tego solver zakładałby po cichu, że `f` nigdy nie zwraca tej samej tablicy
dwa razy, a prawa strona licząca pochodne do własnego bufora jest całkowicie
legalna. Kopiowanie n liczb kosztuje 3 %.

## Czego pomiar nie potwierdził

Plan zakładał `Float64Array` zamiast zwykłych tablic. **Zmierzone: jest
wolniejszy** — 61,0 ms wobec 43,8 ms dla stanu o 24 zmiennych i 46,7 ms wobec
43,8 ms dla 2400 zmiennych. V8 trzyma tablice samych liczb jako
`PACKED_DOUBLE_ELEMENTS`, co dorównuje tablicom typowanym, a dostęp do tych
drugich ma własny narzut. Zmiana kosztowałaby publiczny typ `State`, czyli każdy
skrypt w każdym dokumencie — za spowolnienie.

## Co naprawdę decyduje o czasie

Dwie rzeczy, obie większe niż wszystkie mikrooptymalizacje razem:

1. **Wybór metody.** To samo wahadło: `rk4` ze stałym krokiem 10⁻⁴ liczy się
   23,9 ms, `dopri5` z tolerancją 10⁻⁹ — **1,2 ms**. Dwadzieścia razy mniej
   pracy przy lepszej kontroli błędu, bo krok idzie za zjawiskiem.
2. **Koszt wyrażeń.** Ten sam układ przez graf wzorów to 93,8 ms, a z prawą
   stroną napisaną w JS — 23,9 ms. Cztery piąte czasu zjada wywoływanie wyrażeń
   skompilowanych z LaTeX-a, nie solver.
