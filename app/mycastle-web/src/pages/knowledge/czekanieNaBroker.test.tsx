/**
 * Strona bazy wiedzy czeka na broker.
 *
 * Strona bywa otwierana **z linku** — z dymka odsyłacza, z zakładki, przez
 * wklejenie adresu. Montuje się wtedy razem z całą aplikacją, zanim MQTT zdąży
 * się połączyć. Wcześniej pierwszy odczyt leciał od razu i strona pokazywała
 * „Not connected to MQTT broker", choć ułamek sekundy później połączenie już
 * było i wystarczyło odświeżyć.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const listDirectory = vi.fn();
const readFile = vi.fn();
let polaczony = false;

vi.mock('../../modules/mqttclient', () => ({
  mqttClient: {
    listDirectory: (...a: unknown[]) => listDirectory(...a),
    readFile: (...a: unknown[]) => readFile(...a),
    writeFile: vi.fn(),
  },
  useMqtt: () => ({ isConnected: polaczony }),
}));
vi.mock('../../workers', () => ({ createModelWorker: vi.fn() }));
/**
 * Sesja zamockowana jak reszta infrastruktury.
 *
 * Strona pyta o token, żeby wiedzieć, czy czytać własną bazę (przez broker),
 * czy publiczną (po HTTP). Prawdziwy `AuthContext` ciągnie za sobą klienta API
 * i pośrednio Monaco, którego ten test nie ma po co ładować — tu chodzi
 * wyłącznie o zachowanie przy niepodłączonym brokerze.
 */
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

const pokaz = () => render(<MemoryRouter><KnowledgePage /></MemoryRouter>);

describe('zanim broker odpowie', () => {
  beforeEach(() => {
    listDirectory.mockReset();
    readFile.mockReset();
    polaczony = false;
  });

  it('nie próbuje czytać katalogu i nie krzyczy błędem', () => {
    pokaz();

    expect(listDirectory).not.toHaveBeenCalled();
    expect(screen.getByText(/Łączę z serwerem/)).toBeTruthy();
    expect(screen.queryByText(/Not connected/)).toBeNull();
  });

  it('po połączeniu wczytuje bazę', async () => {
    polaczony = true;
    listDirectory.mockResolvedValue({ type: 'directory', name: 'knowledge', path: 'drive/knowledge', children: [] });

    pokaz();
    await waitFor(() => expect(listDirectory).toHaveBeenCalled());
  });

  /**
   * Przejście „czekam" → „mam bazę" przechodzi przez wczesne `return`,
   * a każdy hook **za** nim zmienia ich liczbę między renderami. React kończy
   * to wtedy błędem #310 i całą stronę zastępuje komunikatem „Editor failed to
   * load" — bez śladu, który hook zawinił. Ten test pilnuje tego przejścia,
   * bo z samego czytania kodu łatwo je przeoczyć.
   */
  it('przejście ze stanu ładowania do wczytanej bazy nie zmienia liczby hooków', async () => {
    const bledy: unknown[] = [];
    const konsola = vi.spyOn(console, 'error').mockImplementation((...a) => bledy.push(a));

    polaczony = false;
    const { rerender } = pokaz();
    expect(screen.getByText(/Łączę z serwerem/)).toBeTruthy();

    // Baza z **prawdziwym** dokumentem, nie pusta: pusta kończy się kolejnym
    // wczesnym wyjściem, więc render nigdy nie dochodzi do końca i różnica
    // w liczbie hooków się nie ujawnia. Ten test przeszedł kiedyś mimo usterki
    // właśnie dlatego.
    polaczony = true;
    listDirectory.mockResolvedValue({
      type: 'directory',
      name: 'knowledge',
      path: 'drive/knowledge',
      children: [{ type: 'file', name: 'a.md', path: 'drive/knowledge/a.md' }],
    });
    readFile.mockResolvedValue({ content: '---\ntitle: Test\nid: test-a\n---\n# Test\n\nTreść.' });
    rerender(<MemoryRouter><KnowledgePage /></MemoryRouter>);

    // Katalog wyrenderowany do końca — dopiero teraz przeszliśmy przez wszystkie
    // hooki strony.
    await waitFor(() => expect(screen.queryByText(/Łączę z serwerem/)).toBeNull());

    const opis = bledy.map((b) => String(b)).join(' ');
    expect(opis).not.toMatch(/hooks|Hook|#310/);
    konsola.mockRestore();
  });
});
