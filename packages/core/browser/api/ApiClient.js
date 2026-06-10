/**
 * ApiClient — cienki klient VFS REST dla danych użytkownika (czysty przeglądarkowy JS).
 *
 * MyCastle NIE ma dedykowanych endpointów REST dla PIM — persons/tasks/projects/events
 * to pliki JSON w katalogu użytkownika, czytane/zapisywane przez generyczne VFS API:
 *
 *   GET  /api/users/{userName}/vfs/readFile?path=/data/Minis/Users/{userName}/{rel}
 *        → { data: "<base64>" }
 *   POST /api/users/{userName}/vfs/writeFile?path=...   body { data: "<base64>", options }
 *   POST /api/users/{userName}/vfs/mkdir?path=...
 *
 * Autoryzacja: nagłówek `Authorization: Bearer <JWT>`.
 *
 * Użycie:
 *   const client = new ApiClient({ userName: 'marcin', token });
 *   // baseUrl pusty = ten sam origin (np. produkcja). Dla cross-origin:
 *   // new ApiClient({ baseUrl: 'https://mycastle.hersztowski.org', userName, token })
 */

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export class ApiClient {
  /**
   * @param {{ baseUrl?: string, userName: string, token?: string }} opts
   */
  constructor({ baseUrl = '', userName, token } = {}) {
    if (!userName) throw new Error('ApiClient: userName is required');
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.userName = userName;
    this.token = token;
  }

  setToken(token) { this.token = token; return this; }

  /** Ścieżka backendu dla pliku względnego do home użytkownika. */
  backendPath(relPath) {
    const clean = String(relPath).replace(/^\/+/, '');
    return `/data/Minis/Users/${this.userName}/${clean}`;
  }

  _vfsUrl(op, fullPath) {
    const base = `${this.baseUrl}/api/users/${encodeURIComponent(this.userName)}/vfs/${op}`;
    return fullPath != null ? `${base}?path=${encodeURIComponent(fullPath)}` : base;
  }

  _headers(extra) {
    const h = { ...(extra || {}) };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  /** Odczyt pliku jako tekst. Zwraca null gdy plik nie istnieje (404). */
  async readFile(relPath) {
    const r = await fetch(this._vfsUrl('readFile', this.backendPath(relPath)), {
      headers: this._headers(),
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`readFile ${relPath} -> ${r.status}`);
    const body = await r.json();
    return fromBase64(body.data);
  }

  /** Zapis tekstu do pliku (tworzy/nadpisuje). */
  async writeFile(relPath, content, options = { create: true, overwrite: true }) {
    const r = await fetch(this._vfsUrl('writeFile', this.backendPath(relPath)), {
      method: 'POST',
      headers: this._headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ data: toBase64(content), options }),
    });
    if (!r.ok) throw new Error(`writeFile ${relPath} -> ${r.status}`);
    return true;
  }

  /** Utworzenie katalogu. Zwraca true/false (nie rzuca, bo „już istnieje" jest OK). */
  async mkdir(relPath) {
    try {
      const r = await fetch(this._vfsUrl('mkdir', this.backendPath(relPath)), {
        method: 'POST',
        headers: this._headers({ 'Content-Type': 'application/json' }),
        body: '{}',
      });
      return r.ok;
    } catch { return false; }
  }

  /** Usunięcie pliku/katalogu. */
  async delete(relPath, options) {
    const r = await fetch(this._vfsUrl('delete', this.backendPath(relPath)), {
      method: 'POST',
      headers: this._headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(options ? { options } : {}),
    });
    if (!r.ok && r.status !== 404) throw new Error(`delete ${relPath} -> ${r.status}`);
    return r.ok;
  }

  /** Odczyt + JSON.parse. Zwraca `fallback` gdy plik nie istnieje lub jest pusty/niepoprawny. */
  async readJson(relPath, fallback = null) {
    const txt = await this.readFile(relPath);
    if (txt == null || txt.trim() === '') return fallback;
    try { return JSON.parse(txt); } catch { return fallback; }
  }

  /** Zapis wartości jako sformatowany JSON. */
  async writeJson(relPath, value) {
    return this.writeFile(relPath, JSON.stringify(value, null, 2));
  }
}
