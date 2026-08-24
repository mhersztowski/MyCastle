/**
 * Pasek bloku diagramu — co jest widoczne i kiedy.
 *
 * Trzy rzeczy z etapu 2 dotyczą wyłącznie interfejsu i nie mają odpowiednika
 * w modelu, więc sprawdzamy je od strony tego, co widzi autor:
 *
 *   • zapis obrazu jest czynny **tylko po renderze** — pobieramy dokładnie to,
 *     co widać, a nie drugi render, który mógłby się różnić;
 *   • uwagi z rozbioru pojawiają się przy tekście, bo tam się je poprawia;
 *   • rodzaj bez edytora graficznego zamyka tryb „Edit".
 */
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DiagramBlockView } from './DiagramBlockView';

// Render Mermaida jest w tych testach nieistotny i kosztuje kilkaset
// kilobajtów pobrania — podmieniamy go na zaślepkę zwracającą znany SVG.
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg viewBox="0 0 100 50"><g/></svg>' })),
  },
}));

const POPRAWNY = 'flowchart TB\n  A[Start] --> B[Koniec]';
/** Krawędź, której końca parser nie umie odczytać — jedyny przypadek `issues`. */
const Z_UWAGAMI = 'flowchart TB\n  A --> B\n  & --> C';
/** Styl i `click` są poza modelem: wracają nietknięte, ale edytor ich nie pokaże. */
const Z_NIETKNIETYMI = 'flowchart TB\n  A --> B\n  style A fill:#f00\n  click A "https://x"';
const MINDMAP = 'mindmap\n  root((centrum))\n    gałąź';

function pokaz(code: string, language = 'mermaid') {
  return render(
    <DiagramBlockView code={code} language={language} onChange={vi.fn()} onLanguageChange={vi.fn()}>
      {() => <pre>{code}</pre>}
    </DiagramBlockView>,
  );
}

describe('przełącznik trybów', () => {
  it('zapisuje wybrany tryb w infostringu', async () => {
    const onLanguageChange = vi.fn();
    render(
      <DiagramBlockView code={POPRAWNY} language="mermaid" onChange={vi.fn()} onLanguageChange={onLanguageChange}>
        {() => <pre>{POPRAWNY}</pre>}
      </DiagramBlockView>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View' }));

    expect(onLanguageChange).toHaveBeenCalledWith('mermaid:view');
    // Doczekanie renderu przed końcem testu: porzucony render Mermaida zostawia
    // aktualizację stanu poza `act`, przez którą `waitFor` w następnym teście
    // przestaje widzieć zmiany.
    await waitFor(() => expect(screen.getByRole('button', { name: 'SVG' })).toHaveProperty('disabled', false));
  });

  it('otwiera blok w trybie zapisanym w infostringu', () => {
    pokaz(POPRAWNY, 'mermaid:view');
    // Pasek podglądu ma powiększenie; w trybie tekstu go nie ma.
    expect(screen.getByTitle('Powiększ')).toBeTruthy();
  });
});

describe('zapis obrazu', () => {
  it('nie pokazuje przycisków przy tekście', () => {
    pokaz(POPRAWNY);
    expect(screen.queryByRole('button', { name: 'SVG' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'PNG' })).toBeNull();
  });

  it('w podglądzie są nieczynne do czasu renderu, potem czynne', async () => {
    // Jeden test na całe przejście, a nie dwa na stany: rozdzielone wymagałyby
    // od drugiego założenia, że render jeszcze nie zdążył — a to jest wyścig.
    pokaz(POPRAWNY, 'mermaid:view');
    const svg = screen.getByRole('button', { name: 'SVG' }) as HTMLButtonElement;
    const png = screen.getByRole('button', { name: 'PNG' }) as HTMLButtonElement;
    expect(svg.disabled).toBe(true);
    expect(png.disabled).toBe(true);

    await waitFor(() => expect(svg.disabled).toBe(false));
    expect(png.disabled).toBe(false);
  });
});

describe('diagnostyka rozbioru', () => {
  it('uwagi pokazują się przy tekście, zwinięte do podsumowania', () => {
    pokaz(Z_UWAGAMI);
    expect(screen.getByTitle('Uwagi z odczytu diagramu').textContent).toMatch(/uwag/);
  });

  it('uwagi rozwijają się w listę z numerami linii', () => {
    pokaz(Z_UWAGAMI);
    fireEvent.click(screen.getByTitle('Uwagi z odczytu diagramu'));
    expect(screen.getByRole('list').textContent).toMatch(/linia \d+:/);
  });

  it('linie poza modelem są liczone osobno od błędów', () => {
    // `style` i `click` nie są błędami — są rzeczami, których edytor graficzny
    // nie pokaże, a zapis odda nietknięte. Autor ma to wiedzieć przed wejściem
    // w tryb graficzny, a nie po nim.
    pokaz(Z_NIETKNIETYMI);
    const panel = screen.getByTitle('Uwagi z odczytu diagramu');
    expect(panel.textContent).toMatch(/2 linii bez zmian/);
    expect(panel.textContent).not.toMatch(/uwag/);

    fireEvent.click(panel);
    expect(screen.getByText(/poza modelem edytora/)).toBeTruthy();
  });

  it('diagram bez uwag i bez takich linii nie pokazuje panelu', () => {
    pokaz(POPRAWNY);
    expect(screen.queryByTitle('Uwagi z odczytu diagramu')).toBeNull();
  });

  it('rodzaj bez edytora nie zgłasza wszystkich swoich linii jako pozostawionych', () => {
    // Dla `mindmap` całe źródło leży w `unknown` z definicji — mówienie o tym
    // „6 linii bez zmian" byłoby powtórzeniem informacji, którą pasek już niesie.
    pokaz(MINDMAP);
    expect(screen.queryByTitle('Uwagi z odczytu diagramu')).toBeNull();
  });
});

describe('rodzaj bez edytora graficznego', () => {
  it('zamyka tryb Edit i mówi dlaczego', () => {
    pokaz(MINDMAP);
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveProperty('disabled', true);
    expect(screen.getByText(/mindmap — bez edycji graficznej/)).toBeTruthy();
  });

  it('obsługiwany rodzaj ma Edit czynny', () => {
    pokaz(POPRAWNY);
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveProperty('disabled', false);
  });
});

describe('most do kodu źródłowego', () => {
  const KLASY = 'classDiagram\n  class Pies {\n    +glos() string\n  }';
  const Z_ZRODLEM = [
    '---', 'source:', '  dir: mycastle-code/packages/core/src', '  files: [Pies.ts]', '---',
    KLASY,
  ].join('\n');

  it('import z kodu jest dostępny w każdym zapisywalnym bloku', () => {
    pokaz(POPRAWNY);
    expect(screen.getByRole('button', { name: 'Z kodu…' })).toBeTruthy();
  });

  it('blok tylko do odczytu nie proponuje importu', () => {
    // Tryb czytania i eksport statyczny nie mają gdzie zapisać wyniku.
    render(
      <DiagramBlockView code={POPRAWNY} language="mermaid">
        {() => <pre>{POPRAWNY}</pre>}
      </DiagramBlockView>,
    );
    expect(screen.queryByRole('button', { name: 'Z kodu…' })).toBeNull();
  });

  it('rodzaj bez edytora graficznego nie proponuje importu', () => {
    pokaz(MINDMAP);
    expect(screen.queryByRole('button', { name: 'Z kodu…' })).toBeNull();
  });

  it('diagram bez zapisanego źródła nie proponuje odświeżenia', () => {
    pokaz(POPRAWNY);
    expect(screen.queryByRole('button', { name: /Odśwież z kodu/ })).toBeNull();
  });

  it('diagram ze źródłem proponuje odświeżenie', () => {
    pokaz(Z_ZRODLEM);
    expect(screen.getByRole('button', { name: /Odśwież z kodu/ })).toBeTruthy();
  });

  it('szkielet kodu proponujemy dla diagramu klas', () => {
    pokaz(KLASY);
    expect(screen.getByRole('button', { name: 'Do kodu…' })).toBeTruthy();
  });

  it('dla schematu blokowego szkieletu kodu nie ma', () => {
    // Ze schematu blokowego nie ma z czego zrobić klas — przycisk byłby
    // obietnicą, której nie da się spełnić.
    pokaz(POPRAWNY);
    expect(screen.queryByRole('button', { name: 'Do kodu…' })).toBeNull();
  });
});
