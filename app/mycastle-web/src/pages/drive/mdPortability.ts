// Narzędzia przenośności markdown: czyszczenie rozszerzeń MyCastle → czysty markdown,
// ekstrakcja linków do stron/zasobów oraz rozwiązywanie ścieżek względnych (do eksportu zip).

const IMG_EXT = 'png|jpe?g|gif|svg|webp|bmp|avif|ico|pdf';

/** Konwertuje markdown z rozszerzeniami MyCastle na czysty, przenośny markdown. */
export function stripMdExtensions(md: string): string {
  let s = md.replace(/\r\n/g, '\n');
  // Kotwice block-id (bookkeeping edytora).
  s = s.replace(/^[ \t]*<!--\s*bid:[0-9a-fA-F-]+\s*-->[ \t]*$/gm, '');
  // Osadzenia CAD/Scene: @[cad:mode:value] → czytelny tekst/link.
  s = s.replace(/@\[cad:(\w+):([^\]]+)\]/g, (_m, mode: string, val: string) =>
    /^https?:/i.test(val) ? `[CAD ${mode}](${val})` : `**[CAD ${mode}: ${val.split('/').pop()}]**`);
  // Osadzenia web: @[web:mode:value] → link jeśli URL.
  s = s.replace(/@\[web:\w+:([^\]]+)\]/g, (_m, val: string) => /^https?:/i.test(val) ? `[${val}](${val})` : `[${val}]`);
  // Pozostałe osadzenia @[type:…] (gallery/photomap/component/form/env/…): usuń marker.
  s = s.replace(/@\[[a-zA-Z]+:[^\]]*\]/g, '');
  // Osadzenia ![[path]] / wikilinki [[path]] → zwykły link relatywny.
  s = s.replace(/!?\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, path: string, _anchor: string, alias?: string) => {
    const p = path.trim();
    const target = /\.[a-z0-9]+$/i.test(p) ? p : `${p}.md`;
    return `[${(alias || p).trim()}](${target})`;
  });
  // Bloczki wykonywalne: ```pscript:… / ```automate:… → zwykły blok kodu JS.
  s = s.replace(/^```pscript:[^\n]*$/gm, '```js');
  s = s.replace(/^```automate:[^\n]*$/gm, '```js');
  return s.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').trimEnd() + '\n';
}

/** Wyodrębnia (relatywne, nie-http) linki do stron .md i zasobów (obrazy/pdf). */
export function extractMdLinks(md: string): { pages: string[]; assets: string[] } {
  const pages = new Set<string>();
  const assets = new Set<string>();
  const dec = (u: string) => { try { return decodeURIComponent(u); } catch { return u; } };
  const isRel = (u: string) => !!u && !/^(https?:|mailto:|#|data:)/i.test(u);

  // Zasoby (obrazy/pdf) — sprawdzaj PRZED stronami.
  const assetRe = new RegExp(`\\]\\(([^)]+\\.(?:${IMG_EXT}))(?:#[^)]*)?\\)`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = assetRe.exec(md))) { if (isRel(m[1])) assets.add(dec(m[1].trim())); }

  // Strony .md w standardowych linkach [txt](path.md).
  const pageRe = /\]\(([^)]+\.md)(?:#[^)]*)?\)/gi;
  while ((m = pageRe.exec(md))) { if (isRel(m[1])) pages.add(dec(m[1].trim())); }

  // Wikilinki [[path]] / ![[path]] → path(.md).
  const wikiRe = /!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/g;
  while ((m = wikiRe.exec(md))) {
    const p = m[1].trim();
    if (!p) continue;
    pages.add(/\.[a-z0-9]+$/i.test(p) ? dec(p) : `${dec(p)}.md`);
  }

  return { pages: [...pages], assets: [...assets] };
}

/** Normalizuje ścieżkę względną: fromDir + link → ścieżka VFS (drive-relative) lub null gdy wychodzi poza root. */
export function resolveRelPath(fromDir: string, link: string): string | null {
  if (link.startsWith('/')) return link.replace(/^\/+/, '');
  const base = fromDir ? fromDir.split('/').filter(Boolean) : [];
  const parts = link.split('/');
  const out = [...base];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') { if (out.length === 0) return null; out.pop(); }
    else out.push(p);
  }
  return out.join('/');
}

/** Katalog nadrzędny drive-relative ścieżki pliku. */
export function dirOf(rel: string): string {
  const i = rel.lastIndexOf('/');
  return i >= 0 ? rel.slice(0, i) : '';
}

/** Czy `p` jest w katalogu `base` lub jego podkatalogu. */
export function isWithin(base: string, p: string): boolean {
  if (!base) return true;
  return p === base || p.startsWith(base + '/');
}
