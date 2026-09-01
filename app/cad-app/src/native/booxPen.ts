/**
 * booxPen — most do niskoopóźnieniowego rysowania na czytnikach Onyx Boox.
 *
 * ## Po co to w ogóle jest
 *
 * Na ekranie E Ink kreska rysowana w kanwie HTML pojawia się z opóźnieniem
 * rzędu 150–300 ms, i nie jest to wina kodu strony. Droga jest długa:
 * zdarzenie wskaźnika → obsługa w JS → `canvas 2d` → złożenie w WebView →
 * SurfaceFlinger → żądanie odświeżenia panelu. Panel dostaje na końcu zwykłą
 * falę odświeżania (GC16/GU16), bo system nie ma powodu sądzić, że to pisanie.
 *
 * Onyx rozwiązuje to `TouchHelper`-em z pakietu `onyxsdk-pen`: sterownik rysuje
 * pociągnięcie **wprost na panelu**, z pominięciem całego potoku Androida.
 * Cena jest taka, że pióro przestaje docierać do WebView — dopóki tryb jest
 * włączony, strona nie zobaczy ani jednego `pointerdown` z piórka.
 *
 * Stąd kształt tego modułu: strona **oddaje** obszar kanwy warstwie natywnej
 * i **odbiera** gotowe pociągnięcia po oderwaniu pióra. Rysunek na ekranie
 * pojawia się od razu (rysuje sterownik), a model dokumentu dostaje ten sam
 * ślad chwilę później i przy najbliższym odświeżeniu przejmuje go pod siebie.
 *
 * ## Podział pracy między JS a Kotlinem
 *
 * Cała arytmetyka układów współrzędnych siedzi tutaj, a nie w module
 * natywnym — bo tutaj da się ją sprawdzić testem. Warstwa natywna dostaje
 * gotowy prostokąt w pikselach urządzenia i zwraca punkty w tym samym
 * układzie; jedyne, co dokłada od siebie, to położenie samego WebView
 * na ekranie.
 *
 * W zwykłej przeglądarce `window.__booxPen` nie istnieje i nic z tego pliku
 * się nie uruchamia — kanwa obsługuje pióro tak jak dotąd.
 */

/** Punkt tak, jak podaje go sterownik: piksele urządzenia, nacisk w skali sterownika. */
export interface NativePenPoint {
  x: number;
  y: number;
  pressure: number;
  ts: number;
}

/** Pociągnięcie zamknięte oderwaniem pióra (albo gumki). */
export interface NativeStroke {
  points: NativePenPoint[];
  /** `true`, gdy użytkownik użył gumki (przycisk boczny albo drugi koniec pióra). */
  erase: boolean;
}

/** Prostokąt w pikselach urządzenia, względem lewego górnego rogu WebView. */
export interface DeviceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Prostokąt w pikselach CSS, tak jak zwraca go `getBoundingClientRect`. */
export interface CssRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AreaOptions {
  /** Grubość kreski w pikselach CSS. */
  strokeWidth: number;
  /** Kolor kreski — sterownik i tak rysuje na czarno-białym panelu, ale SDK go przyjmuje. */
  color: string;
}

export interface AreaMessage extends DeviceRect {
  type: 'boox:area';
  strokeWidth: number;
  color: string;
}

export interface EnableMessage {
  type: 'boox:enabled';
  enabled: boolean;
}

export interface ReleaseMessage {
  type: 'boox:release';
}

export type BooxPenMessage = AreaMessage | EnableMessage | ReleaseMessage;

/**
 * Kontrakt wstrzykiwany przez powłokę React Native (`app/mycastle-mobile`).
 *
 * `available` mówi o **urządzeniu**, nie o istnieniu mostka: aplikacja
 * uruchomiona na zwykłym telefonie wstrzykuje mostek z `available: false`
 * i opisem powodu, żeby strona mogła powiedzieć użytkownikowi, czemu nic
 * się nie zmieniło, zamiast milczeć.
 */
/**
 * Faktyczny stan sterownika, meldowany przez warstwę natywną.
 *
 * `engaged` znaczy „sterownik **wziął** pióro", a nie „poprosiliśmy o to".
 * Różnica jest istotna, bo wszystkie drogi niepowodzenia po stronie natywnej
 * biegną wewnątrz `runOnUiThread`, już po spełnieniu obietnicy — bez tego
 * kanału awaria wygląda dokładnie jak powodzenie.
 */
export interface NativeStatus {
  engaged: boolean;
  error: string | null;
}

export interface BooxPenBridge {
  available: boolean;
  /** Krótki opis stanu — nazwa urządzenia albo powód niedostępności. */
  info?: string;
  send(message: BooxPenMessage): void;
  onStroke: ((stroke: NativeStroke) => void) | null;
  onStatus?: ((status: NativeStatus) => void) | null;
}

type MaybeHost = (Window & { __booxPen?: BooxPenBridge }) | undefined;

/** Mostek, jeśli strona działa w powłoce natywnej — inaczej `null`. */
export function getBooxPen(win: MaybeHost = typeof window === 'undefined' ? undefined : window): BooxPenBridge | null {
  return win?.__booxPen ?? null;
}

/** `true` tylko wtedy, gdy rysowanie natywne naprawdę zadziała. */
export function isBooxPenAvailable(win?: MaybeHost): boolean {
  return getBooxPen(win)?.available === true;
}

/**
 * W którym z czterech stanów jesteśmy.
 *
 * Powód istnienia jest praktyczny: „nie działa" ma tu cztery różne przyczyny,
 * a wszystkie wyglądają tak samo — pióro po prostu rysuje z opóźnieniem.
 * Rozróżnienie ich po objawie jest niemożliwe, więc strona musi je nazwać
 * sama. Najkosztowniejsze jest odróżnienie **przeglądarki** od **nieaktualnej
 * aplikacji**: w obu `window.__booxPen` nie istnieje, a znaczy to co innego —
 * w pierwszym przypadku wszystko jest w porządku, w drugim trzeba wgrać nowy
 * pakiet. Sygnaturę powłoki niesie jej własny fragment `user agent`
 * (`applicationNameForUserAgent` w `App.tsx`).
 */
export type PenHostState =
  | { kind: 'browser' }
  | { kind: 'shell-old' }
  | { kind: 'unsupported'; info?: string }
  | { kind: 'ready'; info?: string };

/** Fragment `user agent`, którym powłoka React Native oznacza się na stronie. */
const SHELL_UA_MARKER = 'MyCastleMobile';

export function describeHost(win?: MaybeHost): PenHostState {
  const w = win ?? (typeof window === 'undefined' ? undefined : window);
  const bridge = getBooxPen(w);
  if (bridge) {
    return bridge.available
      ? { kind: 'ready', info: bridge.info }
      : { kind: 'unsupported', info: bridge.info };
  }
  const ua = w?.navigator?.userAgent ?? '';
  return ua.includes(SHELL_UA_MARKER) ? { kind: 'shell-old' } : { kind: 'browser' };
}

/**
 * Prostokąt kanwy przeliczony na piksele urządzenia.
 *
 * Zaokrąglenie do pełnych pikseli nie jest kosmetyką: `setLimitRect` przyjmuje
 * `android.graphics.Rect`, czyli liczby całkowite, a ścięcie ułamka po stronie
 * Javy przesunęłoby granicę obszaru o pół piksela w nieprzewidywalną stronę.
 */
export function areaMessage(rect: CssRect, dpr: number, opts: AreaOptions): AreaMessage {
  const scale = dpr > 0 ? dpr : 1;
  return {
    type: 'boox:area',
    left: Math.round(rect.left * scale),
    top: Math.round(rect.top * scale),
    width: Math.round(rect.width * scale),
    height: Math.round(rect.height * scale),
    // Kreska o zerowej szerokości jest dla sterownika poprawna i niewidoczna.
    strokeWidth: Math.max(1, Math.round(opts.strokeWidth * scale)),
    color: opts.color,
  };
}

/** Największa wartość nacisku, jaką podaje sterownik Onyksa. */
const DRIVER_PRESSURE_MAX = 4096;

/** Nacisk używany, gdy sterownik go nie podaje — środek zakresu, kreska równa. */
const NEUTRAL_PRESSURE = 0.5;

/**
 * Sprowadza nacisk całego pociągnięcia do zakresu 0..1.
 *
 * Skala rozstrzyga się **raz na pociągnięcie**, a nie osobno dla każdego punktu.
 * Pojedynczy punkt o wartości 1 jest niejednoznaczny — w skali sterownika to
 * nacisk prawie zerowy, w skali znormalizowanej maksymalny — a próg zakładany
 * punktowo zgrubiałby kreskę dokładnie tam, gdzie pióro ledwo dotknęło ekranu.
 */
export function normalizeStrokePressure(raw: number[]): number[] {
  if (raw.length === 0) return [];
  const max = Math.max(...raw);
  if (max <= 0) return raw.map(() => NEUTRAL_PRESSURE);
  const scale = max <= 1 ? 1 : DRIVER_PRESSURE_MAX;
  return raw.map((p) => Math.min(1, Math.max(0, p / scale)));
}

/** Punkt gotowy do wrzucenia w kanwę: piksele CSS względem kanwy, nacisk 0..1. */
export interface CanvasPenPoint {
  x: number;
  y: number;
  pressure: number;
}

/** Przelicza pociągnięcie z pikseli urządzenia na współrzędne kanwy. */
export function toCanvasPoints(stroke: NativeStroke, area: DeviceRect, dpr: number): CanvasPenPoint[] {
  const scale = dpr > 0 ? dpr : 1;
  const pressure = normalizeStrokePressure(stroke.points.map((p) => p.pressure));
  return stroke.points.map((p, i) => ({
    x: (p.x - area.left) / scale,
    y: (p.y - area.top) / scale,
    pressure: pressure[i],
  }));
}

/**
 * Ile punktów pociągnięcia wypadło poza zadeklarowanym obszarem.
 *
 * Miara istnieje dla jednego, konkretnego błędu: gdyby warstwa natywna
 * zwracała współrzędne w innym układzie niż przyjmuje (ekran zamiast WebView),
 * każde pociągnięcie lądowałoby konsekwentnie obok kanwy, przesunięte o
 * wysokość paska stanu. Bez tego objaw brzmi „pióro nie działa" i nie niesie
 * żadnej wskazówki, gdzie szukać.
 */
export function fractionOutside(points: NativePenPoint[], area: DeviceRect): number {
  if (points.length === 0) return 0;
  const outside = points.filter(
    (p) =>
      p.x < area.left ||
      p.y < area.top ||
      p.x > area.left + area.width ||
      p.y > area.top + area.height,
  ).length;
  return outside / points.length;
}
