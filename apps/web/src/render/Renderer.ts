/**
 * WebGL2 renderer of the preview monitor (design.md D4). No React: the
 * `PreviewCanvas` component owns an instance and only calls `resize` and
 * `draw*`.
 *
 * - Each image is fitted onto a black 4:3 background via Canvas2D and uploaded
 *   as a frame texture at buffer size; the shaders work in frame space.
 * - One program per transition (prelude + shader + epilogue), lazily compiled
 *   and cached. A compile/link error is logged and falls back to Fade.
 * - A lost context silently stops drawing.
 */
import { effectFragmentSourceFor } from "./effectSource";
import { bufferSize, containRect, previewBufferSize } from "./geometry";
import { FALLBACK_TRANSITION_ID, fragmentSourceFor, VERTEX_SOURCE } from "./shaderSource";
import type { Transform as TitleTransform } from "./titlePhase";
import { TITLE_FRAGMENT_SOURCE, TITLE_VERTEX_SOURCE } from "./titleShaderSource";

/** An effect (design.md D1–D3): catalog ID plus its fixed parameters. */
export interface EffectSpec {
  id: string;
  params: Readonly<Record<string, number>>;
}

export type ImageSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;
export type { TitleTransform };

function isVideoSource(source: ImageSource): source is HTMLVideoElement {
  return typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement;
}

export class WebGL2UnsupportedError extends Error {
  constructor() {
    super("WebGL2 wird von diesem Browser nicht unterstützt.");
    this.name = "WebGL2UnsupportedError";
  }
}

export interface RendererOptions {
  /** For test hooks/screenshots: keep the buffer after compositing. */
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

interface TitleProgramInfo {
  program: WebGLProgram;
  translate: WebGLUniformLocation | null;
  scale: WebGLUniformLocation | null;
  title: WebGLUniformLocation | null;
}

interface EffectProgramInfo {
  program: WebGLProgram;
  resolution: WebGLUniformLocation | null;
  image: WebGLUniformLocation | null;
  params: Map<string, WebGLUniformLocation | null>;
}

/** How a title texture is drawn: see `Renderer.drawTitle`. */
export interface DrawTitleOptions {
  /**
   * `false` for a freestanding title element (already a fully opaque
   * image, design.md D1) — no blending. `true` for an overlay title: alpha
   * blends over the already-drawn frame (design.md D2).
   */
  blend: boolean;
}

/** Natural pixel size of an image source. */
export function sourceSize(source: ImageSource): { width: number; height: number } {
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  if (isVideoSource(source)) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  return { width: source.width, height: source.height };
}

/** A fitted image source as a texture. Re-fitted when the buffer size changes. */
export class FrameTexture {
  /** Buffer size the texture was last fitted for (0 = never). */
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
  /** Result per transition ID; a broken shader points to the Fade program. */
  private readonly programs = new Map<string, ProgramInfo | null>();
  /** Lazily compiled; `undefined` = not yet attempted, `null` = compile/link failed. */
  private titleProgram: TitleProgramInfo | null | undefined;
  /** Result per effect ID; `null` on a missing/broken shader (effect skipped). */
  private readonly effectPrograms = new Map<string, EffectProgramInfo | null>();
  private readonly frames = new Set<FrameTexture>();
  private letterboxCanvas: Canvas2D | null = null;
  /**
   * One extra FBO for the effect pass (design.md D2), rebound to one of two
   * intermediate textures: a transition may need an effect on `from` and `to`
   * at once, so one texture alone would let the second pass overwrite the
   * first result.
   */
  private effectFbo: WebGLFramebuffer | null = null;
  private effectTextures: [WebGLTexture, WebGLTexture] | null = null;
  private effectWidth = 0;
  private effectHeight = 0;
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

  /** Set the buffer to the largest integer 4:3 area of the CSS box (times DPR). */
  resize(cssWidth: number, cssHeight: number, dpr: number, preview = false): void {
    const size = preview ? previewBufferSize : bufferSize;
    const { width, height } = size(cssWidth, cssHeight, dpr, this.maxSize);
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  /** Precompiles all known transitions (otherwise this happens on the first draw). */
  precompile(ids: Iterable<string>): void {
    for (const id of ids) this.programFor(id);
  }

  /** Precompiles all known effects (otherwise this happens on the first draw). */
  precompileEffects(ids: Iterable<string>): void {
    for (const id of ids) this.effectProgramFor(id);
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

  /**
   * A title/credits texture (Canvas2D-rasterised, design.md D1): uploaded at
   * its own natural size, never letterboxed/fitted — `drawTitle`'s vertex
   * transform positions and scales it instead.
   */
  createTitleFrame(source: ImageSource): FrameTexture {
    const { gl } = this;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Textur konnte nicht angelegt werden.");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const frame = new FrameTexture(source, texture);
    const { width, height } = sourceSize(source);
    frame.width = width;
    frame.height = height;
    this.frames.add(frame);
    return frame;
  }

  drawEmpty(): void {
    if (!this.canDraw()) return;
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** A single image: Fade program with from = to, progress 0. */
  drawStill(frame: FrameTexture, effect?: EffectSpec | null): void {
    this.drawTransition(frame, frame, FALLBACK_TRANSITION_ID, 0, {}, effect, effect);
  }

  drawTransition(
    from: FrameTexture,
    to: FrameTexture,
    transitionId: string,
    progress: number,
    params: Readonly<Record<string, number>>,
    fromEffect?: EffectSpec | null,
    toEffect?: EffectSpec | null,
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
    // Effect pass (design.md D2): runs before the still/transition pass below,
    // into an intermediate texture; without an effect this is a no-op (no copy).
    const fromTexture = this.resolveEffect(from, fromEffect, 0);
    const toTexture = this.resolveEffect(to, toEffect, 1);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL call, not a React hook.
    gl.useProgram(info.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fromTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, toTexture);
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

  /**
   * Draws a title/credits texture at `transform` (design.md D3), either
   * opaque — a freestanding title element, already fully covering the
   * black background it was rasterised onto (design.md D1) — or alpha-
   * blended over whatever was drawn before it, for an overlay title
   * (design.md D2). `gl.BLEND` is always left disabled afterwards.
   */
  drawTitle(frame: FrameTexture, transform: TitleTransform, options: DrawTitleOptions): void {
    if (!this.canDraw()) return;
    const info = this.titleProgramInfo();
    if (!info) return;
    const { gl } = this;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL call, not a React hook.
    gl.useProgram(info.program);
    gl.bindVertexArray(this.vao);

    if (options.blend) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, frame.texture);
    gl.uniform1i(info.title, 0);
    gl.uniform2f(info.translate, transform.translate.x, transform.translate.y);
    gl.uniform2f(info.scale, transform.scale, transform.scale);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    if (options.blend) gl.disable(gl.BLEND);
  }

  /**
   * Runs the effect pass for one frame (design.md D2): without an effect (or
   * on a missing/broken shader), returns `frame.texture` unchanged — no copy.
   * Otherwise renders into intermediate texture `slot` (0 = from, 1 = to) and
   * returns that.
   */
  private resolveEffect(
    frame: FrameTexture,
    effect: EffectSpec | null | undefined,
    slot: 0 | 1,
  ): WebGLTexture {
    if (!effect) return frame.texture;
    const info = this.effectProgramFor(effect.id);
    if (!info) return frame.texture;
    const { gl } = this;
    const target = this.ensureEffectTargets()[slot];

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.effectFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL call, not a React hook.
    gl.useProgram(info.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, frame.texture);
    gl.uniform1i(info.image, 0);
    gl.uniform2f(info.resolution, this.canvas.width, this.canvas.height);
    for (const [name, value] of Object.entries(effect.params)) {
      let loc = info.params.get(name);
      if (loc === undefined) {
        loc = gl.getUniformLocation(info.program, name);
        info.params.set(name, loc);
      }
      if (loc !== null) gl.uniform1f(loc, value);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    return target;
  }

  private ensureEffectTargets(): [WebGLTexture, WebGLTexture] {
    const { gl } = this;
    if (!this.effectFbo) this.effectFbo = gl.createFramebuffer();
    if (!this.effectTextures) {
      this.effectTextures = [this.createEffectTexture(), this.createEffectTexture()];
    }
    if (this.effectWidth !== this.canvas.width || this.effectHeight !== this.canvas.height) {
      for (const texture of this.effectTextures) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA8,
          this.canvas.width,
          this.canvas.height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        );
      }
      this.effectWidth = this.canvas.width;
      this.effectHeight = this.canvas.height;
    }
    return this.effectTextures;
  }

  private createEffectTexture(): WebGLTexture {
    const { gl } = this;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Textur konnte nicht angelegt werden.");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  private effectProgramFor(effectId: string): EffectProgramInfo | null {
    const cached = this.effectPrograms.get(effectId);
    if (cached !== undefined) return cached;

    let info: EffectProgramInfo | null = null;
    const source = effectFragmentSourceFor(effectId);
    if (source === undefined) {
      console.error(`Kein Shader für Effekt „${effectId}“; Effekt wird übersprungen.`);
    } else {
      info = this.compileEffect(effectId, source);
    }
    this.effectPrograms.set(effectId, info);
    return info;
  }

  private compileEffect(id: string, fragmentSource: string): EffectProgramInfo | null {
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
      console.error(`Effekt „${id}“ lässt sich nicht linken:`, gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return {
      program,
      resolution: gl.getUniformLocation(program, "resolution"),
      image: gl.getUniformLocation(program, "uImage"),
      params: new Map(),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    if (this.isContextLost) return;
    const { gl } = this;
    for (const frame of [...this.frames]) this.deleteFrame(frame);
    if (this.effectTextures) {
      for (const texture of this.effectTextures) gl.deleteTexture(texture);
      this.effectTextures = null;
    }
    if (this.effectFbo) {
      gl.deleteFramebuffer(this.effectFbo);
      this.effectFbo = null;
    }
    const deletedEffects = new Set<WebGLProgram>();
    for (const info of this.effectPrograms.values()) {
      if (info && !deletedEffects.has(info.program)) {
        gl.deleteProgram(info.program);
        deletedEffects.add(info.program);
      }
    }
    this.effectPrograms.clear();
    const deleted = new Set<WebGLProgram>();
    for (const info of this.programs.values()) {
      if (info && !deleted.has(info.program)) {
        gl.deleteProgram(info.program);
        deleted.add(info.program);
      }
    }
    this.programs.clear();
    if (this.titleProgram) gl.deleteProgram(this.titleProgram.program);
    this.titleProgram = undefined;
    if (this.vertexShader) gl.deleteShader(this.vertexShader);
    if (this.vao) gl.deleteVertexArray(this.vao);
    // Deliberately do not release the context via WEBGL_lose_context: under React
    // StrictMode the same canvas is reused immediately.
  }

  private readonly onContextLost = (event: Event): void => {
    // Without preventDefault the browser would never offer a restore; we
    // simply stop drawing from here on.
    event.preventDefault();
    this.lost = true;
  };

  private canDraw(): boolean {
    return !this.disposed && !this.isContextLost;
  }

  /**
   * Fit an image into a black 4:3 area at buffer size and upload it. A video
   * frame is always re-fitted: its pixel content changes every draw even at
   * the same buffer size, so the "already fitted at this size" cache that
   * skips still images does not apply to it (add-timeline-editing design.md D5).
   */
  private ensureLetterboxed(frame: FrameTexture): void {
    const { width, height } = this.canvas;
    const alreadyFitted = frame.width === width && frame.height === height;
    if (frame.disposed || (alreadyFitted && !isVideoSource(frame.source))) return;
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

  /** Compiles and links the title program once (own vertex shader, not `vertex()`'s). */
  private titleProgramInfo(): TitleProgramInfo | null {
    if (this.titleProgram !== undefined) return this.titleProgram;
    const { gl } = this;
    const vs = this.shader(gl.VERTEX_SHADER, TITLE_VERTEX_SOURCE, "title-vertex");
    const fs = vs ? this.shader(gl.FRAGMENT_SHADER, TITLE_FRAGMENT_SOURCE, "title-fragment") : null;
    let info: TitleProgramInfo | null = null;
    if (vs && fs) {
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
        info = {
          program,
          translate: gl.getUniformLocation(program, "uTranslate"),
          scale: gl.getUniformLocation(program, "uScale"),
          title: gl.getUniformLocation(program, "uTitle"),
        };
      } else {
        console.error("Titel-Shader lässt sich nicht linken:", gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
      }
    }
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    this.titleProgram = info;
    return info;
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
