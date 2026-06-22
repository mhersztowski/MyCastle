/** Notes data model + canvas page renderer (ported read-only from cad-app). */

export interface NotePoint { x: number; y: number; p: number }
export interface NoteStroke { id: string; kind: 'stroke'; tool: 'pencil' | 'marker'; color: string; width: number; points: NotePoint[] }
export interface NoteText { id: string; kind: 'text'; x: number; y: number; text: string; fontSize: number; color: string }
export interface NoteImage { id: string; kind: 'image'; x: number; y: number; w: number; h: number; src: string }
export type NoteElement = NoteStroke | NoteText | NoteImage;
export interface NotePage { id: string; elements: NoteElement[]; bgColor?: string }

export const CANVAS_W = 1400;
export const CANVAS_H = 900;
export const DEFAULT_BG = '#1a1a1a';

export function drawPage(
  ctx: CanvasRenderingContext2D,
  page: NotePage,
  imgCache: Map<string, HTMLImageElement>,
  onImgLoad: () => void,
): void {
  ctx.fillStyle = page.bgColor ?? DEFAULT_BG;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  for (const el of page.elements) {
    if (el.kind === 'image') {
      let img = imgCache.get(el.src);
      if (!img) {
        img = new Image();
        img.onload = onImgLoad;
        img.src = el.src;
        imgCache.set(el.src, img);
      }
      if (img.complete && img.naturalWidth > 0) ctx.drawImage(img, el.x, el.y, el.w, el.h);
    } else if (el.kind === 'text') {
      ctx.font = `${el.fontSize}px sans-serif`;
      ctx.fillStyle = el.color;
      ctx.fillText(el.text, el.x, el.y);
    } else {
      const pts = el.points;
      if (pts.length < 2) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (el.tool === 'marker') {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = el.color;
        ctx.lineWidth = el.width;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      } else {
        ctx.strokeStyle = el.color;
        for (let i = 1; i < pts.length; i++) {
          const pr = pts[i].p || 0.5;
          ctx.lineWidth = Math.max(0.5, el.width * pr * 2);
          ctx.beginPath();
          ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
          ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
}
