/**
 * Belka bazy wiedzy zostaje widoczna przy przewijaniu.
 *
 * Powrót do katalogu i przełącznik trybu czytania to jedyne wyjścia
 * z dokumentu. Schowane pod kilkoma ekranami tekstu zmuszały do przewinięcia
 * na sam początek, żeby cokolwiek zrobić — na telefonie szczególnie dotkliwie.
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
  // Panel powtórek czyta nastawy z tego samego pliku co postępy — atrapa
  // musi je oddać, inaczej strona nie zamontuje się w ogóle.
  revisionSettings: () => ({
    intervalDays: { subsection: 30, questions: 21, exercises: 14, test: 7 },
    batchSize: { subsection: 3, questions: 1, exercises: 4, test: 8 },
    version: 1,
  }),
}));

const { KnowledgePage } = await import('./KnowledgePage');

beforeEach(() => {
  listDirectory.mockResolvedValue({
    type: 'directory',
    name: 'knowledge',
    path: 'drive/knowledge',
    children: [{ type: 'file', name: 'a.md', path: 'drive/knowledge/a.md' }],
  });
  readFile.mockResolvedValue({ content: '---\ntitle: Test\nid: test-a\n---\n# Test\n\nTreść.' });
});

describe('belka bazy wiedzy', () => {
  it('jest przyklejona do góry, a nie przewija się z treścią', async () => {
    render(<MemoryRouter><KnowledgePage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Baza wiedzy')).toBeTruthy());

    const belka = screen.getByText('Baza wiedzy').parentElement!;
    const styl = window.getComputedStyle(belka);

    expect(styl.position).toBe('sticky');
    expect(styl.top).toBe('0px');
  });

  it('ma tło i krawędź — inaczej tekst prześwituje spod niej', async () => {
    render(<MemoryRouter><KnowledgePage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Baza wiedzy')).toBeTruthy());

    const styl = window.getComputedStyle(screen.getByText('Baza wiedzy').parentElement!);
    expect(styl.backgroundColor).not.toBe('');
    expect(styl.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(styl.borderBottomWidth).toBe('1px');
  });

  it('zawija się zamiast wypychać przyciski poza ekran telefonu', async () => {
    render(<MemoryRouter><KnowledgePage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Baza wiedzy')).toBeTruthy());

    const styl = window.getComputedStyle(screen.getByText('Baza wiedzy').parentElement!);
    expect(styl.flexWrap).toBe('wrap');
  });
});
