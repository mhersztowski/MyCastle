# Cross-walidacja ze SciPy

Poziom 2 walidacji z raportu (§7). Testy analityczne łapią błędy solvera tam,
gdzie znamy rozwiązanie zamknięte — ale większość układów go nie ma. Tutaj
drugim zdaniem jest **niezależny silnik**: SciPy z adaptacyjnym DOP853,
całkujący ten sam układ wyeksportowany z tego samego dokumentu.

Żeby błąd przeszedł niezauważony, musiałby być identyczny w dwóch niezależnie
napisanych całkowaniach.

## Jak regenerować odniesienia

Fixtures powstają **osobnym poleceniem**, nie w trakcie testu — inaczej
porównywalibyśmy wynik z samym sobą.

```bash
# jednorazowo: środowisko z SciPy
python3 -m venv .venv-scipy && .venv-scipy/bin/pip install numpy scipy

# regeneracja po zmianie modeli
pnpm --filter @mhersztowski/sci-core build
cd packages/sci-core && node validation/generate-fixtures.mjs ../../.venv-scipy/bin/python
```

Testy same w sobie **nie potrzebują Pythona** — czytają gotowe pliki z
`fixtures/`. Brak fixture nie ucisza sprawdzenia: osobny test pilnuje, że
wszystkie odniesienia są obecne.

## Dlaczego punkty kontrolne

Wspólnym punktem obu dróg jest tłumaczenie wzoru z LaTeX-a na Pythona. Gdyby
tłumacz się mylił, porównanie trajektorii pokazałoby rozjazd — ale wskazywałoby
na solver, a wina byłaby gdzie indziej.

Dlatego scenariusz niesie `checkpoints`: wartości prawych stron policzone przez
silnik dokumentu w kilku stanach. Skrypt Pythona sprawdza je **przed**
całkowaniem i zatrzymuje się z jasnym komunikatem, jeśli się nie zgadzają.

## Zmierzone rozjazdy

Przy `dt = 1e-4`:

| układ | rozjazd | próg | margines |
|---|---|---|---|
| wahadło | 1,9·10⁻⁷ | 5·10⁻⁶ | ×26 |
| oscylator wymuszony | 1,9·10⁻⁷ | 5·10⁻⁶ | ×26 |
| Lorenz (t ≤ 3) | 4,1·10⁻⁶ | 1·10⁻⁴ | ×24 |

Progi są dobrane do **zmierzonych** różnic, nie „na oko": margines rzędu tysiąca
przepuściłby realny błąd. Sprawdzone wstrzyknięciem usterki — zmiana wagi w
kroku RK4 z `2` na `2.001` podniosła rozjazd do 3,9·10⁻³ i wywróciła wszystkie
trzy testy.

Chaos ma luźniejszy próg i krótszy przedział, bo dwa różne solwery rozjeżdżają
się tam wykładniczo z definicji zjawiska, nie z powodu błędu.
