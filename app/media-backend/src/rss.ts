/**
 * Odczyt kanału RSS podkastu.
 *
 * Katalog mówi, że podkast istnieje; dopiero kanał mówi, **co i skąd**
 * odtworzyć. Adres pliku dźwiękowego jest w `<enclosure url="…">` i to jedyne
 * pole, bez którego odcinek nie ma sensu — resztę da się pokazać pustą.
 *
 * Parser jest własny i celowo mały. Kanały podkastowe to płaski RSS 2.0
 * z kilkoma polami `itunes:`; wciąganie pełnego parsera XML dokładałoby
 * zależność, która musiałaby przejść przez wszystkie budowy monorepo po to,
 * żeby czytać sześć znaczników. Cena: parser nie obsłuży XML-a z przestrzeniami
 * nazw zapisanymi inaczej niż w praktyce robią to generatory kanałów — i to
 * jest granica, przy której trzeba będzie sięgnąć po bibliotekę.
 */

export interface Episode {
  /** `guid` z kanału albo adres pliku, gdy kanał go nie podaje. */
  id: string;
  title: string;
  /** Adres pliku dźwiękowego — bez tego odcinka nie ma. */
  mediaUrl: string;
  mediaType: string;
  /** Czas trwania w sekundach; 0, gdy kanał nie podaje. */
  durationSec: number;
  /** Data publikacji w postaci z kanału, bez przeliczania. */
  published: string;
  description: string;
  image: string;
}

export interface Feed {
  title: string;
  author: string;
  description: string;
  image: string;
  episodes: Episode[];
}

/** Zdejmuje CDATA i rozwija encje, które realnie występują w kanałach. */
function decode(text: string): string {
  const withoutCdata = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return withoutCdata
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    // `&amp;` na końcu, inaczej rozwinęłoby encje powstałe z poprzednich kroków.
    .replace(/&amp;/g, '&')
    .trim();
}

/** Treść pierwszego wystąpienia znacznika. */
function tagText(xml: string, tag: string): string {
  const escaped = tag.replace(':', '\\:');
  const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, 'i').exec(xml);
  return match ? decode(match[1]) : '';
}

/** Wartość atrybutu w pierwszym wystąpieniu znacznika. */
function tagAttr(xml: string, tag: string, attr: string): string {
  const escaped = tag.replace(':', '\\:');
  const open = new RegExp(`<${escaped}\\s[^>]*>`, 'i').exec(xml);
  if (!open) return '';
  const value = new RegExp(`${attr}\\s*=\\s*"([^"]*)"|${attr}\\s*=\\s*'([^']*)'`, 'i').exec(open[0]);
  return value ? decode(value[1] ?? value[2] ?? '') : '';
}

/**
 * Czas trwania z `itunes:duration` na sekundy.
 *
 * Pole bywa liczbą sekund albo zapisem `HH:MM:SS` lub `MM:SS` — generatory
 * kanałów nie są tu zgodne, a odtwarzacz potrzebuje jednej liczby.
 */
export function parseDuration(raw: string): number {
  const text = raw.trim();
  if (!text) return 0;
  if (/^\d+$/.test(text)) return Number(text);

  const parts = text.split(':').map((p) => Number(p));
  if (parts.some((p) => Number.isNaN(p))) return 0;

  return parts.reduce((acc, part) => acc * 60 + part, 0);
}

/** Rozkłada kanał na opis podkastu i listę odcinków. */
export function parseFeed(xml: string): Feed {
  // Opis kanału bierzemy z części przed pierwszym `<item>`, żeby tytuł podkastu
  // nie został nadpisany tytułem pierwszego odcinka.
  const firstItem = xml.search(/<item[\s>]/i);
  const head = firstItem >= 0 ? xml.slice(0, firstItem) : xml;

  const episodes: Episode[] = [];
  const itemPattern = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;

  for (let match = itemPattern.exec(xml); match !== null; match = itemPattern.exec(xml)) {
    const item = match[1];
    const mediaUrl = tagAttr(item, 'enclosure', 'url');
    // Wpis bez pliku dźwiękowego bywa w kanałach zapowiedzią albo wpisem
    // tekstowym; odtwarzacz nie ma z nim co zrobić.
    if (!mediaUrl) continue;

    episodes.push({
      id: tagText(item, 'guid') || mediaUrl,
      title: tagText(item, 'title'),
      mediaUrl,
      mediaType: tagAttr(item, 'enclosure', 'type') || 'audio/mpeg',
      durationSec: parseDuration(tagText(item, 'itunes:duration')),
      published: tagText(item, 'pubDate'),
      description: tagText(item, 'description') || tagText(item, 'itunes:summary'),
      image: tagAttr(item, 'itunes:image', 'href'),
    });
  }

  return {
    title: tagText(head, 'title'),
    author: tagText(head, 'itunes:author') || tagText(head, 'managingEditor'),
    description: tagText(head, 'description'),
    image: tagAttr(head, 'itunes:image', 'href') || tagText(head, 'url'),
    episodes,
  };
}

/**
 * Pobiera i rozkłada kanał.
 *
 * Rozmiar odpowiedzi jest ograniczony, bo kanał podkastu z tysiącem odcinków
 * potrafi mieć kilkanaście megabajtów, a serwer trzyma go w pamięci w całości.
 */
export async function fetchFeed(
  url: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  maxBytes = 8 * 1024 * 1024,
): Promise<Feed> {
  const res = await fetchImpl(url, { headers: { 'User-Agent': 'MyCastle-Media/1.0' } });
  if (!res.ok) throw new Error(`Kanał odpowiedział HTTP ${res.status}`);

  const text = await res.text();
  if (text.length > maxBytes) throw new Error('Kanał jest większy niż dopuszczalne 8 MB');

  return parseFeed(text);
}
