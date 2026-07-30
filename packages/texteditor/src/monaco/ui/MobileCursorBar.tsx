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
 *   • pozycja liczona jest z `visualViewport`, a nie z `window.innerHeight` —
 *     tylko ten pierwszy wie, ile ekranu zasłania klawiatura.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import type * as monaco from 'monaco-editor';

/** Poniżej tylu pikseli „zjedzonych" z viewportu uznajemy, że klawiatura jest schowana. */
const KEYBOARD_MIN_PX = 120;

export interface MobileCursorBarProps {
  /** Czy w ogóle pokazywać (tryb mobilny hosta). */
  enabled: boolean;
  /** Zwraca aktywny edytor — pobierany przy każdym wciśnięciu, bo aktywna grupa się zmienia. */
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null | undefined;
}

/** Ile pikseli u dołu okna zasłania klawiatura (0 = schowana). */
function keyboardInset(): number {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return 0;
  const inset = window.innerHeight - vv.height - vv.offsetTop;
  return inset > KEYBOARD_MIN_PX ? inset : 0;
}

export function MobileCursorBar({ enabled, getEditor }: MobileCursorBarProps) {
  const [inset, setInset] = useState(0);
  const [focused, setFocused] = useState(false);
  /** Powtarzanie przy przytrzymaniu — jak auto-repeat klawiatury sprzętowej. */
  const repeatRef = useRef<{ timeout?: number; interval?: number }>({});

  // Klawiatura nie zgłasza się żadnym zdarzeniem — jedyny sygnał to zmiana
  // wysokości widocznego obszaru.
  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(keyboardInset());
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
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

  if (!enabled || !focused || inset === 0) return null;

  const buttons: Array<{ title: string; command: string; icon: React.ReactNode }> = [
    { title: 'Początek linii', command: 'cursorHome', icon: <FirstPageIcon fontSize="small" /> },
    { title: 'Kursor w lewo', command: 'cursorLeft', icon: <KeyboardArrowLeftIcon /> },
    { title: 'Kursor w prawo', command: 'cursorRight', icon: <KeyboardArrowRightIcon /> },
    { title: 'Koniec linii', command: 'cursorEnd', icon: <LastPageIcon fontSize="small" /> },
  ];

  return (
    <Box
      // position: fixed + bottom = wysokość klawiatury — pasek „przykleja się"
      // do jej górnej krawędzi i jedzie razem z nią przy zmianie wysokości.
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: inset,
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
