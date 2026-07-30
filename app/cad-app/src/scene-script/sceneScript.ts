/**
 * sceneScript.ts — rdzeń uruchamiania skryptów TypeScript powiązanych ze sceną.
 *
 * Scena (`SceneGraph.script`) wskazuje plik `.ts` w VFS. Przycisk „Run" otwiera
 * podgląd sceny i wykonuje ten plik w piaskownicy `new Function`, dając mu
 * dostęp do grafu sceny i pętli klatek.
 *
 * Ten moduł jest świadomie wolny od DOM-u, Monaco i Three.js — dzięki temu
 * logika (usuwanie importów, sprzątanie po `stop()`, liczenie `dt`) jest
 * testowalna bez przeglądarki. Transpilacja i render siedzą w `runSceneScript.ts`
 * oraz w `SceneRunDialog.tsx`.
 *
 * Mutacje przez `node.setPosition/​setRotation/​setScale` są widoczne od razu, bo
 * `SceneNode` przepisuje je na przypięty `_threeObject` — pętla klatek nie
 * potrzebuje więc żadnego re-renderu Reacta.
 */
import type { SceneGraph, SceneNode } from '@mhersztowski/core-scene3d';

export interface SceneScriptLogEntry {
  level: 'log' | 'info' | 'warn' | 'error';
  text: string;
}

/** Callback pętli klatek: `dt` i `elapsed` w sekundach. */
export type FrameCallback = (dt: number, elapsed: number) => void;

type TimerFn = (handler: () => void, timeout?: number) => number;
type ClearFn = (id: number) => void;

export interface SceneScriptSessionOptions {
  onLog?: (entry: SceneScriptLogEntry) => void;
  /** Wstrzykiwane w testach — w przeglądarce domyślnie okno globalne. */
  setTimeout?: TimerFn;
  setInterval?: TimerFn;
  clearTimeout?: ClearFn;
  clearInterval?: ClearFn;
}

/** API widoczne w skrypcie jako `scene`. */
export interface SceneScriptApi {
  /** Graf sceny w uruchomionym podglądzie (kopia, nie edytowany dokument). */
  graph: SceneGraph;
  /** Węzeł po id, a jeśli nie ma — po nazwie. */
  find(target: string): SceneNode | null;
  /** Wszystkie węzły (bez root), opcjonalnie filtrowane po nazwie. */
  findAll(name?: string): SceneNode[];
  /** Obiekt Three przypięty do węzła przez viewer (`null` przed pierwszą klatką). */
  object(target: string | SceneNode): unknown | null;
  /** Rejestruje callback pętli klatek; zwraca funkcję odsubskrybowania. */
  onFrame(cb: FrameCallback): () => void;
  log(...args: unknown[]): void;
  console: Record<'log' | 'info' | 'warn' | 'error' | 'debug', (...args: unknown[]) => void>;
  setTimeout: TimerFn;
  setInterval: TimerFn;
  clearTimeout: ClearFn;
  clearInterval: ClearFn;
}

const fmt = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.stack ?? v.message;
  try { return JSON.stringify(v); } catch { return String(v); }
};

/**
 * Jeden przebieg skryptu: pętla klatek, timery i sprzątanie.
 *
 * `tick(now)` jest wołany z `requestAnimationFrame` (w testach ręcznie), więc
 * sesja nie zna źródła czasu.
 */
export class SceneScriptSession {
  readonly api: SceneScriptApi;
  stopped = false;

  private frames: FrameCallback[] = [];
  private timers: number[] = [];
  private intervals: number[] = [];
  private startTime: number | null = null;
  private lastTime = 0;
  /** Błąd w klatce zgłaszamy raz — inaczej 60 wpisów na sekundę zasypie konsolę. */
  private frameErrorReported = false;

  constructor(private graph: SceneGraph, private opts: SceneScriptSessionOptions = {}) {
    const g = globalThis as unknown as {
      setTimeout: TimerFn; setInterval: TimerFn; clearTimeout: ClearFn; clearInterval: ClearFn;
    };
    const setT = opts.setTimeout ?? g.setTimeout.bind(globalThis);
    const setI = opts.setInterval ?? g.setInterval.bind(globalThis);
    const clrT = opts.clearTimeout ?? g.clearTimeout.bind(globalThis);
    const clrI = opts.clearInterval ?? g.clearInterval.bind(globalThis);

    const emit = (level: SceneScriptLogEntry['level'], args: unknown[]) => {
      this.opts.onLog?.({ level, text: args.map(fmt).join(' ') });
    };

    this.api = {
      graph,
      find: (target) => this.find(target),
      findAll: (name) => this.findAll(name),
      object: (target) => {
        const node = typeof target === 'string' ? this.find(target) : target;
        return node?._threeObject ?? null;
      },
      onFrame: (cb) => {
        if (this.stopped) return () => { /* sesja już zakończona */ };
        this.frames.push(cb);
        return () => { this.frames = this.frames.filter((c) => c !== cb); };
      },
      log: (...args) => emit('log', args),
      console: {
        log: (...a) => emit('log', a),
        info: (...a) => emit('info', a),
        warn: (...a) => emit('warn', a),
        error: (...a) => emit('error', a),
        debug: (...a) => emit('log', a),
      },
      setTimeout: (h, t) => {
        if (this.stopped) return 0;
        const id = setT(h, t);
        this.timers.push(id);
        return id;
      },
      setInterval: (h, t) => {
        if (this.stopped) return 0;
        const id = setI(h, t);
        this.intervals.push(id);
        return id;
      },
      clearTimeout: clrT,
      clearInterval: clrI,
    };
    this.clearTimeoutFn = clrT;
    this.clearIntervalFn = clrI;
  }

  private clearTimeoutFn: ClearFn;
  private clearIntervalFn: ClearFn;

  private find(target: string): SceneNode | null {
    const byId = this.graph.findNode(target);
    if (byId) return byId;
    let found: SceneNode | null = null;
    this.graph.traverse((node) => {
      if (!found && node !== this.graph.root && node.name === target) found = node;
    });
    return found;
  }

  private findAll(name?: string): SceneNode[] {
    const out: SceneNode[] = [];
    this.graph.traverse((node) => {
      if (node === this.graph.root) return;
      if (name === undefined || node.name === name) out.push(node);
    });
    return out;
  }

  /** Jedna klatka. `now` w milisekundach (skala `performance.now()`). */
  tick(now: number): void {
    if (this.stopped) return;
    if (this.startTime === null) { this.startTime = now; this.lastTime = now; }
    const dt = (now - this.lastTime) / 1000;
    const elapsed = (now - this.startTime) / 1000;
    this.lastTime = now;
    for (const cb of [...this.frames]) {
      try {
        cb(dt, elapsed);
      } catch (e) {
        if (!this.frameErrorReported) {
          this.frameErrorReported = true;
          this.opts.onLog?.({ level: 'error', text: `Błąd w pętli klatek: ${fmt(e)}` });
        }
      }
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.frames = [];
    for (const id of this.timers) this.clearTimeoutFn(id);
    for (const id of this.intervals) this.clearIntervalFn(id);
    this.timers = [];
    this.intervals = [];
  }
}

export interface StripImportsResult {
  /** Kod bez deklaracji importów. */
  code: string;
  /** Linie `const … = __ns.__mN;` do wstrzyknięcia przed kodem. */
  bindings: string[];
  /** Namespace’y podstawiane pod `__ns`. */
  namespaces: Record<string, unknown>;
}

/**
 * Usuwa deklaracje `import` i zamienia je na wiązania z gotowych modułów.
 *
 * Skrypt sceny nie jest bundlowany, więc `import` z Three.js czy core-scene3d
 * nie ma jak się rozwiązać. Zamiast zmuszać użytkownika do pisania bez importów
 * (Monaco i tak podpowiada z nimi), przepisujemy je na destrukturyzację
 * namespace’ów przekazanych przez hosta. `resolve` zwraca `null` dla modułów,
 * których nie znamy — taki import po prostu znika (dotyczy m.in. `import type`).
 *
 * Wzorowane na `runBrowserComponent` z mycastle-web, ale dopuszcza importy
 * wieloliniowe — tam pojedyncza linia wystarczała, tu nie: Monaco formatuje
 * dłuższe listy nazw pionowo.
 */
export function stripImports(source: string, resolve: (spec: string) => unknown | null): StripImportsResult {
  const namespaces: Record<string, unknown> = {};
  const bindings: string[] = [];
  let idx = 0;

  const withClause = /^[ \t]*import\s+(?:type\s+)?([\s\S]*?)\s*from\s*['"]([^'"]+)['"][ \t]*;?[ \t]*$/gm;
  let code = source.replace(withClause, (_m, clauseRaw: string, spec: string) => {
    const ns = resolve(spec);
    if (ns == null) return '';
    const key = `__m${idx++}`;
    namespaces[key] = ns;
    const clause = clauseRaw.trim();
    if (clause.startsWith('{')) {
      const names = clause.slice(1, clause.lastIndexOf('}')).split(',')
        .map((s) => s.trim()).filter(Boolean)
        .filter((s) => !s.startsWith('type '))
        .map((s) => {
          const [orig, alias] = s.split(/\s+as\s+/).map((x) => x.trim());
          return alias ? `${orig}: ${alias}` : orig;
        });
      if (names.length) bindings.push(`const { ${names.join(', ')} } = __ns.${key};`);
    } else if (clause.startsWith('*')) {
      bindings.push(`const ${clause.replace(/\*\s*as\s*/, '').trim()} = __ns.${key};`);
    } else if (clause) {
      bindings.push(`const ${clause} = (__ns.${key}.default ?? __ns.${key});`);
    }
    return '';
  });

  // Import efektu ubocznego (`import 'x.css'`) nie ma czego wiązać.
  code = code.replace(/^[ \t]*import\s+['"][^'"]+['"][ \t]*;?[ \t]*$/gm, '');
  return { code, bindings, namespaces };
}
