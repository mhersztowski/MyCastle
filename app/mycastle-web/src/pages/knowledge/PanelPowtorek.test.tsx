/**
 * Panel powtórek — to, co czytelnik widzi w bazie wiedzy.
 *
 * Testy sprawdzają **decyzje panelu**, nie wygląd: kiedy w ogóle się pokazuje,
 * co proponuje dla każdej z czterech czynności, czy odstępy da się zmienić
 * i czy zmiana wraca do zapisu.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { buildIndex, defaultRevisionSettings, markRead, emptyProgress, DAY } from '@mhersztowski/sci-core';
import type { ProgressWithRevision } from '@mhersztowski/sci-core';
import { PanelPowtorek } from './PanelPowtorek';

const T = Date.UTC(2026, 7, 4);

const index = buildIndex([
  { path: 'book/K/03/03-01.md', markdown: '---\ntitle: Mechanika\n---\n# 3-1' },
  { path: 'book/K/03/03-02.md', markdown: '---\ntitle: Kinematyka\n---\n# 3-2' },
  { path: 'book/K/03/03-03.md', markdown: '---\ntitle: Prędkość średnia\n---\n# 3-3' },
  { path: 'book/K/03/03-04.md', markdown: '---\ntitle: Prędkość chwilowa\n---\n# 3-4' },
  { path: 'book/K/03/Pytania.md', markdown: '---\ntitle: Pytania 3\n---\n1. Czemu?' },
  {
    path: 'book/K/03/Zadania.md',
    markdown: ['---', 'title: Zadania 3', '---',
      '```exercise:z-1', 'Treść.', '@expected 1 m', '```',
      '```exercise:z-2', 'Treść.', '@expected 2 m', '```'].join('\n'),
  },
  {
    path: 'book/K/Prawa.md',
    markdown: ['```law:p-hooke', "Prawo Hooke'a", '@statement Siła jest proporcjonalna do przemieszczenia.',
      '@chapter 15', '@source 15-2', '```'].join('\n'),
  },
  {
    path: 'book/K/Slownik.md',
    markdown: ['```term:t-okres', 'Okres', '@definition Czas jednego pełnego drgnięcia.', '```'].join('\n'),
  },
]);

function pokaz(nadpisz: Partial<React.ComponentProps<typeof PanelPowtorek>> = {}) {
  const onOpen = vi.fn();
  const onSettings = vi.fn();
  const onAttempt = vi.fn();
  const utils = render(
    <PanelPowtorek
      index={index}
      progress={emptyProgress()}
      settings={defaultRevisionSettings()}
      onSettings={onSettings}
      onOpen={onOpen}
      onAttempt={onAttempt}
      now={T}
      {...nadpisz}
    />,
  );
  return { onOpen, onSettings, onAttempt, ...utils };
}

describe('panel powtórek', () => {
  it('daje cztery rodzaje czynności', () => {
    pokaz();
    for (const nazwa of [/Przypomnienie podrozdziału/, /Pytania do rozdziału/, /Rozwiąż zadania/, /Test z praw/]) {
      expect(screen.getByRole('button', { name: nazwa })).toBeTruthy();
    }
  });

  /**
   * Regresja: panel dostawał indeks **bez książek** (ten od ścieżki nauki),
   * a `Pytania.md`, `Zadania.md`, `Prawa.md` i `Slownik.md` istnieją wyłącznie
   * w książkach. Trzy z czterech rodzajów wychodziły puste, więc przyciski były
   * nieaktywne — bez komunikatu, bo pusta lista wygląda tak samo jak „nic nie
   * zalega". Nad bazą w kształcie książki żaden przycisk nie ma prawa być martwy.
   */
  it('nad bazą z książką wszystkie cztery czynności są dostępne', () => {
    pokaz();
    for (const nazwa of [/Przypomnienie podrozdziału/, /Pytania do rozdziału/, /Rozwiąż zadania/, /Test z praw/]) {
      expect(screen.getByRole('button', { name: nazwa }), String(nazwa))
        .toHaveProperty('disabled', false);
    }
  });

  it('materiał spoza książek nie wyłącza czynności książkowych', () => {
    // Ścieżka nauki obok książki — tak wygląda prawdziwa baza.
    const mieszany = buildIndex([
      { path: 'mechanika/rzut.md', markdown: '---\ntitle: Rzut\n---\n# R' },
      { path: 'book/K/03/Pytania.md', markdown: '---\ntitle: Pytania 3\n---\n1. Czemu?' },
    ]);
    pokaz({ index: mieszany });
    expect(screen.getByRole('button', { name: /Pytania do rozdziału/ }))
      .toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: /Przypomnienie podrozdziału/ }))
      .toHaveProperty('disabled', false);
  });

  /**
   * „Trzy najrzadziej czytane" — nietknięty jest rzadszy niż każdy przeczytany.
   * Liczba pozycji pochodzi z nastaw, nie z kodu.
   */
  it('podrozdziały: proponuje tyle, ile mówią nastawy, najdawniej czytane pierwsze', () => {
    let p: ProgressWithRevision = markRead(emptyProgress(), 'book/K/03/03-01.md', T - 40 * DAY);
    p = markRead(p, 'book/K/03/03-02.md', T - 1 * DAY);
    const { container } = pokaz({ progress: p });

    fireEvent.click(screen.getByRole('button', { name: /Przypomnienie podrozdziału/ }));
    const otworz = within(container).getAllByRole('button', { name: 'otwórz' });
    expect(otworz).toHaveLength(3);

    const tekst = container.textContent ?? '';
    // Nietknięte na początku, świeżo przeczytany w ogóle poza trójką.
    expect(tekst).toContain('Prędkość średnia');
    expect(tekst).toContain('nigdy');
    expect(tekst).not.toContain('Kinematyka');
  });

  it('otwarcie pozycji podaje ścieżkę hostowi', () => {
    const { onOpen } = pokaz();
    fireEvent.click(screen.getByRole('button', { name: /Przypomnienie podrozdziału/ }));
    fireEvent.click(screen.getAllByRole('button', { name: 'otwórz' })[0]);
    expect(onOpen).toHaveBeenCalledWith(expect.stringContaining('book/K/03/'), undefined);
  });

  // Zadanie ma identyfikator bloku, więc otwarcie ma przewinąć wprost do niego.
  it('zadania otwierają się z kotwicą do konkretnego zadania', () => {
    const { onOpen } = pokaz();
    fireEvent.click(screen.getByRole('button', { name: /Rozwiąż zadania/ }));
    fireEvent.click(screen.getAllByRole('button', { name: 'otwórz' })[0]);
    expect(onOpen).toHaveBeenCalledWith('book/K/03/Zadania.md', expect.stringMatching(/^z-/));
  });

  /**
   * Test praw i pojęć to samoocena — hasła są zdaniami, nie liczbami, więc nie
   * ma czego porównać. Stopniowanie wchodzi wprost do harmonogramu.
   */
  it('test: odsłania treść i przyjmuje stopniowaną samoocenę', () => {
    const { onAttempt, container } = pokaz();
    fireEvent.click(screen.getByRole('button', { name: /Test z praw/ }));

    expect(container.textContent).not.toContain('proporcjonalna do przemieszczenia');
    fireEvent.click(screen.getByRole('button', { name: 'pokaż treść' }));
    expect(container.textContent).toContain('proporcjonalna do przemieszczenia');

    fireEvent.click(screen.getByRole('button', { name: 'pamiętałem' }));
    expect(onAttempt).toHaveBeenCalledWith(expect.stringContaining('p-hooke'), 'perfect');
  });

  it('test przechodzi do następnego pytania po ocenie', () => {
    const { container } = pokaz();
    fireEvent.click(screen.getByRole('button', { name: /Test z praw/ }));
    expect(container.textContent).toContain('1 z 2');
    fireEvent.click(screen.getByRole('button', { name: 'pokaż treść' }));
    fireEvent.click(screen.getByRole('button', { name: 'z trudem' }));
    expect(container.textContent).toContain('2 z 2');
  });

  // Odstęp i liczba pozycji są ustawieniem czytelnika, nie stałą w kodzie.
  it('odstępy da się zmienić, a zmiana wraca do zapisu', () => {
    const { onSettings, container } = pokaz();
    fireEvent.click(screen.getByRole('button', { name: /odstępy/ }));
    expect(container.textContent).toContain('odstęp: 30 dni');

    const suwak = container.querySelectorAll('input[type="range"]')[0];
    fireEvent.change(suwak, { target: { value: '7' } });

    expect(onSettings).toHaveBeenCalled();
    expect(onSettings.mock.calls.at(-1)![0].intervalDays.subsection).toBe(7);
  });

  // Pusty licznik na pierwszym wejściu to szum, nie informacja.
  it('nie pokazuje się, gdy nie ma czego powtarzać', () => {
    const { container } = render(
      <PanelPowtorek
        index={buildIndex([])}
        progress={emptyProgress()}
        settings={defaultRevisionSettings()}
        onSettings={vi.fn()}
        onOpen={vi.fn()}
        onAttempt={vi.fn()}
        now={T}
      />,
    );
    expect(container.textContent).toBe('');
  });
});
