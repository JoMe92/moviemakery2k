import { describe, expect, it } from "vitest";
import catalog from "../../../../packages/catalog/transitions.json";
import {
  buildFragmentSource,
  declaredParams,
  EPILOGUE_SOURCE,
  FALLBACK_TRANSITION_ID,
  fragmentSourceFor,
  PRELUDE_SOURCE,
  transitionSources,
  VERTEX_SOURCE,
} from "./shaderSource";

describe("buildFragmentSource", () => {
  it("setzt Prelude, Übergang und Epilog in dieser Reihenfolge zusammen", () => {
    const src = buildFragmentSource(
      "#version 300 es\nprecision highp float;\n",
      "\n\nvec4 transition(vec2 uv) { return vec4(1.0); }\n",
      "void main() { fragColor = transition(vUv); }\n",
    );
    const lines = src.split("\n");
    expect(lines[0]).toBe("#version 300 es");
    const iPrecision = src.indexOf("precision highp float;");
    const iBody = src.indexOf("vec4 transition(");
    const iMain = src.indexOf("void main()");
    expect(iPrecision).toBeGreaterThan(0);
    expect(iBody).toBeGreaterThan(iPrecision);
    expect(iMain).toBeGreaterThan(iBody);
    expect(src.endsWith("\n")).toBe(true);
  });

  it("entfernt Leerraum vor #version, damit die Direktive erste Zeile bleibt", () => {
    const src = buildFragmentSource("\n  #version 300 es\n", "x", "y");
    expect(src.startsWith("#version 300 es\n")).toBe(true);
  });

  it("baut aus den echten Dateien ein vollständiges Programm", () => {
    const src = fragmentSourceFor("circle") as string;
    expect(src.split("\n")[0]).toBe("#version 300 es");
    expect(src).toContain("uniform sampler2D uFrom;");
    expect(src).toContain("uniform sampler2D uTo;");
    expect(src).toContain("uniform float progress;");
    expect(src).toContain("uniform vec2 resolution;");
    expect(src.indexOf("vec4 getToColor")).toBeLessThan(src.indexOf("vec4 transition("));
    expect(src.indexOf("vec4 transition(")).toBeLessThan(src.indexOf("void main()"));
    expect(src).toContain(PRELUDE_SOURCE.trim());
    expect(src).toContain(EPILOGUE_SOURCE.trim());
  });

  it("liefert für unbekannte Übergänge nichts", () => {
    expect(fragmentSourceFor("gibt-es-nicht")).toBeUndefined();
  });

  it("lädt den Vertex-Shader (Fullscreen-Dreieck)", () => {
    expect(VERTEX_SOURCE.trim().split("\n")[0]).toBe("#version 300 es");
    expect(VERTEX_SOURCE).toContain("gl_VertexID");
  });
});

describe("transitionSources", () => {
  const sources = transitionSources();
  const ids = catalog.transitions.map((t) => t.id);

  it("enthält genau die sechs Katalog-Übergänge, inklusive Rückfall Fade", () => {
    expect(Object.keys(sources).sort()).toEqual([...ids].sort());
    expect(ids).toHaveLength(6);
    expect(sources[FALLBACK_TRANSITION_ID]).toBeDefined();
  });

  it.each(catalog.transitions.map((t) => [t.id, t] as const))(
    "%s: Shader-Uniforms entsprechen den Katalog-Parametern",
    (id, entry) => {
      const body = sources[id] as string;
      expect(entry.shader).toBe(`${id}.glsl`);
      expect(declaredParams(body).sort()).toEqual(Object.keys(entry.params).sort());
      expect(body).toMatch(/vec4\s+transition\s*\(\s*vec2\s+uv\s*\)/);
      expect(body).not.toContain("#version");
      expect(body).not.toMatch(/void\s+main\s*\(/);
    },
  );
});

describe("declaredParams", () => {
  it("liest nur float-Uniforms am Zeilenanfang", () => {
    const body = "uniform float a;\n  uniform float b_2 ;\nuniform vec2 c;\n// uniform float d;\n";
    expect(declaredParams(body)).toEqual(["a", "b_2"]);
  });
});
