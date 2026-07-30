/**
 * MobileCursorBar — pasek doczepiony nad klawiaturą ekranową.
 *
 * Na telefonie precyzyjne postawienie kursora palcem jest walką: kliknięcie
 * trafia „mniej więcej", a klawiatury systemowe nie mają strzałek. Ten pasek
 * daje ← i →, które przesuwają karetkę o znak, oraz skoki na początek/koniec
 * linii.
 *
 * Dwie rzeczy decydują o tym, czy to w ogóle działa:
 *   • pasek NIE MOŻE zabierać fokusu — każde wciśnięcie blokuje domyślną akcję
 *     wskaźnika, bo utrata fokusu chowa klawiaturę i przerywa pisanie;
 *   • wykrycie klawiatury musi obsłużyć oba zachowania systemu — nakładkę
 *     (przeglądarka) i zmniejszenie okna (WebView aplikacji mobilnej). Szczegóły
 *     i powód w `keyboardInset.ts`; liczenie samą różnicą z `visualViewport`
 *     sprawiało, że w `app/mycastle-mobile` pasek nie pokazywał się nigdy.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import type * as monaco from 'monaco-editor';
import { keyboardState, type KeyboardState } from './keyboardInset';

export interface MobileCursorBarProps {
  /** Czy w ogóle pokazywać (tryb mobilny hosta). */
  enabled: boolean;
  /** Zwraca aktywny edytor — pobierany przy każdym wciśnięciu, bo aktywna grupa się zmienia. */
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null | undefined;
}

export function MobileCursorBar({ enabled, getEditor }: MobileCursorBarProps) {
  const [kb, setKb] = useState<KeyboardState>({ visible: false, inset: 0 });
  const [focused, setFocused] = useState(false);
  /** Powtarzanie przy przytrzymaniu — jak auto-repeat klawiatury sprzętowej. */
  const repeatRef = useRef<{ timeout?: number; interval?: number }>({});
  /** Największa wysokość widoku bez klawiatury — punkt odniesienia dla WebView. */
  const baselineRef = useRef({ width: 0, height: 0 });

  // Klawiatura nie zgłasza się żadnym zdarzeniem — jedyny sygnał to zmiana
  // wymiarów widoku.
  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;

    const update = () => {
      const height = vv?.height ?? window.innerHeight;
      const width = vv?.width ?? window.innerWidth;
      // Obrót ekranu zmienia wysokość „bez klawiatury", więc baseline liczymy
      // od nowa — inaczej portretowa wysokość udawałaby klawiaturę w poziomie.
      const base = baselineRef.current;
      if (base.width !== width) baselineRef.current = { width, height };
      else if (height > base.height) baselineRef.current = { width, height: height };

      setKb(keyboardState(
        { innerHeight: window.innerHeight, viewportHeight: vv?.height ?? null, offsetTop: vv?.offsetTop ?? 0 },
        baselineRef.current.height,
      ));
    };
    update();

    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    // `window.resize` to jedyny sygnał w WebView z adjustResize (visualViewport
    // tam też się zmienia, ale na starszych silnikach zdarzenie nie przychodzi).
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [enabled]);

  // Pasek ma sens tylko, gdy pisze się w edytorze — pilnujemy fokusu ukrytego
  // <textarea> Monaco, a nie dowolnego pola na stronie.
  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const el = document.activeElement as HTMLElement | null;
      setFocused(!!el?.classList?.contains('inputarea'));
    };
    check();
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', check);
    return () => {
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', check);
    };
  }, [enabled]);

  const stopRepeat = () => {
    window.clearTimeout(repeatRef.current.timeout);
    window.clearInterval(repeatRef.current.interval);
    repeatRef.current = {};
  };
  useEffect(() => stopRepeat, []);

  const run = (command: string) => {
    const editor = getEditor();
    if (!editor) return;
    // `trigger` używa wbudowanych komend Monaco, więc zaznaczanie, składanie kodu
    // i pozycja przewijania zachowują się dokładnie jak przy klawiszach strzałek.
    editor.trigger('mobile-cursor-bar', command, null);
    editor.focus();
  };

  const press = (command: string) => (e: React.PointerEvent) => {
    // Bez tego wciśnięcie zabiera fokus edytorowi i klawiatura się chowa.
    e.preventDefault();
    e.stopPropagation();
    run(command);
    stopRepeat();
    repeatRef.current.timeout = window.setTimeout(() => {
      repeatRef.current.interval = window.setInterval(() => run(command), 60);
    }, 400);
  };

  if (!enabled || !focused || !kb.visible) return null;

  const buttons: Array<{ title: string; command: string; icon: React.ReactNode }> = [
    { title: 'Początek linii', command: 'cursorHome', icon: <FirstPageIcon fontSize="small" /> },
    { title: 'Kursor w lewo', command: 'cursorLeft', icon: <KeyboardArrowLeftIcon /> },
    { title: 'Kursor w prawo', command: 'cursorRight', icon: <KeyboardArrowRightIcon /> },
    { title: 'Koniec linii', command: 'cursorEnd', icon: <LastPageIcon fontSize="small" /> },
  ];

  return (
    <Box
      // position: fixed + bottom = wysokość nakładki klawiatury; w WebView, gdzie
      // okno jest już skrócone, inset wynosi 0 i pasek siedzi na jego dole.
      // `env(safe-area-inset-bottom)` trzyma go nad gestem nawigacji.
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: kb.inset > 0 ? kb.inset : 'env(safe-area-inset-bottom, 0px)',
        zIndex: 1400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        px: 1,
        py: 0.5,
        bgcolor: '#2d2d2d',
        borderTop: '1px solid #444',
        boxShadow: '0 -4px 12px rgba(0,0,0,0.35)',
        touchAction: 'none',
      }}
      onPointerUp={stopRepeat}
      onPointerCancel={stopRepeat}
      onPointerLeave={stopRepeat}
    >
      {buttons.map((b) => (
        <Tooltip key={b.command} title={b.title}>
          <IconButton
            onPointerDown={press(b.command)}
            // Kliknięcie już obsłużyliśmy na pointerdown; blokujemy domyślne,
            // żeby przeglądarka nie wywołała akcji drugi raz.
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => e.preventDefault()}
            sx={{ color: '#ddd', bgcolor: '#3a3a3a', '&:active': { bgcolor: '#4a4a4a' }, borderRadius: 1.5, px: 2 }}
          >
            {b.icon}
          </IconButton>
        </Tooltip>
      ))}
    </Box>
  );
}
