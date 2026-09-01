/**
 * useBooxPen — oddaje obszar kanwy sterownikowi pióra Onyksa i odbiera od
 * niego gotowe pociągnięcia.
 *
 * Powód istnienia opisuje `booxPen.ts`. Tu jest tylko cykl życia: kiedy
 * przejąć pióro, kiedy je oddać i co zrobić, gdy kanwa zmieni rozmiar.
 *
 * Trzy rzeczy, które łatwo przeoczyć, a które ten hook pilnuje:
 *
 *  • **Kolejność.** Najpierw obszar, potem włączenie. Tryb surowy bez
 *    ograniczenia obszaru przejmuje pióro na całym ekranie — łącznie z
 *    przyciskami paska narzędzi, które przestają reagować.
 *
 *  • **Zwolnienie przy odmontowaniu.** Sterownik nie wie, że okno dialogowe
 *    się zamknęło. Pominięte zwolnienie zostawia czytnik w stanie, w którym
 *    pióro nie działa nigdzie w aplikacji aż do jej ubicia.
 *
 *  • **Spóźnione pociągnięcia.** Sterownik potrafi dostarczyć ostatni ślad już
 *    po przełączeniu narzędzia. Bez odsiania kreska pojawia się w trybie,
 *    w którym użytkownik przesuwał widok.
 *
 *  • **Obszar przed włączeniem.** Kanwa w trakcie animacji otwierania dialogu
 *    ma rozmiar zerowy. Tryb surowy włączony bez podanego obszaru przejmuje
 *    pióro na **całym ekranie** — łącznie z paskiem narzędzi i resztą
 *    aplikacji — więc czekamy, aż kanwa dostanie wymiary.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  areaMessage,
  fractionOutside,
  getBooxPen,
  toCanvasPoints,
  type CanvasPenPoint,
  type DeviceRect,
  type NativeStroke,
} from './booxPen';

export interface UseBooxPenOptions {
  /** Element, którego prostokąt oddajemy sterownikowi. */
  target: React.RefObject<HTMLElement | null>;
  /** Czy sterownik ma teraz przejąć pióro. */
  active: boolean;
  strokeWidth: number;
  color: string;
  onStroke: (points: CanvasPenPoint[], erase: boolean) => void;
}

export interface BooxPenStatus {
  /** Czy rysowanie natywne jest w ogóle możliwe na tym urządzeniu. */
  available: boolean;
  /** Nazwa urządzenia albo powód niedostępności — do pokazania użytkownikowi. */
  info?: string;
  /** Czy sterownik trzyma teraz pióro. */
  engaged: boolean;
}

/** Udział punktów poza obszarem, powyżej którego uznajemy układ za rozjechany. */
const OFFSET_ALARM = 0.5;

export function useBooxPen(opts: UseBooxPenOptions): BooxPenStatus {
  const { target, active, strokeWidth, color, onStroke } = opts;

  const bridge = getBooxPen();
  const available = bridge?.available === true;

  const [engaged, setEngaged] = useState(false);
  // Czy sterownik dostał już sensowny obszar. Osobno od `active`, bo kanwa
  // bywa gotowa dopiero kilka klatek po tym, jak strona chce zacząć rysować.
  const [areaReady, setAreaReady] = useState(false);

  // Ostatnio zgłoszony obszar — potrzebny przy przeliczaniu punktów z powrotem
  // na współrzędne kanwy. Trzymany w ref, bo czyta go wywołanie zwrotne
  // sterownika, które nie ma nic wspólnego z cyklem renderowania Reacta.
  const areaRef = useRef<DeviceRect | null>(null);
  const onStrokeRef = useRef(onStroke);
  onStrokeRef.current = onStroke;
  const engagedRef = useRef(false);
  const warnedRef = useRef(false);

  const publishArea = useCallback((): boolean => {
    if (!bridge?.available) return false;
    const el = target.current;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const dpr = window.devicePixelRatio || 1;
    const msg = areaMessage(rect, dpr, { strokeWidth, color });
    areaRef.current = { left: msg.left, top: msg.top, width: msg.width, height: msg.height };
    bridge.send(msg);
    setAreaReady(true);
    return true;
  }, [bridge, target, strokeWidth, color]);

  // Odbiór pociągnięć. Osobny efekt od włączania, bo wywołanie zwrotne ma być
  // podpięte także wtedy, gdy tryb dopiero się włącza — sterownik bywa szybszy
  // niż kolejny przebieg efektów.
  useEffect(() => {
    if (!bridge?.available) return;
    const handler = (stroke: NativeStroke) => {
      if (!engagedRef.current) return;
      const area = areaRef.current;
      if (!area) return;
      if (!warnedRef.current && fractionOutside(stroke.points, area) > OFFSET_ALARM) {
        warnedRef.current = true;
        // Konsekwentne trafianie obok kanwy znaczy jedno: warstwa natywna
        // liczy współrzędne w innym układzie niż tutaj przyjmujemy.
        console.warn(
          '[booxPen] pociągnięcia trafiają poza zadeklarowany obszar — ' +
            'sprawdź przesunięcie WebView w module natywnym',
          { area, first: stroke.points[0] },
        );
      }
      const dpr = window.devicePixelRatio || 1;
      onStrokeRef.current(toCanvasPoints(stroke, area, dpr), stroke.erase);
    };
    bridge.onStroke = handler;
    return () => {
      // Tylko własne wywołanie zwrotne — mostek ma jedno gniazdo, a bezwarunkowe
      // wyzerowanie zabrałoby je komuś, kto podpiął się później.
      if (bridge.onStroke === handler) bridge.onStroke = null;
    };
  }, [bridge]);

  // Geometria — zadeklarowana **przed** włączaniem, żeby pierwszy obszar poszedł
  // przed pierwszym `enabled: true`.
  useEffect(() => {
    if (!bridge?.available || !active) {
      setAreaReady(false);
      return;
    }
    const el = target.current;
    if (!el) return;

    const refresh = () => { publishArea(); };
    refresh();

    // Dwie dodatkowe próby po kolejnych klatkach: dialog MUI otwiera się
    // animacją, a w jej trakcie kanwa ma jeszcze rozmiar zerowy.
    const frames = [
      requestAnimationFrame(refresh),
      requestAnimationFrame(() => requestAnimationFrame(refresh)),
    ];

    const observer = new ResizeObserver(refresh);
    observer.observe(el);
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      frames.forEach(cancelAnimationFrame);
      observer.disconnect();
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [bridge, active, target, publishArea]);

  // Włączanie i wyłączanie trybu surowego.
  useEffect(() => {
    if (!bridge?.available) return;
    // Bez obszaru sterownik przejąłby pióro na całym ekranie — patrz nagłówek.
    if (!active || !areaReady) return;

    bridge.send({ type: 'boox:enabled', enabled: true });
    engagedRef.current = true;
    setEngaged(true);

    return () => {
      engagedRef.current = false;
      setEngaged(false);
      bridge.send({ type: 'boox:enabled', enabled: false });
    };
  }, [bridge, active, areaReady]);

  // Zwolnienie sterownika przy odmontowaniu — patrz nagłówek pliku.
  useEffect(() => {
    if (!bridge?.available) return;
    return () => {
      bridge.send({ type: 'boox:release' });
    };
  }, [bridge]);

  return { available, info: bridge?.info, engaged };
}
