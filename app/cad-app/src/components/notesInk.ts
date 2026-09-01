/**
 * Dobór koloru pisaka do tła strony.
 *
 * Reguła jest jedna i musi obowiązywać w trzech momentach: przy starcie
 * aplikacji, przy zmianie tła strony i przy otwarciu zapisanego pliku.
 * Rozpisana osobno w każdym z nich rozjeżdżała się dokładnie tak, jak to
 * zwykle bywa — pisak startował biały niezależnie od tego, że przywrócona
 * strona miała białe tło, więc pierwsza kreska po uruchomieniu była
 * niewidoczna i wyglądała na zepsute rysowanie.
 */

/** Wartość koloru oznaczająca „bez obrysu". */
const TRANSPARENT = 'transparent';

const INK_ON_LIGHT = '#000000';
const INK_ON_DARK = '#ffffff';

/**
 * Czy kolor jest na tyle jasny, że czarny pisak będzie na nim czytelny.
 *
 * Próg liczony jasnością postrzeganą (waga składowych 299/587/114), a nie
 * średnią z kanałów: czysty niebieski i czysta zieleń mają tę samą średnią,
 * a różnią się czytelnością tak, że biały napis na jednym jest wyraźny,
 * a na drugim nieczytelny.
 *
 * Zapis, którego nie da się odczytać jako `#rrggbb` — w tym `transparent`
 * i postać skrócona — uchodzi za ciemny, bo domysł „biały pisak" jest
 * widoczny na domyślnym tle aplikacji.
 */
export function isLightColor(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}

/** Kolor pisaka czytelny na podanym tle. */
export function defaultInkFor(bgColor: string): string {
  return isLightColor(bgColor) ? INK_ON_LIGHT : INK_ON_DARK;
}

/**
 * Czy pisak zniknąłby na tym tle.
 *
 * Sprawdzenie jest po to, żeby **nie** podmieniać koloru, który użytkownik
 * wybrał świadomie: czerwony na białym zostaje czerwony. Podmieniamy dopiero
 * wtedy, gdy pisak i tło są po tej samej stronie progu jasności — czyli gdy
 * kreska byłaby nie do zobaczenia.
 */
export function needsInkSwitch(ink: string, bgColor: string): boolean {
  if (ink === TRANSPARENT) return false;
  return isLightColor(ink) === isLightColor(bgColor);
}
