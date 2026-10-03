import { afterEach, describe, expect, it, vi } from "vitest";
import { Renderer, WebGL2UnsupportedError } from "./Renderer";

/**
 * Minimal WebGL2 stand-in: records calls and fails fragment shaders whose
 * source contains `failMarker`.
 */
function fakeGl(failMarker?: string) {
  const calls: { name: string; args: unknown[] }[] = [];
  const sources = new Map<object, string>();
  const programs = new Map<object, string[]>();
  const constants: Record<string, number> = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    MAX_TEXTURE_SIZE: 5,
    MAX_VIEWPORT_DIMS: 6,
    BLEND: 7,
    SRC_ALPHA: 8,
    ONE_MINUS_SRC_ALPHA: 9,
  };
  const impl: Record<string, (...args: unknown[]) => unknown> = {
    getParameter: (p) => (p === 5 ? 8192 : new Int32Array([8192, 8192])),
    createShader: () => ({}),
    shaderSource: (s, src) => {
      sources.set(s as object, src as string);
    },
    getShaderParameter: (s) => !(failMarker && sources.get(s as object)?.includes(failMarker)),
    getShaderInfoLog: () => "fake error",
    createProgram: () => ({}),
    attachShader: (p, s) => {
      const list = programs.get(p as object) ?? [];
      list.push(sources.get(s as object) ?? "");
      programs.set(p as object, list);
    },
    getProgramParameter: () => true,
    getUniformLocation: (_p, name) => ({ name }),
    isContextLost: () => false,
    createTexture: () => ({}),
    createVertexArray: () => ({}),
    createFramebuffer: () => ({}),
  };
  const gl = new Proxy(constants, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push({ name: prop, args });
        return impl[prop]?.(...args);
      };
    },
  });
  return { gl, calls, programs };
}

function canvasWith(gl: unknown): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.getContext = (() => gl) as HTMLCanvasElement["getContext"];
  return canvas;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Renderer", () => {
  it("reports missing WebGL2 with a dedicated error", () => {
    const canvas = document.createElement("canvas");
    expect(() => new Renderer(canvas)).toThrow(WebGL2UnsupportedError);
  });

  it("compiles each program only once (cache)", () => {
    const { gl, calls } = fakeGl();
    const r = new Renderer(canvasWith(gl));
    r.precompile(["circle", "circle", "fade"]);
    r.precompile(["circle"]);
    expect(calls.filter((c) => c.name === "linkProgram")).toHaveLength(2);
    // Vertex shader is shared: 1× vertex + 2× fragment
    expect(calls.filter((c) => c.name === "compileShader")).toHaveLength(3);
  });

  it("falls back to Fade on a compile error and logs", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { gl, calls, programs } = fakeGl("borderSoftness");
    const r = new Renderer(canvasWith(gl));
    r.precompile(["circle"]);
    expect(err).toHaveBeenCalled();
    const linked = calls.filter((c) => c.name === "linkProgram").map((c) => c.args[0] as object);
    expect(linked).toHaveLength(1);
    const fs = programs.get(linked[0] as object)?.[1] ?? "";
    expect(fs).toContain("mix(getFromColor(uv), getToColor(uv), progress)");
    // Accessing it again does not compile again.
    r.precompile(["circle", "fade"]);
    expect(calls.filter((c) => c.name === "linkProgram")).toHaveLength(1);
  });

  it("falls back to Fade for an unknown transition", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { gl, calls } = fakeGl();
    const r = new Renderer(canvasWith(gl));
    r.precompile(["gibt-es-nicht"]);
    expect(calls.filter((c) => c.name === "linkProgram")).toHaveLength(1);
  });

  it("keeps the buffer integer-valued at 4:3", () => {
    const { gl } = fakeGl();
    const canvas = canvasWith(gl);
    const r = new Renderer(canvas);
    r.resize(500, 400, 2);
    expect([canvas.width, canvas.height]).toEqual([1000, 750]);
  });

  it("caps the preview buffer at ×2 and 1920 px (add-mobile-layout D14)", () => {
    const { gl } = fakeGl();
    const canvas = canvasWith(gl);
    const r = new Renderer(canvas);
    r.resize(400, 300, 3, true);
    expect([canvas.width, canvas.height]).toEqual([800, 600]);
    r.resize(1600, 1200, 2, true);
    expect([canvas.width, canvas.height]).toEqual([1920, 1440]);
    // Without the preview flag (e.g. the debug view) the plain DPR applies.
    r.resize(400, 300, 3);
    expect([canvas.width, canvas.height]).toEqual([1200, 900]);
  });

  it("stops drawing after context loss", () => {
    const { gl, calls } = fakeGl();
    const canvas = canvasWith(gl);
    const r = new Renderer(canvas);
    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(r.isContextLost).toBe(true);
    calls.length = 0;
    r.drawEmpty();
    expect(calls.filter((c) => c.name === "clear")).toHaveLength(0);
  });

  describe("video texture (add-timeline-editing design.md D5)", () => {
    /** Stubs the 2D context the letterbox step needs (jsdom's own is stubbed to null). */
    function stub2d() {
      const drawImage = vi.fn();
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((type: string) =>
        type === "2d"
          ? { fillStyle: "", fillRect: vi.fn(), imageSmoothingEnabled: false, drawImage }
          : null) as HTMLCanvasElement["getContext"]);
      return drawImage;
    }

    it("re-letterboxes a video frame on every draw, even at an unchanged buffer size", () => {
      stub2d();
      const { gl, calls } = fakeGl();
      const r = new Renderer(canvasWith(gl));
      r.resize(640, 480, 1);
      const video = document.createElement("video");
      const frame = r.createFrame(video);

      calls.length = 0;
      r.drawStill(frame);
      // drawStill -> drawTransition(frame, frame, ...) letterboxes the same
      // video frame twice (from and to); neither is skipped by the cache.
      expect(calls.filter((c) => c.name === "texImage2D")).toHaveLength(2);

      calls.length = 0;
      r.drawStill(frame);
      expect(calls.filter((c) => c.name === "texImage2D")).toHaveLength(2);
    });

    it("still skips re-letterboxing a picture at an unchanged buffer size (the cache)", () => {
      const drawImage = stub2d();
      const { gl, calls } = fakeGl();
      const r = new Renderer(canvasWith(gl));
      r.resize(640, 480, 1);
      const image = document.createElement("canvas");
      const frame = r.createFrame(image); // first upload
      drawImage.mockClear();

      calls.length = 0;
      r.drawStill(frame);
      expect(calls.filter((c) => c.name === "texImage2D")).toHaveLength(0);
      expect(drawImage).not.toHaveBeenCalled();
    });
  });

  it("sets uniforms and parameters for a transition", () => {
    const { gl, calls } = fakeGl();
    const canvas = canvasWith(gl);
    const r = new Renderer(canvas);
    r.resize(640, 480, 1);
    // Frame textures without Canvas2D: bypass the letterbox step.
    const frame = { source: canvas, texture: {}, width: 640, height: 480, disposed: false };
    r.drawTransition(frame as never, frame as never, "checkerboard", 0.25, {
      squaresX: 12,
      squaresY: 10,
    });
    const floats = calls
      .filter((c) => c.name === "uniform1f")
      .map((c) => [(c.args[0] as { name: string }).name, c.args[1]]);
    expect(floats).toEqual([
      ["progress", 0.25],
      ["squaresX", 12],
      ["squaresY", 10],
    ]);
    const res = calls.find((c) => c.name === "uniform2f");
    expect(res?.args.slice(1)).toEqual([640, 480]);
    expect(calls.some((c) => c.name === "drawArrays" && c.args[2] === 3)).toBe(true);
  });

  describe("drawTitle", () => {
    function titleFrame() {
      return {
        source: document.createElement("canvas"),
        texture: {},
        width: 10,
        height: 10,
        disposed: false,
      };
    }

    it("draws a freestanding title opaquely, without touching blend state", () => {
      const { gl, calls } = fakeGl();
      const r = new Renderer(canvasWith(gl));
      r.resize(640, 480, 1);
      const transform = { translate: { x: 0.25, y: -0.5 }, scale: 0.3 };
      r.drawTitle(titleFrame() as never, transform, { blend: false });

      expect(calls.some((c) => c.name === "enable")).toBe(false);
      expect(calls.some((c) => c.name === "disable")).toBe(false);
      const uniforms = calls
        .filter((c) => c.name === "uniform2f")
        .map((c) => (c.args[0] as { name: string }).name);
      expect(uniforms).toContain("uTranslate");
      expect(uniforms).toContain("uScale");
      const translate = calls.find(
        (c) => c.name === "uniform2f" && (c.args[0] as { name: string }).name === "uTranslate",
      );
      expect(translate?.args.slice(1)).toEqual([0.25, -0.5]);
      const scale = calls.find(
        (c) => c.name === "uniform2f" && (c.args[0] as { name: string }).name === "uScale",
      );
      expect(scale?.args.slice(1)).toEqual([0.3, 0.3]);
      expect(calls.some((c) => c.name === "drawArrays" && c.args[2] === 3)).toBe(true);
    });

    it("blends an overlay title over the already-drawn frame, then restores state", () => {
      const { gl, calls } = fakeGl();
      const r = new Renderer(canvasWith(gl));
      r.resize(640, 480, 1);
      r.drawTitle(titleFrame() as never, { translate: { x: 0, y: 0 }, scale: 1 }, { blend: true });

      const enableIndex = calls.findIndex((c) => c.name === "enable");
      const blendFuncIndex = calls.findIndex((c) => c.name === "blendFunc");
      const drawIndex = calls.findIndex((c) => c.name === "drawArrays");
      const disableIndex = calls.findIndex((c) => c.name === "disable");
      expect(enableIndex).toBeGreaterThanOrEqual(0);
      expect(calls[enableIndex]?.args).toEqual([gl.BLEND]);
      expect(calls[blendFuncIndex]?.args).toEqual([gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA]);
      expect(enableIndex).toBeLessThan(drawIndex);
      expect(drawIndex).toBeLessThan(disableIndex);
      expect(calls[disableIndex]?.args).toEqual([gl.BLEND]);
    });

    it("falls back to doing nothing when the title shader fails to compile", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { gl, calls } = fakeGl("uTranslate");
      const r = new Renderer(canvasWith(gl));
      r.resize(640, 480, 1);
      r.drawTitle(titleFrame() as never, { translate: { x: 0, y: 0 }, scale: 1 }, { blend: false });
      expect(calls.some((c) => c.name === "drawArrays")).toBe(false);
    });
  });

  it("skips the effect pass entirely without an effectId (no copy)", () => {
    const { gl, calls } = fakeGl();
    const r = new Renderer(canvasWith(gl));
    r.resize(640, 480, 1);
    const frame = { source: canvasWith(gl), texture: {}, width: 640, height: 480, disposed: false };
    r.drawStill(frame as never);
    expect(calls.some((c) => c.name === "createFramebuffer")).toBe(false);
    const bound = calls.filter((c) => c.name === "bindTexture").map((c) => c.args[1]);
    // Both texture units of the fade-at-0 still draw read the frame's own texture.
    expect(bound.every((t) => t === frame.texture)).toBe(true);
  });

  it("runs the effect pass into an intermediate texture and feeds that to the main draw", () => {
    const { gl, calls } = fakeGl();
    const r = new Renderer(canvasWith(gl));
    r.resize(640, 480, 1);
    const frame = { source: canvasWith(gl), texture: {}, width: 640, height: 480, disposed: false };
    r.drawStill(frame as never, { id: "negative", params: {} });

    expect(calls.filter((c) => c.name === "createFramebuffer")).toHaveLength(1);
    // drawStill resolves the effect once per slot (from/to), each into its own
    // intermediate texture (one shared FBO, rebound).
    const attachedTargets = calls
      .filter((c) => c.name === "framebufferTexture2D")
      .map((c) => c.args[3]);
    expect(attachedTargets).toHaveLength(2);
    expect(attachedTargets[0]).not.toBe(attachedTargets[1]);
    // One extra program (the effect) on top of the fade program.
    expect(calls.filter((c) => c.name === "linkProgram")).toHaveLength(2);
    const bound = calls.filter((c) => c.name === "bindTexture").map((c) => c.args[1]);
    // The effect pass itself reads the original frame texture…
    expect(bound).toContain(frame.texture);
    // …but the main pass (from, then to) reads the effect's intermediate textures.
    expect(bound.at(-2)).toBe(attachedTargets[0]);
    expect(bound.at(-1)).toBe(attachedTargets[1]);
  });

  it("falls back to the original texture and logs on an unknown effect", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { gl, calls } = fakeGl();
    const r = new Renderer(canvasWith(gl));
    r.resize(640, 480, 1);
    const frame = { source: canvasWith(gl), texture: {}, width: 640, height: 480, disposed: false };
    r.drawStill(frame as never, { id: "gibt-es-nicht", params: {} });
    expect(err).toHaveBeenCalled();
    expect(calls.some((c) => c.name === "createFramebuffer")).toBe(false);
    const bound = calls.filter((c) => c.name === "bindTexture").map((c) => c.args[1]);
    expect(bound.every((t) => t === frame.texture)).toBe(true);
  });
});
