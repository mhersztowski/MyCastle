/**
 * publicKnowledge.ts — baza wiedzy dla czytelnika bez konta.
 *
 * Katalog `drive/knowledge` jest publiczny (patrz `publicPaths.ts` w core), więc
 * przeczytanie podrozdziału nie wymaga logowania. Dotąd strona i tak go żądała,
 * bo jedyną drogą do plików był klient MQTT — a ten potrzebuje sesji.
 *
 * Ta droga idzie po HTTP i jest **tylko do odczytu**. Nie ma tu zapisu postępów
 * ani oznaczania przeczytanego i to jest właściwe: bez konta nie ma czyich
 * postępów zapisywać.
 */
import { ROOT_LABEL } from './knowledgeFiles';

/**
 * Właściciel bazy pokazywanej pod publicznym adresem.
 *
 * Adres `/knowledge/book/...` nie niesie nazwy użytkownika, a strona musi
 * wiedzieć, czyją bazę otworzyć. Kolejność jest tu istotna i wynika z jednej
 * pomyłki: pierwsza wersja zgadywała `admin`, bo to konto backend zakłada przy
 * pierwszym starcie — a biblioteka leżała na koncie autora. Efektem była strona
 * z komunikatem „nie ma dokumentu" i żadnej wskazówki, czemu.
 *
 * Dlatego pytamy **serwer**, kto ma publiczną bazę. Zgadywanie zostaje na
 * ostatnim miejscu, gdy nie ma ani wskazania w adresie, ani odpowiedzi.
 */
export async function publicKnowledgeOwner(fromUrl?: string): Promise<string | undefined> {
  if (fromUrl) return fromUrl;

  const skonfigurowany = (import.meta as { env?: Record<string, string> }).env?.VITE_PUBLIC_KNOWLEDGE_USER;
  if (skonfigurowany) return skonfigurowany;

  try {
    const odpowiedz = await fetch('/public/knowledge/owners');
    if (odpowiedz.ok) {
      const { owners } = (await odpowiedz.json()) as { owners: string[] };
      // Jedna baza — nie ma czego wybierać. Kilka — bierzemy pierwszą, ale
      // wołający dostaje całą listę osobno i może dać wybór.
      if (owners?.length) return owners[0];
    }
  } catch {
    // Brak sieci albo starszy backend — schodzimy do zgadywania niżej.
  }

  return undefined;
}

/**
 * Który z właścicieli ma **ten** dokument.
 *
 * Adres bez właściciela trafia się w praktyce: link sprzed wprowadzenia
 * `u/{kto}` albo ręcznie skrócony. Wybranie pierwszego z brzegu daje wtedy
 * „nie ma dokumentu", choć plik istnieje — tyle że u kogoś innego. Skoro adres
 * wskazuje konkretny plik, wystarczy zapytać o niego po kolei.
 *
 * Pytamy `HEAD`-em: przy szukaniu interesuje nas samo istnienie, a dokumenty
 * podręcznika ważą po kilkaset kilobajtów z osadzonymi skanami.
 */
export async function findKnowledgeOwnerOf(path: string): Promise<string | undefined> {
  const wlasciciele = await publicKnowledgeOwners();

  for (const owner of wlasciciele) {
    const adres = `${publicBase(owner)}/${path.split('/').map(encodeURIComponent).join('/')}`;
    try {
      const odpowiedz = await fetch(adres, { method: 'HEAD' });
      if (odpowiedz.ok) return owner;

      /**
       * Serwer, który nie umie HEAD, odpowiada 404 także na istniejący plik.
       *
       * Tak było tutaj: publiczny Drive obsługiwał wyłącznie GET, więc sonda
       * HEAD dostawała 404 dla **każdego** właściciela, wyszukiwanie kończyło
       * się niczym i strona pokazywała „nie ma dokumentu" — mimo że zwykły GET
       * ten plik zwracał. Backend już to umie, ale sprawdzenie zostaje: jedno
       * dodatkowe żądanie jest tańsze niż komunikat o braku dokumentu, który
       * istnieje.
       */
      if (odpowiedz.status === 404 || odpowiedz.status === 405) {
        const zapasowe = await fetch(adres);
        if (zapasowe.ok) return owner;
      }
    } catch {
      // Ten właściciel odpada — próbujemy następnego.
    }
  }

  return undefined;
}

/** Wszystkie publiczne bazy — do wyboru, gdy jest ich więcej niż jedna. */
export async function publicKnowledgeOwners(): Promise<string[]> {
  try {
    const odpowiedz = await fetch('/public/knowledge/owners');
    if (!odpowiedz.ok) return [];
    const { owners } = (await odpowiedz.json()) as { owners: string[] };
    return owners ?? [];
  } catch {
    return [];
  }
}

export interface PublicFile {
  path: string;
  markdown: string;
}

interface TreeNode {
  name: string;
  path: string;
  type: string;
  children?: TreeNode[];
}

const publicBase = (owner: string) =>
  `/public/drive/users/${encodeURIComponent(owner)}/${ROOT_LABEL}`;

/** Ścieżki `.md` z drzewa, względem katalogu bazy. */
function zbierz(node: TreeNode, prefix = ''): string[] {
  const wlasna = prefix ? `${prefix}/${node.name}` : '';
  if (node.type === 'file') {
    return node.name.toLowerCase().endsWith('.md') ? [wlasna || node.name] : [];
  }
  // Korzeń nie wnosi członu do ścieżki — inaczej każdy dokument zaczynałby się
  // od „knowledge/", a identyfikatory rozjechałyby się z tymi z sesji.
  const podstawa = prefix === '' ? '' : wlasna;
  return (node.children ?? []).flatMap((c) => zbierz(c, podstawa === '' ? ' ' : podstawa))
    .map((p) => p.replace(/^ \//, ''));
}

/**
 * Wczytuje całą bazę przez publiczny endpoint.
 *
 * Pojedynczy plik, którego nie udało się pobrać, jest pomijany, a nie wywraca
 * całości: jeden zepsuty dokument nie może zabrać czytelnikowi biblioteki.
 * Brak samego katalogu to co innego — wtedy nie ma czego pokazać i mówimy to
 * wprost, zamiast zostawiać pustą stronę.
 */
export async function readPublicKnowledge(owner: string): Promise<PublicFile[]> {
  const base = publicBase(owner);

  const odpowiedz = await fetch(`${base}?list=1`);
  if (!odpowiedz.ok) {
    throw new Error(`Nie ma publicznej bazy wiedzy użytkownika „${owner}" (HTTP ${odpowiedz.status}).`);
  }

  const { tree } = (await odpowiedz.json()) as { tree: TreeNode };
  const sciezki = zbierz(tree, '');

  // Kolejka o stałej szerokości: pliki idą równolegle, ale nie wszystkie naraz.
  const pliki: PublicFile[] = [];
  let nastepny = 0;

  const pracownik = async () => {
    for (;;) {
      const i = nastepny;
      nastepny += 1;
      if (i >= sciezki.length) return;

      const sciezka = sciezki[i];
      const plik = await readPublicDocument(owner, sciezka);
      // Pojedynczy plik nie do pobrania — pomijamy, reszta biblioteki zostaje.
      if (plik) pliki[i] = plik;
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(PUBLIC_FETCH_CONCURRENCY, sciezki.length) }, pracownik),
  );

  // Dziury po nieudanych pobraniach znikają, kolejność zostaje ta z drzewa.
  return pliki.filter(Boolean);
}

/**
 * Ile plików pobieramy naraz.
 *
 * Baza podręcznika to 248 dokumentów i 3,5 MB; jeden po drugim znaczy 248
 * kolejek po sieci, czyli czekanie na całą bibliotekę dla jednego podrozdziału.
 * Bez ograniczenia z drugiej strony serwer dostaje całą falę w jednej chwili —
 * przeglądarka i tak by ją skolejkowała, ale backend niekoniecznie.
 */
export const PUBLIC_FETCH_CONCURRENCY = 8;

/**
 * Jeden dokument, bez listowania i bez reszty biblioteki.
 *
 * To jest droga dla czytelnika, który wszedł prosto w link do podrozdziału:
 * ma zobaczyć swój tekst od razu, a katalog i odsyłacze mogą dojść później.
 */
export async function readPublicDocument(
  owner: string,
  path: string,
): Promise<PublicFile | undefined> {
  const adres = `${publicBase(owner)}/${path.split('/').map(encodeURIComponent).join('/')}`;
  try {
    const odpowiedz = await fetch(adres);
    if (!odpowiedz.ok) return undefined;
    return { path, markdown: await odpowiedz.text() };
  } catch {
    return undefined;
  }
}
