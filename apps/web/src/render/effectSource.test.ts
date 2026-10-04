import { describe, expect, it } from "vitest";
import catalog from "../../../../packages/catalog/effects.json";
import {
  declaredEffectParams,
  EFFECT_EPILOGUE_SOURCE,
  EFFECT_PRELUDE_SOURCE,
  effectFragmentSourceFor,
  effectSources,
} from "./effectSource";

describe("effectFragmentSourceFor", () => {
  it("builds a complete program from the real files", () => {
    const src = effectFragmentSourceFor("negative") as string;
    expect(src.split("\n")[0]).toBe("#version 300 es");
    expect(src).toContain("uniform sampler2D uImage;");
    expect(src).toContain("uniform vec2 resolution;");
    expect(src).not.toContain("uniform float progress;");
    expect(src.indexOf("vec4 getColor")).toBeLessThan(src.indexOf("vec4 effect("));
    expect(src.indexOf("vec4 effect(")).toBeLessThan(src.indexOf("void main()"));
    expect(src).toContain(EFFECT_PRELUDE_SOURCE.trim());
    expect(src).toContain(EFFECT_EPILOGUE_SOURCE.trim());
  });

  it("returns nothing for unknown effects", () => {
    expect(effectFragmentSourceFor("gibt-es-nicht")).toBeUndefined();
  });
});

describe("effectSources", () => {
  const sources = effectSources();
  const ids = catalog.effects.map((e) => e.id);

  it("contains exactly the catalog's effects", () => {
    expect(Object.keys(sources).sort()).toEqual([...ids].sort());
    expect(ids).toHaveLength(21);
  });

  it.each(catalog.effects.map((e) => [e.id, e] as const))(
    "%s: shader uniforms match the catalog parameters",
    (id, entry) => {
      const body = sources[id] as string;
      expect(entry.shader).toBe(`${id}.glsl`);
      expect(declaredEffectParams(body).sort()).toEqual(Object.keys(entry.params).sort());
      expect(body).toMatch(/vec4\s+effect\s*\(\s*vec2\s+uv\s*\)/);
      expect(body).not.toContain("#version");
      expect(body).not.toMatch(/void\s+main\s*\(/);
    },
  );
});
