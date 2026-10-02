import { afterEach, describe, expect, it, vi } from "vitest";
import { Renderer, WebGL2UnsupportedError } from "./Renderer";

/**
 * Minimaler WebGL2-Ersatz: zeichnet Aufrufe auf und lässt Fragment-Shader
 * scheitern, deren Quelltext `failMarker` enthält.
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
  it("meldet fehlendes WebGL2 mit eigenem Fehler", () => {
    const canvas = document.createElement("canvas");
    expect(() => new Renderer(canvas)).toThrow(WebGL2UnsupportedError);
  });

  it("kompiliert jedes Programm nur einmal (Cache)", () => {
    const { gl, calls } = fakeGl();
    const r = new Renderer(canvasWith(gl));
    r.precompile(["circle", "circle", "fade"]);
    r.precompile(["circle"]);
    expect(calls.filter((c) => c.name === "linkProgram")).toHaveLength(2);
    // Vertex-Shader wird geteilt: 1× Vertex + 2× Fragment
    expect(calls.filter((c) => c.name === "compileShader")).toHaveLength(3);
  });

  it("fällt bei Kompilierfehler auf Überblenden zurück und loggt", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { gl, calls, programs } = fakeGl("borderSoftness");
    const r = new Renderer(canvasWith(gl));
    r.precompile(["circle"]);
    expect(err).toHaveBeenCalled();
    const linked = calls.filter((c) => c.name === "linkProgram").map((c) => c.args[0] as object);
    expect(linked).toHaveLength(1);
    const fs = programs.get(linked[0] as object)?.[1] ?? "";
    expect(fs).toContain("mix(getFromColor(uv), getToColor(uv), progress)");
    // Erneuter Zugriff kompiliert nicht noch einmal.
    r.precompile(["circle", "fade"]);
    expect(calls.filter((c) => c.name === "linkProgram")).toHaveLength(1);
  });

  it("fällt bei unbekanntem Übergang auf Überblenden zurück", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { gl, calls } = fakeGl();
    const r = new Renderer(canvasWith(gl));
    r.precompile(["gibt-es-nicht"]);
    expect(calls.filter((c) => c.name === "linkProgram")).toHaveLength(1);
  });

  it("hält den Puffer ganzzahlig in 4:3", () => {
    const { gl } = fakeGl();
    const canvas = canvasWith(gl);
    const r = new Renderer(canvas);
    r.resize(500, 400, 2);
    expect([canvas.width, canvas.height]).toEqual([1000, 750]);
  });

  it("zeichnet nach Kontextverlust nicht mehr", () => {
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

  it("setzt Uniforms und Parameter für einen Übergang", () => {
    const { gl, calls } = fakeGl();
    const canvas = canvasWith(gl);
    const r = new Renderer(canvas);
    r.resize(640, 480, 1);
    // Frame-Texturen ohne Canvas2D: letterbox-Schritt umgehen.
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
