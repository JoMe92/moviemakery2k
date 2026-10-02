/**
 * Shader sources from `packages/shaders` (contract: packages/shaders/README.md,
 * design.md D4). Vite imports the files as text at build time (`?raw`);
 * from them the renderer assembles one fragment program per transition:
 * prelude + transitions/<id>.glsl + epilogue.
 */
import epilogue from "../../../../packages/shaders/epilogue.glsl?raw";
import prelude from "../../../../packages/shaders/prelude.glsl?raw";
import vertex from "../../../../packages/shaders/vertex.glsl?raw";

export const PRELUDE_SOURCE: string = prelude;
export const EPILOGUE_SOURCE: string = epilogue;
export const VERTEX_SOURCE: string = vertex;

/** Transition the renderer falls back to when a shader is missing or broken. */
export const FALLBACK_TRANSITION_ID = "fade";

const bodies = import.meta.glob<string>("../../../../packages/shaders/transitions/*.glsl", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** `transitions/circle.glsl` → `circle` */
function basename(path: string): string {
  const file = path.slice(path.lastIndexOf("/") + 1);
  return file.replace(/\.glsl$/, "");
}

const sources: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(bodies).map(([path, body]) => [basename(path), body])),
);

/** Raw transition shaders (only `uniform`s + `transition()`), by catalog ID. */
export function transitionSources(): Readonly<Record<string, string>> {
  return sources;
}

/**
 * Builds the complete fragment program. `#version` must stay the first line,
 * so the prelude comes first and is neither indented nor prefixed with
 * comments.
 */
export function buildFragmentSource(
  preludeSource: string,
  body: string,
  epilogueSource: string,
): string {
  return `${preludeSource.trim()}\n\n${body.trim()}\n\n${epilogueSource.trim()}\n`;
}

/** Fragment program for a catalog transition; `undefined` if there is no shader. */
export function fragmentSourceFor(transitionId: string): string | undefined {
  const body = sources[transitionId];
  return body === undefined
    ? undefined
    : buildFragmentSource(PRELUDE_SOURCE, body, EPILOGUE_SOURCE);
}

/** Names of the `uniform float <name>;` parameters a transition shader declares. */
export function declaredParams(body: string): string[] {
  const names: string[] = [];
  for (const m of body.matchAll(/^\s*uniform\s+float\s+([A-Za-z_]\w*)\s*;/gm)) {
    names.push(m[1] as string);
  }
  return names;
}
