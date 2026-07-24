/**
 * Ikony FreeCAD (LGPL) — pobrane skryptem scripts/fetch-freecad-icons.sh do
 * src/assets/freecad-icons/*.svg i importowane przez Vite (hashowane URL-e).
 *
 * Trzymamy je w `src/` (a NIE w `public/`), bo pliki dodane do public/ po starcie
 * dev-servera bywają serwowane jako 404 z cache przeglądarki („broken image").
 * Import przez `import.meta.glob` gwarantuje, że są zbundlowane i zawsze aktualne.
 */
const ICON_URLS = import.meta.glob('./freecad-icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Zwraca URL ikony o danej nazwie (bez rozszerzenia), lub undefined gdy brak. */
export function freecadIconUrl(name: string): string | undefined {
  const key = Object.keys(ICON_URLS).find(k => k.endsWith(`/${name}.svg`));
  return key ? ICON_URLS[key] : undefined;
}
