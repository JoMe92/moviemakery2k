/**
 * Effect shader sources from `packages/shaders` (contract:
 * packages/shaders/README.md "Effect shader contract", design.md D1/D2).
 * One texture, no `progress` — the renderer assembles
 * effect-prelude + effects/<id>.glsl + effect-epilogue.
 */
import effectEpilogue from "../../../../packages/shaders/effect-epilogue.glsl?raw";
import effectPrelude from "../../../../packages/shaders/effect-prelude.glsl?raw";
import { buildFragmentSource, declaredParams } from "./shaderSource";

export const EFFECT_PRELUDE_SOURCE: string = effectPrelude;
export const EFFECT_EPILOGUE_SOURCE: string = effectEpilogue;
export { declaredParams as declaredEffectParams };

const bodies = import.meta.glob<string>("../../../../packages/shaders/effects/*.glsl", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** `effects/sepia.glsl` → `sepia` */
function basename(path: string): string {
  const file = path.slice(path.lastIndexOf("/") + 1);
  return file.replace(/\.glsl$/, "");
}

const sources: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(bodies).map(([path, body]) => [basename(path), body])),
);

/** Raw effect shaders (only `uniform`s + `effect()`), by catalog ID. */
export function effectSources(): Readonly<Record<string, string>> {
  return sources;
}

/** Fragment program for a catalog effect; `undefined` if there is no shader. */
export function effectFragmentSourceFor(effectId: string): string | undefined {
  const body = sources[effectId];
  return body === undefined
    ? undefined
    : buildFragmentSource(EFFECT_PRELUDE_SOURCE, body, EFFECT_EPILOGUE_SOURCE);
}
