/**
 * solvers.mjs — pomiar czasu całkowania.
 *
 * Uruchamiany ręcznie, nie jako test: czasy zależą od maszyny, więc próg
 * w teście albo byłby tak luźny, że nic nie pilnuje, albo zaczynałby migotać
 * na cudzym laptopie. Poprawności pilnują testy rzędu metody i cross-walidacja
 * — one wyłapią zmianę, która przyspiesza kosztem wyniku.
 *
 *   pnpm --filter @mhersztowski/sci-core build
 *   node bench/solvers.mjs
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  buildGraph, buildModel, compileGraph, dopri5, parseFormulaBlock, rosenbrock, rk4, verlet,
} from '../dist/index.js';

const here = dirname(new URL(import.meta.url).pathname);
const DOKUMENTY = join(here, '..', '..', 'sci-blocks', 'dokumenty');

function czas(opis, fn, powtórzeń = 3) {
  fn();
  let best = Infinity;
  for (let i = 0; i < powtórzeń; i += 1) {
    const start = performance.now();
    fn();
    best = Math.min(best, performance.now() - start);
  }
  console.log(`${opis.padEnd(42)} ${best.toFixed(1).padStart(7)} ms`);
}

const markdown = await readFile(join(DOKUMENTY, 'wahadlo.md'), 'utf8');
const blok = parseFormulaBlock('pendulum-ode', /```formula:pendulum-ode\n([\s\S]*?)```/.exec(markdown)[1]);
const model = compileGraph(buildGraph([blok]));

/** Ten sam układ raz przez graf wzorów, raz w czystym JS — różnica to koszt wyrażeń. */
const wahadlo = (t, [th, om]) => [om, -9.81 * Math.sin(th)];

czas('graf wzorów / rk4, 200k kroków', () => model.run({ g: 9.81, L: 1, theta_0: 0.4, m: 1 }, [0, 20], 1e-4));
czas('czysty JS / rk4, 200k kroków', () => rk4(wahadlo, [0.4, 0], [0, 20], { dt: 1e-4 }));
czas('dopri5, rtol 1e-9, t ≤ 20', () => dopri5(wahadlo, [0.4, 0], [0, 20], { rtol: 1e-9 }));
czas('dopri5, rtol 1e-12, t ≤ 2000', () => dopri5(wahadlo, [0.4, 0], [0, 2000], { rtol: 1e-12, atol: 1e-14 }));

const rlc = (t, [q, I]) => [I, (5 * Math.cos(1e4 * t) - 1e5 * I - q / 1e-6) / 0.01];
czas('rosenbrock, obwód sztywny', () => rosenbrock(rlc, [0, 0], [0, 0.005], { rtol: 1e-8 }));

const ciała = Array.from({ length: 12 }, (_, i) => ({
  mass: 1, x: Math.cos(i), y: Math.sin(i), vx: -Math.sin(i) * 0.3, vy: Math.cos(i) * 0.3,
}));
const nbody = buildModel('nbody', { bodies: ciała }).model;
czas('nbody, 12 ciał, 50k kroków', () => nbody.run({ G: 1, softening: 0.1 }, [0, 50], 1e-3));

const sprężyny = (t, x) => x.map((xi) => -xi);
czas('verlet, 24 zmienne, 100k kroków', () => verlet(sprężyny, new Array(24).fill(1), new Array(24).fill(0), [0, 100], { dt: 1e-3 }));
