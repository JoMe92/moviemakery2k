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
});
