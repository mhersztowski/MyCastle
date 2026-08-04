/**
 * UiLayer.tsx — widżety uikit rysowane w kanwie, ułożone przez `@mhersztowski/layout`.
 *
 * Każdy widżet jest `positionType="absolute"` i dostaje gotowe `left/top/width/height`.
 * Własny układ uikita (yoga) jest tu **wyłączony z premedytacją** — gdyby liczył
 * pozycje razem z solverem, to samo pytanie miałoby dwie odpowiedzi i przy
 * pierwszej rozbieżności nie dałoby się powiedzieć, która jest prawdziwa. Yoga
 * zostaje wyłącznie do wyśrodkowania napisu wewnątrz widżetu, czyli tam, gdzie
 * jest jedynym silnikiem.
 *
 * **Wersja uikita musi zostać na 0.8.x i nie wolno jej podnieść samej.** Linia
 * 1.x jest zbudowana pod `@react-three/fiber` 9 i dokłada `declare module
 * '@react-three/fiber' { interface ThreeElements … }`. Przy fiberze 8 takiej
 * nazwy nie ma, więc augmentacja tworzy ją od zera i psuje globalną przestrzeń
 * JSX — objawem nie jest błąd w tym pliku, tylko **setka błędów „implicit any"
 * w handlerach MUI w całej aplikacji**, w plikach, których nikt nie tykał.
 *
 * Płaszczyzna jest ekranowa (`Fullscreen`), więc jednostka layoutu to piksel
 * kanwy, a przesunięcie wskaźnika przekłada się na ruch widżetu jeden do jednego.
 * Rozmiar kanwy podajemy w górę: dopiero wtedy kotwice i przepływ mają się do
 * czego odnosić, a zwężenie panelu bocznego przelicza interfejs tak samo jak
 * zmiana okna przeglądarki.
 */
import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Container, Fullscreen, Text } from '@react-three/uikit';
import type { Rect } from '@mhersztowski/layout';

export interface UiLayerWidget {
  /** Identyfikator **węzła sceny** — tym samym mówi drzewo i inspektor. */
  nodeId: string;
  kind: 'panel' | 'button' | 'label' | 'bar';
  rect: Rect;
  text?: string;
  color?: string;
  value?: number;
}

const DOMYSLNE_BARWY: Record<UiLayerWidget['kind'], string> = {
  panel: '#1b2430',
  button: '#2f6fb0',
  label: '#00000000',
  bar: '#243447',
};

export interface UiLayerProps {
  widgets: UiLayerWidget[];
  selectedNodeId?: string | null;
  /** Poza trybem edycji widżety nie przechwytują wskaźnika, więc kamera działa normalnie. */
  editing?: boolean;
  onSelect?: (nodeId: string) => void;
  /** Wołane w trakcie i na koniec ruchu; `cel` to lewy górny róg w pikselach kanwy. */
  onDrag?: (nodeId: string, cel: { x: number; y: number }, zakonczone: boolean) => void;
  onViewportSize?: (w: number, h: number) => void;
}

export function UiLayer({ widgets, selectedNodeId, editing = false, onSelect, onDrag, onViewportSize }: UiLayerProps) {
  const rozmiar = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as { enabled?: boolean } | null;

  useEffect(() => {
    onViewportSize?.(rozmiar.width, rozmiar.height);
  }, [rozmiar.width, rozmiar.height, onViewportSize]);

  /** Stan ruchu w ref, nie w stanie: wskaźnik melduje częściej, niż React rysuje. */
  const ruch = useRef<{ nodeId: string; startX: number; startY: number; rect: Rect } | null>(null);

  useEffect(() => {
    if (!editing) return undefined;

    const przesun = (e: PointerEvent) => {
      const r = ruch.current;
      if (!r) return;
      onDrag?.(r.nodeId, { x: r.rect.x + (e.clientX - r.startX), y: r.rect.y + (e.clientY - r.startY) }, false);
    };
    const koniec = (e: PointerEvent) => {
      const r = ruch.current;
      if (!r) return;
      ruch.current = null;
      // Kamerę odblokowujemy dopiero po zakończeniu ruchu — inaczej to samo
      // przeciągnięcie obracałoby scenę i przesuwało widżet naraz.
      if (controls) controls.enabled = true;
      onDrag?.(r.nodeId, { x: r.rect.x + (e.clientX - r.startX), y: r.rect.y + (e.clientY - r.startY) }, true);
    };

    window.addEventListener('pointermove', przesun);
    window.addEventListener('pointerup', koniec);
    window.addEventListener('pointercancel', koniec);
    return () => {
      window.removeEventListener('pointermove', przesun);
      window.removeEventListener('pointerup', koniec);
      window.removeEventListener('pointercancel', koniec);
    };
  }, [editing, onDrag, controls]);

  const zacznij = (w: UiLayerWidget, e: { nativeEvent?: PointerEvent; stopPropagation?: () => void }) => {
    if (!editing) return;
    e.stopPropagation?.();
    const natywne = e.nativeEvent;
    if (!natywne) return;
    onSelect?.(w.nodeId);
    if (controls) controls.enabled = false;
    ruch.current = { nodeId: w.nodeId, startX: natywne.clientX, startY: natywne.clientY, rect: { ...w.rect } };
  };

  return (
    <Fullscreen
      // Sam korzeń przepuszcza wskaźnik: interfejs zajmuje ułamek kanwy, a orbita
      // kamery musi działać wszędzie poza widżetami.
      pointerEvents="none"
      depthTest={false}
      renderOrder={1}
    >
      {widgets.map((w) => {
        const barwa = w.color || DOMYSLNE_BARWY[w.kind];
        const zaznaczony = w.nodeId === selectedNodeId;

        return (
          <Container
            key={w.nodeId}
            positionType="absolute"
            positionLeft={Math.round(w.rect.x)}
            positionTop={Math.round(w.rect.y)}
            width={Math.max(1, Math.round(w.rect.w))}
            height={Math.max(1, Math.round(w.rect.h))}
            backgroundColor={w.kind === 'label' ? undefined : barwa}
            borderRadius={w.kind === 'bar' ? 7 : 6}
            borderWidth={zaznaczony ? 2 : 0}
            borderColor="#ffffff"
            alignItems="center"
            justifyContent={w.kind === 'label' ? 'flex-start' : 'center'}
            paddingX={w.kind === 'bar' ? 0 : 8}
            pointerEvents={editing ? 'auto' : 'none'}
            cursor={editing ? 'move' : undefined}
            onPointerDown={(e: { nativeEvent?: PointerEvent; stopPropagation?: () => void }) => zacznij(w, e)}
          >
            {w.kind === 'bar' && (
              // Wypełnienie paska jest zwykłym dzieckiem układanym przez uikit:
              // to jedyne miejsce, gdzie jego układ nikomu nie wchodzi w drogę.
              <Container
                positionType="absolute"
                positionLeft={0}
                positionTop={0}
                width={Math.max(0, Math.round(w.rect.w * Math.min(1, Math.max(0, w.value ?? 0))))}
                height={Math.max(1, Math.round(w.rect.h))}
                borderRadius={7}
                backgroundColor="#4caf7d"
              />
            )}
            {w.text ? (
              <Text fontSize={w.kind === 'label' ? 15 : 14} color="#eef2f6">
                {w.text}
              </Text>
            ) : null}
          </Container>
        );
      })}
    </Fullscreen>
  );
}
