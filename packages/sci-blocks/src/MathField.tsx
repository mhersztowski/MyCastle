/**
 * MathField — wizualna edycja wzoru.
 *
 * Raport (§3.4): kliknięcie wzoru nie ma otwierać pola tekstowego z LaTeX-em,
 * tylko **edytor matematyki** — kursor chodzi po strukturze (licznik, mianownik,
 * wykładnik, wnętrze pierwiastka), a ułamki i pierwiastki wstawia się z palety.
 * Na urządzeniu dotykowym dochodzi wbudowana klawiatura matematyczna, dzięki
 * czemu wzór da się napisać bez znajomości LaTeX-a.
 *
 * Dwie decyzje warte uzasadnienia:
 *
 *  • **MathLive ładowany leniwie.** To web component ważący kilkaset kilobajtów;
 *    czytelnik, który tylko czyta, nie ma powodu go pobierać. Ładuje się dopiero
 *    przy wejściu w tryb edycji.
 *  • **Źródłem prawdy zostaje LaTeX.** Edytor jest widokiem nad tekstem, który i
 *    tak leży w pliku — dokument pozostaje czystym markdownem, a tryb źródłowy
 *    z ręcznym LaTeX-em działa dalej dla tych, którzy go wolą.
 */
import { useEffect, useRef, useState } from 'react';

export interface MathFieldProps {
  /** Wzór w LaTeX-u — wartość początkowa edycji. */
  latex: string;
  /** Zatwierdzenie zmiany; wywoływane przy wyjściu z pola i przy Enterze. */
  onCommit: (latex: string) => void;
  onCancel?: () => void;
  /** Klawiatura matematyczna — na dotyku włączona, na myszy zbędna. */
  virtualKeyboard?: 'auto' | 'manual' | 'off';
}

export function MathField({ latex, onCommit, onCancel, virtualKeyboard = 'auto' }: MathFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [stan, setStan] = useState<'ładowanie' | 'gotowe' | 'błąd'>('ładowanie');
  /** Najnowsza treść pola — czytana przy zatwierdzeniu, bez renderów po drodze. */
  const wartoscRef = useRef(latex);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    let anulowane = false;
    const host = hostRef.current;
    if (!host) return undefined;

    let pole: HTMLElement | undefined;

    import('mathlive')
      .then((mathlive) => {
        if (anulowane || !hostRef.current) return;

        // Rejestracja web componentu jest idempotentna, ale wywołujemy ją
        // jawnie: bez niej `<math-field>` bywa nieznanym elementem, gdy moduł
        // został załadowany przez inny bundel.
        mathlive.MathfieldElement.soundsDirectory = null;
        pole = document.createElement('math-field');
        pole.setAttribute('virtual-keyboard-mode', virtualKeyboard);
        // Menu kontekstowe MathLive dubluje paletę i zasłania wzór w wąskim
        // bloku dokumentu.
        pole.setAttribute('menu-editor', 'none');
        (pole as any).value = latex;
        pole.style.fontSize = '18px';
        pole.style.width = '100%';
        pole.style.padding = '4px 6px';
        pole.style.border = '1px solid #a855f7';
        pole.style.borderRadius = '4px';

        pole.addEventListener('input', () => { wartoscRef.current = (pole as any).value; });
        pole.addEventListener('change', () => onCommitRef.current((pole as any).value));
        pole.addEventListener('keydown', (event) => {
          const klawisz = (event as KeyboardEvent).key;
          if (klawisz === 'Escape') { event.preventDefault(); onCancel?.(); }
        });

        hostRef.current.appendChild(pole);
        (pole as any).focus?.();
        setStan('gotowe');
      })
      .catch(() => { if (!anulowane) setStan('błąd'); });

    return () => {
      anulowane = true;
      // Zatwierdzenie przy odmontowaniu: użytkownik, który kliknął obok, nie
      // spodziewa się utraty tego, co właśnie napisał.
      if (pole && wartoscRef.current !== latex) onCommitRef.current(wartoscRef.current);
      pole?.remove();
    };
    // Zależności celowo puste: pole żyje przez cały czas edycji, a zmiana
    // `latex` z zewnątrz w trakcie pisania kasowałaby wpisywany wzór.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stan === 'błąd') {
    return (
      <div style={{ fontSize: 12, color: '#b91c1c' }}>
        Nie udało się wczytać edytora wzorów. Popraw wzór w trybie źródłowym.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div ref={hostRef} />
      {stan === 'ładowanie' && (
        <span style={{ fontSize: 11, color: '#94a3b8' }}>wczytuję edytor wzorów…</span>
      )}
      {stan === 'gotowe' && (
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          Enter zatwierdza, Esc anuluje. Ułamek: <code>/</code>, pierwiastek: <code>\sqrt</code>,
          potęga: <code>^</code>.
        </span>
      )}
    </div>
  );
}
