/**
 * Renderer framebuffera panelu w symulatorze WASM.
 *
 * Klatka przychodzi jako RGBA8888 z pamięci WASM i musi trafić na ekran jak
 * najtaniej — szkic potrafi prezentować 60 razy na sekundę, a każda zbędna
 * kopia bufora 240×135 to ~130 kB przepisywane co klatkę.
 *
 * Ścieżka domyślna: **WebGL2**. Bajty idą wprost z widoku na stertę WASM do
 * tekstury (`texSubImage2D`), a skalowanie do rozmiaru elementu robi GPU
 * filtrem NEAREST — piksele zostają ostre, jak na prawdziwym panelu.
 * Zero kopii po stronie JS, zero pracy CPU przy powiększaniu.
 *
 * Fallback: canvas 2D (`putImageData`). Wymaga kopii do `Uint8ClampedArray`,
 * bo `ImageData` nie przyjmuje widoku na `SharedArrayBuffer` — dlatego jest
 * drugim wyborem, nie pierwszym.
 */

const VERTEX_SRC = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  // Quad w NDC; UV odwrócone w pionie, bo framebuffer ma wiersz 0 na górze,
  // a tekstury GL liczą V od dołu.
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT_SRC = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 fragColor;
void main() { fragColor = texture(uTex, vUv); }`;

export type RendererKind = 'webgl2' | 'canvas2d';

export interface DisplayRenderer {
  /** Której ścieżki faktycznie użyto — do pokazania w interfejsie. */
  readonly kind: RendererKind;
  /** Wrzuca klatkę na ekran. `data` może być widokiem na stertę WASM. */
  draw(data: Uint8Array, width: number, height: number): void;
  dispose(): void;
}

class WebGLDisplayRenderer implements DisplayRenderer {
  readonly kind = 'webgl2' as const;
  private texW = 0;
  private texH = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
    private readonly texture: WebGLTexture,
  ) {}

  draw(data: Uint8Array, width: number, height: number): void {
    const { gl, canvas } = this;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);

    // Realokacja tekstury tylko przy zmianie rozdzielczości panelu; w stanie
    // ustalonym każda klatka to samo podmienienie zawartości.
    if (width !== this.texW || height !== this.texH) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      this.texW = width;
      this.texH = height;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose(): void {
    const { gl } = this;
    gl.deleteTexture(this.texture);
    // Zwolnienie kontekstu jest istotne: przeglądarki trzymają limit kilkunastu
    // żywych kontekstów WebGL na kartę i po jego przekroczeniu ubijają najstarsze.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

class Canvas2DDisplayRenderer implements DisplayRenderer {
  readonly kind = 'canvas2d' as const;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
  ) {}

  draw(data: Uint8Array, width: number, height: number): void {
    const { canvas, ctx } = this;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    // Kopia wymuszona przez ImageData — nie przyjmuje widoku na SharedArrayBuffer.
    ctx.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  }

  dispose(): void { /* kontekst 2D nie wymaga zwalniania */ }
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[display] shader compile failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/** Buduje program, teksturę i quad. `null`, gdy WebGL2 jest niedostępny. */
function tryCreateWebGL(canvas: HTMLCanvasElement): DisplayRenderer | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    // Klatki wrzucamy ręcznie, więc nie chcemy czyszczenia bufora między nimi.
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[display] program link failed:', gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // NEAREST + CLAMP: piksele panelu mają zostać kwadratami przy powiększeniu,
  // a nie rozmazać się interpolacją.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // Wiersze są ciasno upakowane (4 bajty/piksel) — domyślne wyrównanie 4 pasuje,
  // ale ustawiamy jawnie, żeby nieparzyste szerokości też były bezpieczne.
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0);

  return new WebGLDisplayRenderer(canvas, gl, texture);
}

/**
 * Tworzy najszybszy dostępny renderer dla danego canvasu.
 * Kolejność: WebGL2 → canvas 2D.
 */
export function createDisplayRenderer(canvas: HTMLCanvasElement): DisplayRenderer | null {
  try {
    const gl = tryCreateWebGL(canvas);
    if (gl) return gl;
  } catch (err) {
    console.warn('[display] WebGL niedostępny, wracam do canvas 2D:', err);
  }
  const ctx = canvas.getContext('2d');
  return ctx ? new Canvas2DDisplayRenderer(canvas, ctx) : null;
}
