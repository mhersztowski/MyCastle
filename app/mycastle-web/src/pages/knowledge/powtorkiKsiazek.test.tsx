/**
 * Powtórki muszą widzieć książki.
 *
 * Regresja z prawdziwego uruchomienia: w bazie wiedzy trzy z czterech
 * przycisków czynności były **nieaktywne**. Przyczyna nie leżała w panelu, tylko
 * w tym, który indeks dostawał: strona buduje dwa — `index` (ścieżka nauki,
 * **bez książek**) i pełny. Panel dostał ten pierwszy, a `Pytania.md`,
 * `Zadania.md`, `Prawa.md` i `Slownik.md` istnieją **wyłącznie** w książkach.
 *
 * Objaw był cichy: pusta lista wygląda dokładnie tak samo jak „nic nie zalega",
 * więc nic nie krzyczało — przyciski po prostu nie reagowały. Dlatego test stoi
 * na poziomie **strony**, a nie panelu: panel był cały czas poprawny, błędem
 * było spięcie.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const listDirectory = vi.fn();
const readFile = vi.fn();

vi.mock('../../modules/mqttclient', () => ({
  mqttClient: {
    listDirectory: (...a: unknown[]) => listDirectory(...a),
    readFile: (...a: unknown[]) => readFile(...a),
    writeFile: vi.fn(),
  },
  useMqtt: () => ({ isConnected: true }),
}));
vi.mock('../../workers', () => ({ createModelWorker: vi.fn() }));
vi.mock('../../modules/auth', () => ({ useAuth: () => ({ token: 'test-token' }) }));
vi.mock('./progressStore', () => ({
  loadProgress: vi.fn().mockResolvedValue({ items: {} }),
  saveProgress: vi.fn(),
  revisionSettings: () => ({
    intervalDays: { subsection: 30, questions: 21, exercises: 14, test: 7 },
    batchSize: { subsection: 3, questions: 1, exercises: 4, test: 8 },
    version: 1,
  }),
}));

const { KnowledgePage } = await import('./KnowledgePage');

/** Baza w kształcie prawdziwej: książka z rozdziałem, pytaniami i zadaniami. */
const PLIKI: Record<string, string> = {
  'book/K/03/03-01.md': '---\ntitle: Mechanika\n---\n# 3-1. Mechanika\ntreść',
  'book/K/03/Pytania.md': '---\ntitle: Pytania 3\n---\n# Pytania\n1. Dlaczego?',
  'book/K/03/Zadania.md': [
    '---', 'title: Zadania 3', '---', '# Zadania',
    '```exercise:rh1-zad-3-1', 'Treść zadania.', '@expected 1 m', '```',
  ].join('\n'),
  'book/K/Prawa.md': [
    '---', 'title: Prawa', '---',
    "```law:rh1-prawo-hooke", "Prawo Hooke'a", '@statement Siła jest proporcjonalna.',
    '@chapter 15', '@source 15-2, s. 349', '```',
  ].join('\n'),
  'book/K/Slownik.md': [
    '---', 'title: Słownik', '---',
    '```term:rh1-poj-okres', 'Okres', '@definition Czas jednego drgnięcia.', '```',
  ].join('\n'),
};

const wezel = (path: string) => ({
  type: 'file' as const, name: path.split('/').pop()!, path: `drive/knowledge/${path}`,
});

beforeEach(() => {
  listDirectory.mockResolvedValue({
    type: 'directory',
    name: 'knowledge',
    path: 'drive/knowledge',
    children: Object.keys(PLIKI).map(wezel),
  });
  readFile.mockImplementation((path: string) => {
    const wzgledna = path.replace('drive/knowledge/', '');
    return Promise.resolve({ content: PLIKI[wzgledna] ?? '' });
  });
});

const pokazBaze = () => render(
  <MemoryRouter initialEntries={['/knowledge']}>
    <KnowledgePage />
  </MemoryRouter>,
);

describe('powtórki nad bazą z książką', () => {
  it('żadna z czterech czynności nie jest martwa', async () => {
    pokazBaze();

    const przycisk = await screen.findByRole('button', { name: /Przypomnienie podrozdziału/ });
    expect(przycisk).toHaveProperty('disabled', false);

    await waitFor(() => {
      for (const nazwa of [/Pytania do rozdziału/, /Rozwiąż zadania/, /Test z praw/]) {
        expect(screen.getByRole('button', { name: nazwa }), String(nazwa))
          .toHaveProperty('disabled', false);
      }
    });
  });

  // Podrozdziały książki też należą do powtórek — a to one wypadały razem
  // z resztą, gdy panel dostawał indeks bez książek.
  it('proponuje podrozdziały z książki, nie tylko ze ścieżki nauki', async () => {
    const { container } = pokazBaze();
    const przycisk = await screen.findByRole('button', { name: /Przypomnienie podrozdziału/ });
    przycisk.click();

    await waitFor(() => expect(container.textContent).toContain('Mechanika'));
  });
});
