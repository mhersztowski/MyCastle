/**
 * generate-fixtures.mjs — regeneracja odniesień ze SciPy.
 *
 * Eksportuje układy z dokumentów bazy wiedzy, oddaje je skryptowi Pythona i
 * zapisuje trajektorie jako golden fixtures. Uruchamiane **ręcznie**, przy
 * zmianie modeli — testy tylko porównują z tym, co tu powstało.
 *
 * Osobne uruchomienie jest celowe: gdyby fixture powstawał w trakcie testu,
 * porównywalibyśmy wynik z samym sobą i cała cross-walidacja byłaby pozorna.
 *
 * Użycie:
 *   node validation/generate-fixtures.mjs [ścieżka-do-pythona]
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { parseFormulaBlock, exportScenario } from '../dist/index.js';

const uruchom = promisify(execFile);
const here = dirname(new URL(import.meta.url).pathname);
const python = process.argv[2] ?? 'python3';

const DOKUMENTY = join(here, '..', '..', 'sci-blocks', 'dokumenty');
const FIXTURES = join(here, 'fixtures');
const TYMCZASOWE = join(here, '.scenario.json');

/**
 * Które układy porównujemy i z jakimi parametrami.
 *
 * Lista jest jawna, a nie skanowana: cross-walidacja ma sens dla układów ODE o
 * ustalonych parametrach, a dobór parametrów jest decyzją — chodzi o zakres, w
 * którym zjawisko jest ciekawe, nie o pierwszy z brzegu.
 */
const UKLADY = [
  {
    dokument: 'wahadlo.md',
    formula: 'pendulum-ode',
    parameters: { g: 9.80665, L: 1, theta_0: 0.4, m: 1 },
    tSpan: [0, 8],
  },
  {
    dokument: 'rezonans.md',
    formula: 'oscylator-ode',
    parameters: { k: 10, m: 1, beta: 0.15, F_0: 1, Omega: 3.1, omega_0: Math.sqrt(10) },
    tSpan: [0, 20],
  },
  {
    dokument: 'lorenz.md',
    formula: 'lorenz-ode',
    // Krótko: w chaosie dwa solwery rozjeżdżają się z definicji, więc
    // porównanie ma sens tylko na odcinku przed rozejściem się trajektorii.
    parameters: { sigma: 10, rho: 28, beta: 2.667, x_0: 1 },
    tSpan: [0, 3],
  },
];

/** Wyciąga treść bloku `formula:id` z dokumentu. */
async function wczytajBlok(dokument, id) {
  const markdown = await readFile(join(DOKUMENTY, dokument), 'utf8');
  const wzorzec = new RegExp('```formula:' + id + '\\n([\\s\\S]*?)```');
  const dopasowanie = wzorzec.exec(markdown);
  if (!dopasowanie) throw new Error(`Nie ma bloku formula:${id} w ${dokument}`);
  return parseFormulaBlock(id, dopasowanie[1]);
}

await mkdir(FIXTURES, { recursive: true });

for (const uklad of UKLADY) {
  const blok = await wczytajBlok(uklad.dokument, uklad.formula);
  const scenariusz = exportScenario(blok, {
    parameters: uklad.parameters,
    tSpan: uklad.tSpan,
    samples: 60,
  });

  if (scenariusz.issues.length) {
    console.error(`${uklad.formula}: ${scenariusz.issues.join('; ')}`);
    process.exitCode = 1;
    continue;
  }

  await writeFile(TYMCZASOWE, JSON.stringify(scenariusz, null, 2));
  const cel = join(FIXTURES, `${uklad.formula}.json`);

  try {
    const { stdout } = await uruchom(python, [join(here, 'solve_reference.py'), TYMCZASOWE, cel]);
    process.stdout.write(stdout);
  } catch (error) {
    console.error(`${uklad.formula}: ${error.stderr || error.message}`);
    process.exitCode = 1;
  }
}

await readdir(FIXTURES).then((pliki) => console.log(`Gotowe fixtures: ${pliki.join(', ')}`));
