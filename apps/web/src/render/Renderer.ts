/**
 * WebGL2-Renderer des Vorschaumonitors (design.md D4). Kein React: Die
 * Komponente `PreviewCanvas` besitzt eine Instanz und ruft nur `resize` und
 * `draw*` auf.
 *
 * - Jedes Bild wird per Canvas2D auf schwarzen 4:3-Grund eingepasst und als
 *   Frame-Textur in Puffergröße hochgeladen; die Shader arbeiten im Frame-Raum.
 * - Pro Übergang ein Programm (prelude + Shader + epilogue), lazy kompiliert
 *   und gecacht. Ein Kompilier-/Linkfehler wird geloggt und fällt auf Fade zurück.
 * - Ein verlorener Kontext beendet das Zeichnen still.
 */
import { bufferSize, containRect } from "./geometry";
import { FALLBACK_TRANSITION_ID, fragmentSourceFor, VERTEX_SOURCE } from "./shaderSource";

export type ImageSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

export class WebGL2UnsupportedError extends Error {
  constructor() {
    super("WebGL2 wird von diesem Browser nicht unterstützt.");
    this.name = "WebGL2UnsupportedError";
  }
}

export interface RendererOptions {
  /** Für Testhooks/Screenshots: Puffer nach dem Compositing behalten. */
  preserveDrawingBuffer?: boolean;
}

interface ProgramInfo {
  program: WebGLProgram;
  progress: WebGLUniformLocation | null;
  resolution: WebGLUniformLocation | null;
  from: WebGLUniformLocation | null;
  to: WebGLUniformLocation | null;
  params: Map<string, WebGLUniformLocation | null>;
}

/** Natürliche Pixelgröße einer Bildquelle. */
export function sourceSize(source: ImageSource): { width: number; height: number } {
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

/** Eine eingepasste Bildquelle als Textur. Wird bei geänderter Puffergröße neu eingepasst. */
export class FrameTexture {
  /** Puffergröße, für die die Textur zuletzt eingepasst wurde (0 = noch nie). */
  width = 0;
  height = 0;
  disposed = false;

  constructor(
    readonly source: ImageSource,
    readonly texture: WebGLTexture,
  ) {}
}

type Canvas2D = HTMLCanvasElement | OffscreenCanvas;

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private readonly canvas: HTMLCanvasElement;
  private readonly vao: WebGLVertexArrayObject | null;
  private vertexShader: WebGLShader | null = null;
  /** Ergebnis je Übergangs-ID; ein fehlerhafter Shader zeigt auf das Fade-Programm. */
  private readonly programs = new Map<string, ProgramInfo | null>();
  private readonly frames = new Set<FrameTexture>();
  private letterboxCanvas: Canvas2D | null = null;
  private lost = false;
  private disposed = false;
  private readonly maxSize: number;

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    });
    if (!gl) throw new WebGL2UnsupportedError();
    this.gl = gl;
    this.canvas = canvas;
    this.vao = gl.createVertexArray();
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    this.maxSize = Math.min(
      gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      maxViewport[0] ?? 4096,
      maxViewport[1] ?? 4096,
    );
    canvas.addEventListener("webglcontextlost", this.onContextLost);
  }

  get isContextLost(): boolean {
    return this.lost || this.gl.isContextLost();
  }

  get width(): number {
    return this.canvas.width;
  }

  get height(): number {
    return this.canvas.height;
  }

  /** Puffer auf die größte ganzzahlige 4:3-Fläche der CSS-Box (mal DPR) setzen. */
  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    const { width, height } = bufferSize(cssWidth, cssHeight, dpr, this.maxSize);
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  /** Kompiliert alle bekannten Übergänge vorab (sonst geschieht das beim ersten Zeichnen). */
  precompile(ids: Iterable<string>): void {
    for (const id of ids) this.programFor(id);
  }

  createFrame(source: ImageSource): FrameTexture {
    const { gl } = this;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Textur konnte nicht angelegt werden.");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const frame = new FrameTexture(source, texture);
    this.frames.add(frame);
    this.ensureLetterboxed(frame);
    return frame;
  }

  deleteFrame(frame: FrameTexture): void {
    if (frame.disposed) return;
    frame.disposed = true;
    this.frames.delete(frame);
    if (!this.isContextLost) this.gl.deleteTexture(frame.texture);
  }

  drawEmpty(): void {
    if (!this.canDraw()) return;
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Ein einzelnes Bild: Fade-Programm mit from = to, progress 0. */
  drawStill(frame: FrameTexture): void {
    this.drawTransition(frame, frame, FALLBACK_TRANSITION_ID, 0, {});
  }

  drawTransition(
    from: FrameTexture,
    to: FrameTexture,
    transitionId: string,
    progress: number,
    params: Readonly<Record<string, number>>,
  ): void {
    if (!this.canDraw()) return;
    const info = this.programFor(transitionId);
    if (!info) {
      this.drawEmpty();
      return;
    }
    const { gl } = this;
    this.ensureLetterboxed(from);
    this.ensureLetterboxed(to);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL-Aufruf, kein React-Hook.
    gl.useProgram(info.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, from.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, to.texture);
    gl.uniform1i(info.from, 0);
    gl.uniform1i(info.to, 1);
    gl.uniform1f(info.progress, Math.min(Math.max(progress, 0), 1));
    gl.uniform2f(info.resolution, this.canvas.width, this.canvas.height);
    for (const [name, value] of Object.entries(params)) {
      let loc = info.params.get(name);
      if (loc === undefined) {
        loc = gl.getUniformLocation(info.program, name);
        info.params.set(name, loc);
      }
      if (loc !== null) gl.uniform1f(loc, value);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    if (this.isContextLost) return;
    const { gl } = this;
    for (const frame of [...this.frames]) this.deleteFrame(frame);
    const deleted = new Set<WebGLProgram>();
    for (const info of this.programs.values()) {
      if (info && !deleted.has(info.program)) {
        gl.deleteProgram(info.program);
        deleted.add(info.program);
      }
    }
    this.programs.clear();
    if (this.vertexShader) gl.deleteShader(this.vertexShader);
    if (this.vao) gl.deleteVertexArray(this.vao);
    // Den Kontext bewusst nicht per WEBGL_lose_context abgeben: Unter React
    // StrictMode wird dieselbe Canvas sofort wieder verwendet.
  }

  private readonly onContextLost = (event: Event): void => {
    // Ohne preventDefault würde der Browser nie einen Neustart anbieten; wir
    // zeichnen ab hier einfach nicht mehr.
    event.preventDefault();
    this.lost = true;
  };

  private canDraw(): boolean {
    return !this.disposed && !this.isContextLost;
  }

  /** Bild in eine schwarze 4:3-Fläche in Puffergröße einpassen und hochladen. */
  private ensureLetterboxed(frame: FrameTexture): void {
    const { width, height } = this.canvas;
    if (frame.disposed || (frame.width === width && frame.height === height)) return;
    const box = this.letterbox(frame.source, width, height);
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, frame.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, box);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    frame.width = width;
    frame.height = height;
  }

  private letterbox(source: ImageSource, width: number, height: number): Canvas2D {
    let canvas = this.letterboxCanvas;
    if (!canvas) {
      canvas =
        typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(width, height)
          : document.createElement("canvas");
      this.letterboxCanvas = canvas;
    }
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) throw new Error("Canvas2D ist nicht verfügbar.");
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    const size = sourceSize(source);
    const r = containRect(size.width, size.height, width, height);
    if (r.width > 0 && r.height > 0) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, r.x, r.y, r.width, r.height);
    }
    return canvas;
  }

  private programFor(transitionId: string): ProgramInfo | null {
    const cached = this.programs.get(transitionId);
    if (cached !== undefined) return cached;

    let info: ProgramInfo | null = null;
    const source = fragmentSourceFor(transitionId);
    if (source === undefined) {
      console.error(`Kein Shader für Übergang „${transitionId}“; verwende Überblenden.`);
    } else {
      info = this.compile(transitionId, source);
    }
    if (!info && transitionId !== FALLBACK_TRANSITION_ID) {
      info = this.programFor(FALLBACK_TRANSITION_ID);
    }
    this.programs.set(transitionId, info);
    return info;
  }

  private compile(id: string, fragmentSource: string): ProgramInfo | null {
    const { gl } = this;
    const vs = this.vertex();
    if (!vs) return null;
    const fs = this.shader(gl.FRAGMENT_SHADER, fragmentSource, id);
    if (!fs) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(`Shader „${id}“ lässt sich nicht linken:`, gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return {
      program,
      progress: gl.getUniformLocation(program, "progress"),
      resolution: gl.getUniformLocation(program, "resolution"),
      from: gl.getUniformLocation(program, "uFrom"),
      to: gl.getUniformLocation(program, "uTo"),
      params: new Map(),
    };
  }

  private vertex(): WebGLShader | null {
    if (!this.vertexShader) {
      this.vertexShader = this.shader(this.gl.VERTEX_SHADER, VERTEX_SOURCE, "vertex");
    }
    return this.vertexShader;
  }

  private shader(type: GLenum, source: string, id: string): WebGLShader | null {
    const { gl } = this;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(`Shader „${id}“ lässt sich nicht kompilieren:`, gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
}
