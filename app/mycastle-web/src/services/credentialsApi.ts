/**
 * credentialsApi — dostęp do zaszyfrowanych credentiali użytkownika (Settings → Sekrety)
 * z poziomu skryptów (Plugin Script i Automate Script) w edytorze Markdown.
 *
 * Korzysta z tego samego serwerowego, szyfrowanego (AES-256-GCM) store'u co dialog
 * Settings — namespace `__credentials__`, klucz w formacie `{type}:{name}`.
 *
 * Flaga `global` (na backendzie `shared`) udostępnia sekret PUBLICZNIE — jest
 * czytelny dla wszystkich, także anonimowo (np. skrypt na stronie Markdown
 * otwartej bez logowania). Sekrety bez tej flagi czyta tylko właściciel.
 */
import { minisApi } from './MinisApiService';

const CREDENTIALS_NS = '__credentials__';
const SECRET_TYPES = ['password', 'token', 'other'] as const;

export interface CredentialEntry {
  /** Surowy klucz `{type}:{name}`. */
  key: string;
  type: string;
  name: string;
  /** true → sekret globalny (publiczny, czytelny dla wszystkich). */
  global: boolean;
  updatedAt: number;
}

export interface CredentialsApi {
  /** Lista WŁASNYCH credentiali (bez wartości — tylko metadane). */
  list(): Promise<CredentialEntry[]>;
  /**
   * Odczyt wartości po nazwie. null gdy brak / brak dostępu.
   * @param type opcjonalny typ ('password'|'token'|'other') — zawęża wyszukiwanie
   * @param owner opcjonalny właściciel — odczyt CUDZEGO sekretu (działa tylko gdy
   *   sekret jest globalny; dla cudzego właściciela podaj też `type`, bo nie da
   *   się wylistować cudzych kluczy). Domyślnie = zalogowany użytkownik.
   */
  get(name: string, type?: string, owner?: string): Promise<string | null>;
  /** Zapis/aktualizacja. `global=true` udostępnia publicznie. Domyślny typ 'other'. */
  set(name: string, value: string, type?: string, global?: boolean): Promise<void>;
  /** Usunięcie WŁASNEGO credentiala. Zwraca true gdy coś usunięto. */
  delete(name: string, type?: string): Promise<boolean>;
}

function parseKey(rawKey: string): { type: string; name: string } {
  const i = rawKey.indexOf(':');
  if (i === -1) return { type: 'other', name: rawKey };
  const t = rawKey.slice(0, i);
  return { type: (SECRET_TYPES as readonly string[]).includes(t) ? t : 'other', name: rawKey.slice(i + 1) };
}

/**
 * Buduje API credentiali związane z konkretnym użytkownikiem.
 * @param getUserName zwraca nazwę zalogowanego użytkownika (lub null gdy anonim)
 */
export function makeCredentialsApi(getUserName: () => string | null): CredentialsApi {
  const requireUser = (): string => {
    const u = getUserName();
    if (!u) throw new Error('credentials: brak zalogowanego użytkownika');
    return u;
  };

  // Zamienia nazwę (lub gotowy klucz `type:name`) na realny klucz store'u danego owner-a.
  // Gdy nie da się wylistować kluczy owner-a (cudze, brak uprawnień) — zwraca null.
  const resolveKey = async (owner: string, name: string, type?: string): Promise<string | null> => {
    const colon = name.indexOf(':');
    if (colon > 0 && (SECRET_TYPES as readonly string[]).includes(name.slice(0, colon))) return name;
    if (type) return `${type}:${name}`;
    try {
      const items = await minisApi.listSecrets(owner, CREDENTIALS_NS);
      const match = items.find((s) => parseKey(s.key).name === name);
      return match ? match.key : null;
    } catch {
      return null;
    }
  };

  return {
    async list() {
      const user = requireUser();
      const items = await minisApi.listSecrets(user, CREDENTIALS_NS);
      return items.map((s) => ({ key: s.key, global: s.shared, updatedAt: s.updatedAt, ...parseKey(s.key) }));
    },
    async get(name, type, owner) {
      const ownerName = owner ?? getUserName();
      if (!ownerName) throw new Error('credentials: podaj owner lub zaloguj się');
      const key = await resolveKey(ownerName, name, type);
      if (!key) return null;
      try { return (await minisApi.getSecret(ownerName, CREDENTIALS_NS, key)).value; }
      catch { return null; }
    },
    async set(name, value, type = 'other', global = false) {
      const user = requireUser();
      await minisApi.setSecret(user, CREDENTIALS_NS, `${type}:${name}`, value, global);
    },
    async delete(name, type) {
      const user = requireUser();
      const key = await resolveKey(user, name, type);
      if (!key) return false;
      await minisApi.deleteSecret(user, CREDENTIALS_NS, key);
      return true;
    },
  };
}
