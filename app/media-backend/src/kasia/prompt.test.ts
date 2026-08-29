import { describe, it, expect } from 'vitest';
import { dodajFragment, usunWygasle, zbudujPrompt, opisKontekstu } from './prompt';
import type { FragmentPromptu } from './model';

const T = Date.UTC(2026, 7, 27, 10, 0, 0);
const MIN = 60_000;

const fragment = (nad: Partial<FragmentPromptu> = {}): FragmentPromptu => ({
  id: 'f1', kind: 'init', zrodlo: 'skrypt.ts', tekst: 'Pamiętaj o kocie.', dodanoO: T, ...nad,
});

describe('dodajFragment', () => {
  it('dokłada nowy fragment', () => {
    expect(dodajFragment([], fragment())).toHaveLength(1);
  });

  it('ten sam identyfikator nadpisuje, zamiast dublować', () => {
    const po = dodajFragment([fragment()], fragment({ tekst: 'Nowa treść.' }));
    expect(po).toHaveLength(1);
    expect(po[0].tekst).toBe('Nowa treść.');
  });

  it('różne źródła mogą użyć tej samej nazwy bez kolizji', () => {
    const a = fragment({ id: 'a', zrodlo: 'jeden.ts' });
    const b = fragment({ id: 'b', zrodlo: 'dwa.ts' });
    expect(dodajFragment([a], b)).toHaveLength(2);
  });
});

describe('usunWygasle', () => {
  it('usuwa fragment po terminie', () => {
    const f = fragment({ wygasaO: T - 1 });
    expect(usunWygasle([f], T)).toHaveLength(0);
  });

  it('zostawia fragment przed terminem', () => {
    const f = fragment({ wygasaO: T + MIN });
    expect(usunWygasle([f], T)).toHaveLength(1);
  });

  it('fragment bez terminu zostaje na zawsze', () => {
    expect(usunWygasle([fragment()], T + 1e9)).toHaveLength(1);
  });
});

describe('zbudujPrompt', () => {
  const baza = 'Jesteś Kasią.';

  it('zwraca sam prompt bazowy, gdy nie ma fragmentów', () => {
    expect(zbudujPrompt({ baza, fragmenty: [], kind: 'init', teraz: T })).toBe(baza);
  });

  it('dokleja fragment pod prompt bazowy', () => {
    const p = zbudujPrompt({ baza, fragmenty: [fragment()], kind: 'init', teraz: T });
    expect(p).toContain(baza);
    expect(p).toContain('Pamiętaj o kocie.');
  });

  it('podaje źródło fragmentu, żeby model wiedział, skąd to się wzięło', () => {
    const p = zbudujPrompt({ baza, fragmenty: [fragment()], kind: 'init', teraz: T });
    expect(p).toContain('skrypt.ts');
  });

  it('bierze tylko fragmenty właściwego rodzaju', () => {
    const f = [fragment({ id: 'a', kind: 'init', tekst: 'INIT' }),
               fragment({ id: 'b', kind: 'update', tekst: 'UPDATE' })];
    const p = zbudujPrompt({ baza, fragmenty: f, kind: 'update', teraz: T });
    expect(p).toContain('UPDATE');
    expect(p).not.toContain('INIT');
  });

  it('pomija fragmenty wygasłe', () => {
    const f = [fragment({ tekst: 'Nieaktualne.', wygasaO: T - 1 })];
    expect(zbudujPrompt({ baza, fragmenty: f, kind: 'init', teraz: T })).not.toContain('Nieaktualne');
  });

  it('zachowuje kolejność dodawania', () => {
    const f = [
      fragment({ id: 'b', tekst: 'DRUGI', dodanoO: T + 100 }),
      fragment({ id: 'a', tekst: 'PIERWSZY', dodanoO: T }),
    ];
    const p = zbudujPrompt({ baza, fragmenty: f, kind: 'init', teraz: T + 200 });
    expect(p.indexOf('PIERWSZY')).toBeLessThan(p.indexOf('DRUGI'));
  });

  it('dokleja kontekst, gdy podany', () => {
    const p = zbudujPrompt({ baza, fragmenty: [], kind: 'init', teraz: T, kontekst: 'Jest środa.' });
    expect(p).toContain('Jest środa.');
  });
});

describe('opisKontekstu', () => {
  const spotkania = [
    { rodzaj: 'HersztuMorning' as const, godzina: '07:30', wlaczone: true, uzgodnione: true },
  ];

  it('podaje datę i godzinę, bo model sam ich nie zna', () => {
    const opis = opisKontekstu({
      teraz: T, strefa: 'Europe/Warsaw',
      dostepnosc: { tryb: 'dostepny', od: T }, spotkania,
    });
    expect(opis).toMatch(/2026/);
    expect(opis).toMatch(/\d{2}:\d{2}/);
  });

  it('mówi, gdy nie wolno zaczepiać', () => {
    const opis = opisKontekstu({
      teraz: T, strefa: 'Europe/Warsaw',
      dostepnosc: { tryb: 'spie', od: T }, spotkania,
    });
    expect(opis).toMatch(/śpi/i);
  });

  it('wymienia ustalone spotkania', () => {
    const opis = opisKontekstu({
      teraz: T, strefa: 'Europe/Warsaw',
      dostepnosc: { tryb: 'dostepny', od: T }, spotkania,
    });
    expect(opis).toContain('HersztuMorning');
    expect(opis).toContain('07:30');
  });

  it('podaje dzień tygodnia po polsku — od niego zależy niedzielne spotkanie', () => {
    const niedziela = Date.UTC(2026, 7, 30, 10, 0, 0);
    const opis = opisKontekstu({
      teraz: niedziela, strefa: 'Europe/Warsaw',
      dostepnosc: { tryb: 'dostepny', od: niedziela }, spotkania,
    });
    expect(opis).toMatch(/niedziel/i);
  });
});
