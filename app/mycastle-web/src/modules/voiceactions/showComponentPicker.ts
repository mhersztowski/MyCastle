/**
 * Rejestr okna wyboru komponentu dla bloczka „Wyświetl komponent" oraz pobieranie
 * listy dostępnych komponentów (wbudowane + z Programming/Components).
 */
import { readUserJson } from '../../services/userJson';
import { BUILTIN_COMPONENTS } from './builtinComponents';

export interface ShowComponentConfig {
  mode: 'inline' | 'popup';
  kind: 'builtin' | 'code';
  id: string;
  name: string;
  path?: string; // ścieżka VFS dla komponentów kodowych (Programming/Components)
}

export interface ComponentListItem {
  id: string;
  name: string;
  kind: 'builtin' | 'code';
  path?: string;
}

export function summarizeShowComponent(cfg: ShowComponentConfig | null): string {
  if (!cfg || !cfg.id) return 'wybierz komponent…';
  const modeLabel = cfg.mode === 'popup' ? 'popup' : 'inline';
  return `${cfg.name} (${modeLabel})`;
}

// ----- rejestr okna dialogowego (ustawiany przez edytor konwersacji) -----
type Picker = (current: ShowComponentConfig | null) => Promise<ShowComponentConfig | null>;
let picker: Picker | null = null;

export function setShowComponentPicker(fn: Picker | null): void {
  picker = fn;
}

export function getShowComponentPicker(): Picker | null {
  return picker;
}

// ----- lista komponentów: wbudowane + kodowe z programming/components.json -----
export async function listComponents(userName: string): Promise<ComponentListItem[]> {
  const builtins: ComponentListItem[] = BUILTIN_COMPONENTS.map(b => ({
    id: b.id,
    name: b.name,
    kind: 'builtin' as const,
  }));

  let code: ComponentListItem[] = [];
  try {
    const data = await readUserJson<{ components?: Array<{ id?: string; name?: string; path?: string; label?: string }> }>(
      userName,
      'programming/components.json',
    );
    code = (data?.components ?? [])
      .filter(c => !!(c.path || c.id))
      .map(c => ({
        id: c.id || c.path || '',
        name: c.name || c.label || (c.path || '').split('/').pop() || 'Komponent',
        kind: 'code' as const,
        path: c.path,
      }));
  } catch {
    /* offline / brak pliku */
  }

  return [...builtins, ...code];
}
