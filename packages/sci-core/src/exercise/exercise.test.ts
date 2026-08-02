/**
 * Zadania: wariant z ziarna, klucz z grafu, sprawdzanie i podpowiedzi.
 *
 * Najważniejszy test w tym pliku to ten, który zmienia wzór w dokumencie i
 * sprawdza, że klucz odpowiedzi zmienił się sam. Na tym stoi cała teza raportu
 * o zadaniach: nie ma dwóch źródeł prawdy, bo nie ma drugiego miejsca z fizyką.
 */
import { describe, it, expect } from 'vitest';
import { parseFormulaBlock } from '../formula/parseFormula';
import { buildGraph } from '../graph/formulaGraph';
import { compileGraph } from '../graph/compileGraph';
import { parseExerciseBlock, serializeExerciseBlock } from './parseExercise';
import { exerciseVariant, checkNumeric, checkSymbolic } from './solveExercise';
import { buildHints } from './hints';

const WAHADLO = [
  ['ode', ['@ode', '@state theta, omega', '@d theta = \\omega',
    '@d omega = -\\frac{g}{L}\\sin(\\theta)', '@init theta = \\theta_0, omega = 0',
    '@vars g: m/s^2, L: m, theta_0: rad, theta: rad, omega: rad/s'].join('\n')],
  ['okres', ['T = 2\\pi\\sqrt{\\frac{L}{g}}', '@vars T: s, L: m, g: m/s^2',
    '@derivedFrom ode', '@assume male-katy'].join('\n')],
] as Array<[string, string]>;

const graphOf = (defs: Array<[string, string]>) =>
  buildGraph(defs.map(([id, body]) => parseFormulaBlock(id, body)));

const ZADANIE = parseExerciseBlock('okres-zadanie', [
  'Oblicz okres wahadła o długości $L$ przy przyspieszeniu ziemskim.',
  '@given L: 0.5..2 m step 0.1',
  '@answer T',
  '@tolerance 2%',
  '@level 1',
  '@uses okres',
].join('\n'));

describe('blok zadania', () => {
  it('czyta treść, dane i odpowiedź', () => {
    expect(ZADANIE.prompt).toContain('Oblicz okres');
    expect(ZADANIE.given).toEqual([{ name: 'L', min: 0.5, max: 2, unit: 'm', step: 0.1 }]);
    expect(ZADANIE.answer).toBe('T');
    expect(ZADANIE.tolerance).toBeCloseTo(0.02, 9);
    expect(ZADANIE.uses).toEqual(['okres']);
    expect(ZADANIE.issues).toEqual([]);
  });

  it('zadanie bez wskazanej odpowiedzi jest błędem', () => {
    expect(parseExerciseBlock('x', 'Policz coś.').issues.join(' ')).toMatch(/wielkość będącą odpowiedzią/);
  });

  it('odwrócony zakres jest błędem', () => {
    expect(parseExerciseBlock('x', ['Treść', '@given L: 5..1 m', '@answer T'].join('\n')).issues.join(' '))
      .toMatch(/odwrócony/);
  });

  it('round-trip zachowuje zapis', () => {
    expect(serializeExerciseBlock(ZADANIE)).toBe([
      'Oblicz okres wahadła o długości $L$ przy przyspieszeniu ziemskim.',
      '@given L: 0.5..2 m step 0.1',
      '@answer T',
      '@level 1',
      '@uses okres',
    ].join('\n'));
  });
});

describe('wariant z ziarna', () => {
  const model = () => compileGraph(graphOf(WAHADLO));

  it('to samo ziarno daje ten sam wariant', () => {
    const a = exerciseVariant(ZADANIE, model(), 42);
    const b = exerciseVariant(ZADANIE, model(), 42);
    expect(a.values.L).toBe(b.values.L);
    expect(a.expected).toBe(b.expected);
  });

  it('różne ziarna dają różne dane', () => {
    const wartosci = [1, 2, 3, 4, 5].map((seed) => exerciseVariant(ZADANIE, model(), seed).values.L);
    expect(new Set(wartosci).size).toBeGreaterThan(3);
  });

  it('dane mieszczą się w zadanym zakresie', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const { values } = exerciseVariant(ZADANIE, model(), seed);
      expect(values.L).toBeGreaterThanOrEqual(0.5);
      expect(values.L).toBeLessThanOrEqual(2);
    }
  });

  it('dane są zaokrąglone do kroku, żeby dało się je przeczytać', () => {
    // Bez przycięcia wychodzi „1.7000000000000002 m" — poprawny wynik mnożenia
    // zmiennoprzecinkowego i zupełnie nieczytelna treść zadania.
    for (let seed = 0; seed < 40; seed += 1) {
      expect(exerciseVariant(ZADANIE, model(), seed).shown.L).toMatch(/^\d+(\.\d)? m$/);
    }
  });

  it('klucz odpowiedzi liczy graf, nie autor', () => {
    const variant = exerciseVariant(ZADANIE, model(), 42);
    expect(variant.expected).toBeCloseTo(2 * Math.PI * Math.sqrt(variant.values.L / variant.values.g), 9);
    expect(variant.expectedUnit).toBe('s');
  });

  it('zmiana wzoru w dokumencie zmienia klucz odpowiedzi', () => {
    // To jest sedno: zadanie nie może się zestarzeć, bo nie ma własnej kopii
    // fizyki. Gdyby ktoś poprawił wzór okresu, klucz idzie za nim.
    const inny = compileGraph(graphOf([
      WAHADLO[0],
      ['okres', ['T = 4\\pi\\sqrt{\\frac{L}{g}}', '@vars T: s, L: m, g: m/s^2'].join('\n')],
    ]));
    const domyslny = exerciseVariant(ZADANIE, model(), 42);
    const zmieniony = exerciseVariant(ZADANIE, inny, 42);

    expect(zmieniony.expected).toBeCloseTo(domyslny.expected! * 2, 6);
  });

  it('dana spoza parametrów dokumentu jest zgłaszana', () => {
    const złe = parseExerciseBlock('x', ['Treść', '@given nieistnieje: 1..2', '@answer T'].join('\n'));
    expect(exerciseVariant(złe, model(), 1).issues.join(' ')).toMatch(/nie jest parametrem/);
  });

  it('odpowiedź będąca przebiegiem, a nie liczbą, jest zgłaszana', () => {
    const złe = parseExerciseBlock('x', ['Treść', '@answer theta'].join('\n'));
    expect(exerciseVariant(złe, model(), 1).issues.join(' ')).toMatch(/nie jest wielkością stałą/);
  });
});

describe('sprawdzanie odpowiedzi numerycznej', () => {
  const variant = () => exerciseVariant(ZADANIE, compileGraph(graphOf(WAHADLO)), 42);

  it('poprawna wartość z jednostką przechodzi', () => {
    const v = variant();
    expect(checkNumeric(`${v.expected!.toFixed(3)} s`, v, 0.02).verdict).toBe('correct');
  });

  it('wartość w innej jednostce tego samego wymiaru też przechodzi', () => {
    const v = variant();
    expect(checkNumeric(`${(v.expected! * 1000).toFixed(1)} ms`, v, 0.02).verdict).toBe('correct');
  });

  it('brak jednostki to osobny werdykt, nie zwykły błąd', () => {
    const v = variant();
    const result = checkNumeric(String(v.expected), v, 0.02);
    expect(result.verdict).toBe('wrong-unit');
    expect(result.message).toMatch(/jednostk/);
  });

  it('zły wymiar jest rozpoznany', () => {
    expect(checkNumeric('2 kg', variant(), 0.02).verdict).toBe('wrong-unit');
  });

  it('wartość poza tolerancją nie przechodzi', () => {
    const v = variant();
    expect(checkNumeric(`${v.expected! * 1.5} s`, v, 0.02).verdict).toBe('wrong');
  });

  it('bliski wynik dostaje inną wskazówkę niż zupełnie chybiony', () => {
    const v = variant();
    const bliski = checkNumeric(`${v.expected! * 1.03} s`, v, 0.02);
    const chybiony = checkNumeric(`${v.expected! * 10} s`, v, 0.02);
    expect(bliski.message).not.toBe(chybiony.message);
  });

  it('żadna odpowiedź nie zdradza poprawnej wartości', () => {
    const v = variant();
    const wynik = v.expected!.toPrecision(4);
    for (const answer of ['1 s', '999 s', '']) {
      expect(checkNumeric(answer, v, 0.02).message).not.toContain(wynik);
    }
  });

  it('bełkot jest odróżniony od złej odpowiedzi', () => {
    expect(checkNumeric('nie wiem', variant(), 0.02).verdict).toBe('unreadable');
  });
});

describe('sprawdzanie odpowiedzi symbolicznej', () => {
  it('inny zapis tego samego wyrażenia przechodzi', () => {
    const result = checkSymbolic(
      '2\\pi \\cdot L^{0.5} \\cdot g^{-0.5}',
      '2\\pi\\sqrt{\\frac{L}{g}}',
      ['L', 'g'],
    );
    expect(result.verdict).toBe('correct');
  });

  it('inne wyrażenie nie przechodzi', () => {
    expect(checkSymbolic('2\\pi\\sqrt{\\frac{g}{L}}', '2\\pi\\sqrt{\\frac{L}{g}}', ['L', 'g']).verdict).toBe('wrong');
  });

  it('drobna różnica stałej jest wychwycona', () => {
    expect(checkSymbolic('\\pi\\sqrt{\\frac{L}{g}}', '2\\pi\\sqrt{\\frac{L}{g}}', ['L', 'g']).verdict).toBe('wrong');
  });

  it('bełkot jest odróżniony', () => {
    expect(checkSymbolic('\\sqrtt{L}', '2 \\cdot L', ['L']).verdict).toBe('unreadable');
  });
});

describe('podpowiedzi z grafu', () => {
  const graph = graphOf(WAHADLO);
  const model = compileGraph(graph);

  it('pierwsza mówi, który wzór, i wymienia założenie', () => {
    const hints = buildHints(graph, 'T');
    expect(hints[0].text).toContain('okres');
    expect(hints[0].text).toContain('male-katy');
  });

  it('druga wymienia potrzebne wielkości, ale nie podaje wyniku', () => {
    const hints = buildHints(graph, 'T');
    expect(hints[1].text).toContain('L');
    expect(hints[1].text).toContain('g');
  });

  it('kolejne stopnie odsłaniają coraz więcej', () => {
    const hints = buildHints(graph, 'T');
    expect(hints.length).toBeGreaterThanOrEqual(2);
    expect(hints.map((h) => h.level)).toEqual(hints.map((_, i) => i + 1));
  });

  it('żadna podpowiedź nie zawiera odpowiedzi', () => {
    const variant = exerciseVariant(ZADANIE, model, 42);
    const result = model.run(variant.values, [0, 1], 0.01);
    const hints = buildHints(graph, 'T', result);
    const wynik = variant.expected!.toPrecision(4);
    for (const hint of hints) expect(hint.text).not.toContain(wynik);
  });

  it('podpowiedzi autora mają pierwszeństwo', () => {
    const hints = buildHints(graph, 'T', undefined, ['Pomyśl o izochronizmie.']);
    expect(hints).toEqual([{ level: 1, text: 'Pomyśl o izochronizmie.' }]);
  });

  it('wielkość spoza grafu nie ma podpowiedzi', () => {
    expect(buildHints(graph, 'nieistnieje')).toEqual([]);
  });
});
