"""
solve_reference.py — niezależne rozwiązanie układu z dokumentu.

Drugi silnik cross-walidacji (raport §7, poziom 2). Czyta scenariusz
wyeksportowany przez sci-core, całkuje go SciPy i zapisuje trajektorię jako
golden fixture. Vitest porównuje potem swój wynik z tym plikiem.

Niezależność jest tu prawdziwa: po naszej stronie RK4 ze stałym krokiem, po tej
adaptacyjny solver z kontrolą błędu. Żeby błąd przeszedł niezauważony,
musiałby być identyczny w dwóch niezależnie napisanych całkowaniach.

Wspólnym punktem obu dróg jest tłumaczenie wzoru, dlatego **najpierw**
sprawdzamy punkty kontrolne. Rozjazd tam znaczy błąd w tłumaczeniu i jest
zupełnie inną diagnozą niż rozjazd trajektorii, który wskazywałby na solver.

Użycie:
    python3 solve_reference.py scenariusz.json fixture.json
"""
import json
import sys
from math import (  # noqa: F401 — nazwy są używane przez eval wyrażeń
    sin, cos, tan, asin, acos, atan, sinh, cosh, tanh,
    exp, log, log10, sqrt, fabs, pi, e,
)

import numpy as np
from scipy.integrate import solve_ivp

# Tolerancja dla punktów kontrolnych. Ostrzejsza niż dla trajektorii, bo tu
# porównujemy to samo wyrażenie policzone dwa razy — różnica powyżej progu
# zaokrągleń znaczy inny wzór, a nie inną metodę.
TOLERANCJA_KONTROLNA = 1e-9


def srodowisko(scenario, stan, t):
    """Zakres nazw widoczny dla wyrażeń: parametry, zmienne stanu i czas."""
    zakres = dict(scenario["parameters"])
    zakres.update(stan)
    zakres["t"] = t
    return zakres


def sprawdz_punkty_kontrolne(scenario):
    """Czy nasze tłumaczenie wzoru daje to samo, co silnik dokumentu."""
    for numer, punkt in enumerate(scenario["checkpoints"], start=1):
        zakres = srodowisko(scenario, punkt["state"], 0.0)

        for nazwa, oczekiwana in punkt["derivatives"].items():
            policzona = eval(scenario["derivatives"][nazwa], globals(), zakres)  # noqa: S307
            if abs(policzona - oczekiwana) > TOLERANCJA_KONTROLNA:
                raise SystemExit(
                    f"Punkt kontrolny {numer}: pochodna „{nazwa}” nie zgadza się.\n"
                    f"  dokument: {oczekiwana!r}\n"
                    f"  Python:   {policzona!r}\n"
                    f"  wyrażenie: {scenario['derivatives'][nazwa]}\n"
                    "To błąd tłumaczenia wzoru, nie solvera — porównanie trajektorii "
                    "nie miałoby sensu."
                )


def prawa_strona(scenario):
    """Funkcja `f(t, y)` dla `solve_ivp`, zbudowana z wyrażeń scenariusza."""
    nazwy = scenario["state"]

    def f(t, y):
        stan = dict(zip(nazwy, y))
        zakres = srodowisko(scenario, stan, t)
        return [eval(scenario["derivatives"][n], globals(), zakres) for n in nazwy]  # noqa: S307

    return f


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)

    with open(sys.argv[1], encoding="utf-8") as plik:
        scenario = json.load(plik)

    if scenario.get("issues"):
        raise SystemExit("Scenariusz ma uwagi: " + "; ".join(scenario["issues"]))

    sprawdz_punkty_kontrolne(scenario)

    t0, t1 = scenario["tSpan"]
    czasy = np.linspace(t0, t1, scenario["samples"])
    y0 = [scenario["initial"][n] for n in scenario["state"]]

    # Ciasne tolerancje: fixture ma być odniesieniem, więc jego własny błąd
    # numeryczny musi być o rzędy wielkości mniejszy niż różnica, której
    # szukamy między solverami.
    wynik = solve_ivp(
        prawa_strona(scenario), (t0, t1), y0,
        t_eval=czasy, method="DOP853", rtol=1e-11, atol=1e-12,
    )

    if not wynik.success:
        raise SystemExit(f"SciPy nie rozwiązał układu: {wynik.message}")

    fixture = {
        "id": scenario["id"],
        "state": scenario["state"],
        "parameters": scenario["parameters"],
        "initial": scenario["initial"],
        "tSpan": scenario["tSpan"],
        "solver": "scipy DOP853 rtol=1e-11 atol=1e-12",
        "t": [float(x) for x in wynik.t],
        "y": {n: [float(v) for v in wynik.y[i]] for i, n in enumerate(scenario["state"])},
    }

    with open(sys.argv[2], "w", encoding="utf-8") as plik:
        json.dump(fixture, plik, indent=2)
        plik.write("\n")

    print(f"{scenario['id']}: {len(wynik.t)} punktów → {sys.argv[2]}")


if __name__ == "__main__":
    main()
