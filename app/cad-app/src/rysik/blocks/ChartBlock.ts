/**
 * Wykres słupkowy na canvasie 2D — drugi przypadek użycia kontraktu
 * `SceneBlock`. Nie ma tu kamery ani gizmo, więc pokazuje, ile z interfejsu
 * jest naprawdę wspólne: montowanie, przyrostowy `apply`, hitTest, selekcja
 * i snapshot.
 */

import { SceneEmitter } from './SceneBlock';
import type { CameraState, ResolvedChild, SceneBlock, SceneProps } from './SceneBlock';
import type { Primitive } from '../types';

const num = (v: Primitive | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const bool = (v: Primitive | undefined, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback;
const str = (v: Primitive | undefined, fallback: string): string =>
  typeof v === 'string' ? v : fallback;

const PALETTES: Record<string, string[]> = {
  steel: ['#4a90d9', '#5aa9e6', '#7cb9e8', '#356fa8'],
  warm: ['#e57373', '#ffb74d', '#ffd54f', '#f06292'],
  mono: ['#9e9e9e', '#bdbdbd', '#757575', '#e0e0e0'],
};

interface Bar {
  id: string;
  label: string;
  value: number;
}

interface BarRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class ChartBlock implements SceneBlock {
  private readonly emitter = new SceneEmitter();
  private host: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private props: SceneProps = {};
  private bars: Bar[] = [];
  private rects: BarRect[] = [];
  private selected: string | null = null;

  mount(host: HTMLElement, initial: SceneProps): void {
    this.host = host;
    this.props = { ...initial };

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    host.appendChild(canvas);
    this.canvas = canvas;

    canvas.addEventListener('pointerdown', this.onPointerDown);
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(host);
    this.draw();
  }

  dispose(): void {
    this.canvas?.removeEventListener('pointerdown', this.onPointerDown);
    this.resizeObserver?.disconnect();
    if (this.canvas && this.host?.contains(this.canvas)) this.host.removeChild(this.canvas);
    this.emitter.clear();
    this.canvas = null;
    this.host = null;
  }

  on = this.emitter.on.bind(this.emitter);

  apply(patch: Partial<SceneProps>): void {
    if (Object.keys(patch).length === 0) return;
    this.props = { ...this.props, ...patch } as SceneProps;
    this.draw();
  }

  setChildren(collection: string, items: ResolvedChild[]): void {
    if (collection !== 'bars') return;
    this.bars = items.map(item => ({
      id: item.id,
      label: str(item.props.label, item.id),
      value: num(item.props.value, 0),
    }));
    this.draw();
  }

  select(id: string | null): void {
    this.selected = id;
    this.draw();
  }

  hitTest(x: number, y: number): string | null {
    if (!this.canvas) return null;
    const rect = this.canvas.getBoundingClientRect();
    const px = x - rect.left;
    const py = y - rect.top;
    const hit = this.rects.find(r => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
    return hit ? `bar:${hit.id}` : null;
  }

  async snapshot(): Promise<Blob | null> {
    if (!this.canvas) return null;
    return new Promise(resolve => this.canvas!.toBlob(blob => resolve(blob), 'image/png'));
  }

  /** Wykres nie ma kamery — pole „ustaw jako widok początkowy” go nie dotyczy. */
  getCamera(): CameraState | null { return null; }
  setCamera(): void { /* brak kamery */ }

  private onPointerDown = (e: PointerEvent): void => {
    const id = this.hitTest(e.clientX, e.clientY);
    this.emitter.emit('selectionRequest', { id });
    if (!id) return;
    const bar = this.bars.find(b => `bar:${b.id}` === id);
    if (bar) this.emitter.emit('pick', { id: bar.id, label: bar.label, value: bar.value });
  };

  private draw(): void {
    const canvas = this.canvas;
    const host = this.host;
    if (!canvas || !host) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = str(this.props.background, '#0f1216');
    ctx.fillRect(0, 0, w, h);

    const title = str(this.props.title, '');
    const padTop = title ? 44 : 20;
    const padLeft = 56;
    const padBottom = 40;
    const padRight = 20;

    if (title) {
      ctx.fillStyle = '#e0e0e0';
      ctx.font = '600 16px sans-serif';
      ctx.fillText(title, padLeft, 28);
    }

    const plotW = Math.max(10, w - padLeft - padRight);
    const plotH = Math.max(10, h - padTop - padBottom);
    const scale = num(this.props.scale, 1);
    const values = this.bars.map(b => b.value * scale);
    const maxValue = Math.max(1, ...values.map(Math.abs));
    const palette = PALETTES[str(this.props.palette, 'steel')] ?? PALETTES.steel;
    const horizontal = str(this.props.orientation, 'vertical') === 'horizontal';

    if (bool(this.props.showGrid, true)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        ctx.beginPath();
        if (horizontal) {
          const x = padLeft + t * plotW;
          ctx.moveTo(x, padTop);
          ctx.lineTo(x, padTop + plotH);
        } else {
          const y = padTop + plotH - t * plotH;
          ctx.moveTo(padLeft, y);
          ctx.lineTo(padLeft + plotW, y);
        }
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '11px sans-serif';
        const labelValue = `${Math.round(maxValue * t)}${str(this.props.unit, '')}`;
        if (horizontal) ctx.fillText(labelValue, padLeft + t * plotW - 8, padTop + plotH + 16);
        else ctx.fillText(labelValue, 8, padTop + plotH - t * plotH + 4);
      }
    }

    this.rects = [];
    if (this.bars.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '13px sans-serif';
      ctx.fillText('Brak serii — dodaj słupek w inspektorze', padLeft, padTop + plotH / 2);
      return;
    }

    const gap = num(this.props.gap, 8);
    const count = this.bars.length;
    const slot = (horizontal ? plotH : plotW) / count;
    const thickness = Math.max(2, slot - gap);

    this.bars.forEach((bar, i) => {
      const value = bar.value * scale;
      const ratio = Math.abs(value) / maxValue;
      const color = palette[i % palette.length];
      const active = this.selected === `bar:${bar.id}`;

      let rect: BarRect;
      if (horizontal) {
        const len = ratio * plotW;
        rect = { id: bar.id, x: padLeft, y: padTop + i * slot + gap / 2, w: len, h: thickness };
      } else {
        const len = ratio * plotH;
        rect = { id: bar.id, x: padLeft + i * slot + gap / 2, y: padTop + plotH - len, w: thickness, h: len };
      }
      this.rects.push(rect);

      ctx.fillStyle = color;
      ctx.globalAlpha = active ? 1 : 0.85;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.globalAlpha = 1;
      if (active) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(rect.x - 1, rect.y - 1, rect.w + 2, rect.h + 2);
      }

      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '11px sans-serif';
      if (horizontal) {
        ctx.fillText(bar.label, padLeft + 6, rect.y + thickness / 2 + 4);
      } else {
        ctx.save();
        ctx.translate(rect.x + thickness / 2, padTop + plotH + 14);
        ctx.textAlign = 'center';
        ctx.fillText(bar.label, 0, 0);
        ctx.restore();
        if (bool(this.props.showValues, false)) {
          ctx.textAlign = 'center';
          ctx.fillText(String(Math.round(value * 100) / 100), rect.x + thickness / 2, rect.y - 6);
          ctx.textAlign = 'left';
        }
      }
    });
  }
}

export const createChartBlock = (): SceneBlock => new ChartBlock();
