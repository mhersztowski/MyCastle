/**
 * Kontrakt panel ↔ scena.
 *
 * Scena jest funkcją stanu — poza rzeczami efemerycznymi (bufory, cache siatki)
 * nie trzyma własnej prawdy. Dwie reguły, których nie wolno złamać:
 *
 *  1. Scena NIGDY nie zapisuje do dokumentu. Emituje `propChanged`, a host
 *     decyduje, czy to trafi do modelu — inaczej giną undo i pojawiają się
 *     pętle sprzężenia.
 *  2. `apply()` jest idempotentne i przyrostowe. Zmiana azymutu Słońca nie
 *     może przebudowywać siatki terenu — to różnica między 60 fps a slajdami.
 */

import type { Primitive } from '../types';

/** Wartości już rozwiązane — scena nie wie nic o `ref` ani `expr`. */
export type SceneProps = Record<string, Primitive>;

export interface ResolvedChild {
  id: string;
  kind: string;
  props: SceneProps;
}

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

/**
 * Faza zmiany zgłaszanej przez gizmo. Host tłumaczy ją na transakcję:
 * `begin` → beginTransaction, `change` → update, `end` → commit.
 */
export type ChangePhase = 'begin' | 'change' | 'end';

export interface PropChangedEvent {
  /** Ścieżka względna: `sunAzimuth` albo `markers/barania/lat`. */
  path: string;
  value: Primitive;
  phase: ChangePhase;
  /** Etykieta dla historii — „Azymut Słońca 180 → 210”. */
  label?: string;
}

export interface SceneEventMap {
  pick: Record<string, Primitive>;
  propChanged: PropChangedEvent;
  selectionRequest: { id: string | null };
  cameraChanged: CameraState;
  error: { message: string };
}

export type Unsub = () => void;

export interface SceneBlock {
  mount(host: HTMLElement, initial: SceneProps): void;
  /** Mutacja przyrostowa — tylko klucze obecne w patchu. */
  apply(patch: Partial<SceneProps>): void;
  /** Podmiana kolekcji podelementów (markery, słupki). */
  setChildren(collection: string, items: ResolvedChild[]): void;
  /** Podświetlenie; zaznaczenie jest stanem hosta, scena tylko renderuje. */
  select(id: string | null): void;
  hitTest(x: number, y: number): string | null;
  /** Zrzut do eksportu statycznego (PDF). */
  snapshot(): Promise<Blob | null>;
  /** Kamera to stan sesji — host pobiera ją tylko na żądanie użytkownika. */
  getCamera(): CameraState | null;
  setCamera(state: CameraState): void;
  dispose(): void;
  on<K extends keyof SceneEventMap>(event: K, cb: (payload: SceneEventMap[K]) => void): Unsub;
}

export type SceneBlockFactory = () => SceneBlock;

/** Wspólna obsługa subskrypcji dla implementacji scen. */
export class SceneEmitter {
  private readonly handlers = new Map<string, Set<(payload: never) => void>>();

  on<K extends keyof SceneEventMap>(event: K, cb: (payload: SceneEventMap[K]) => void): Unsub {
    const set = this.handlers.get(event) ?? new Set();
    set.add(cb as (payload: never) => void);
    this.handlers.set(event, set);
    return () => { set.delete(cb as (payload: never) => void); };
  }

  emit<K extends keyof SceneEventMap>(event: K, payload: SceneEventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const cb of [...set]) (cb as (p: SceneEventMap[K]) => void)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
