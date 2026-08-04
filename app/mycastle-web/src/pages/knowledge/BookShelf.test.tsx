/**
 * Półka z książkami — sekcja obok ścieżki nauki.
 *
 * Domyślnie **zwinięta**: przepisany podręcznik to setki podrozdziałów i
 * rozwinięte drzewo byłoby tą samą ścianą tekstu, przed którą oddzielenie
 * książek od materiału autorskiego ma bronić. Czytelnik widzi tytuły książek
 * i liczby, a rozwija to, czego szuka.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BookShelf } from './BookShelf';

const PLIKI = [
  { path: 'book/rh-t1/2-3.md', markdown: '---\ntitle: Składowe wektora\ntags: [resnick, wektory]\n---\nRzut na osie.' },
  { path: 'book/rh-t1/15-1.md', markdown: '---\ntitle: Ruch harmoniczny\ntags: [resnick, drgania]\n---\nWahadło.' },
  { path: 'book/rh-t1/15-9.md', markdown: '---\ntitle: Drgania tłumione\ntags: [resnick, drgania, zadania]\n---\nOpór.' },
  { path: 'book/feynman/1.md', markdown: '---\ntitle: Atomy w ruchu\ntags: [feynman]\n---\nTreść.' },
];

describe('stan zwinięty', () => {
  it('pokazuje książki, a nie ich zawartość', () => {
    render(<BookShelf files={PLIKI} onOpen={vi.fn()} />);

    expect(screen.getByText('rh-t1')).toBeTruthy();
    expect(screen.getByText('feynman')).toBeTruthy();
    expect(screen.queryByText('Ruch harmoniczny')).toBeNull();
  });

  it('mówi, ile czego jest — zanim cokolwiek rozwinie', () => {
    render(<BookShelf files={PLIKI} onOpen={vi.fn()} />);
    expect(screen.getByText(/3/)).toBeTruthy();
  });
});

describe('rozwijanie', () => {
  it('klik w książkę pokazuje jej podrozdziały', () => {
    render(<BookShelf files={PLIKI} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByText('rh-t1'));

    expect(screen.getByText('Ruch harmoniczny')).toBeTruthy();
    // Druga książka zostaje zwinięta — rozwijanie jest niezależne.
    expect(screen.queryByText('Atomy w ruchu')).toBeNull();
  });

  it('podrozdziały idą w kolejności rozdziałów', () => {
    render(<BookShelf files={PLIKI} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByText('rh-t1'));

    const tytuly = screen.getAllByRole('button')
      .map((b) => b.textContent ?? '')
      .filter((t) => /Składowe|Ruch|Drgania/.test(t));
    expect(tytuly[0]).toContain('Składowe');
  });

  it('klik w podrozdział otwiera go w czytniku', () => {
    const onOpen = vi.fn();
    render(<BookShelf files={PLIKI} onOpen={onOpen} />);
    fireEvent.click(screen.getByText('rh-t1'));
    fireEvent.click(screen.getByText('Ruch harmoniczny'));

    expect(onOpen).toHaveBeenCalledWith('book/rh-t1/15-1.md');
  });
});

describe('filtrowanie w obrębie książki', () => {
  const rozwin = () => {
    render(<BookShelf files={PLIKI} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByText('rh-t1'));
  };

  it('tagi pojawiają się dopiero po rozwinięciu i dotyczą tej książki', () => {
    render(<BookShelf files={PLIKI} onOpen={vi.fn()} />);
    expect(screen.queryByText(/drgania/)).toBeNull();

    fireEvent.click(screen.getByText('rh-t1'));
    expect(screen.getByText(/drgania/)).toBeTruthy();
    // Tag drugiej książki nie ma tu czego szukać. Szukamy po etykiecie chipa
    // („nazwa (liczba)"), bo samo „feynman" to także nazwa drugiej książki
    // w nagłówku — ta jest widoczna zawsze i to jest poprawne.
    expect(screen.queryByText('feynman (1)')).toBeNull();
  });

  it('klik w tag zawęża listę', () => {
    rozwin();
    fireEvent.click(screen.getByText(/drgania/));

    expect(screen.getByText('Ruch harmoniczny')).toBeTruthy();
    expect(screen.queryByText('Składowe wektora')).toBeNull();
  });

  it('drugi tag zawęża dalej', () => {
    rozwin();
    fireEvent.click(screen.getByText(/drgania/));
    fireEvent.click(screen.getByText(/zadania/));

    expect(screen.getByText('Drgania tłumione')).toBeTruthy();
    expect(screen.queryByText('Ruch harmoniczny')).toBeNull();
  });

  it('powtórny klik w tag go zdejmuje', () => {
    rozwin();
    fireEvent.click(screen.getByText(/drgania/));
    fireEvent.click(screen.getByText(/drgania/));

    expect(screen.getByText('Składowe wektora')).toBeTruthy();
  });

  it('szukanie działa po treści, nie tylko po tytule', () => {
    rozwin();
    fireEvent.change(screen.getByLabelText(/szukaj/i), { target: { value: 'wahadło' } });

    expect(screen.getByText('Ruch harmoniczny')).toBeTruthy();
    expect(screen.queryByText('Składowe wektora')).toBeNull();
  });

  it('mówi wprost, gdy filtr nic nie zostawił', () => {
    rozwin();
    fireEvent.change(screen.getByLabelText(/szukaj/i), { target: { value: 'kwantowa' } });

    expect(screen.getByText(/nic nie pasuje/i)).toBeTruthy();
  });
});
