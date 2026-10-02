/**
 * Shader-Quelltexte aus `packages/shaders` (Vertrag: packages/shaders/README.md,
 * design.md D4). Vite importiert die Dateien zur Build-Zeit als Text (`?raw`);
 * der Renderer setzt daraus pro Übergang ein Fragmentprogramm zusammen:
 * prelude + transitions/<id>.glsl + epilogue.
 */
import epilogue from "../../../../packages/shaders/epilogue.glsl?raw";
import prelude from "../../../../packages/shaders/prelude.glsl?raw";
import vertex from "../../../../packages/shaders/vertex.glsl?raw";

export const PRELUDE_SOURCE: string = prelude;
export const EPILOGUE_SOURCE: string = epilogue;
export const VERTEX_SOURCE: string = vertex;

/** Übergang, auf den der Renderer bei fehlendem oder fehlerhaftem Shader zurückfällt. */
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

/** Rohe Übergangs-Shader (nur `uniform`s + `transition()`), nach Katalog-ID. */
export function transitionSources(): Readonly<Record<string, string>> {
  return sources;
}

/**
 * Baut das vollständige Fragmentprogramm. `#version` muss die erste Zeile
 * bleiben, deshalb steht das Prelude vorn und wird nicht eingerückt oder
 * mit Kommentaren versehen.
 */
export function buildFragmentSource(
  preludeSource: string,
  body: string,
  epilogueSource: string,
): string {
  return `${preludeSource.trim()}\n\n${body.trim()}\n\n${epilogueSource.trim()}\n`;
}

/** Fragmentprogramm für einen Übergang aus dem Katalog; `undefined`, wenn es keinen Shader gibt. */
export function fragmentSourceFor(transitionId: string): string | undefined {
  const body = sources[transitionId];
  return body === undefined
    ? undefined
    : buildFragmentSource(PRELUDE_SOURCE, body, EPILOGUE_SOURCE);
}

/** Namen der `uniform float <name>;`-Parameter, die ein Übergangs-Shader deklariert. */
export function declaredParams(body: string): string[] {
  const names: string[] = [];
  for (const m of body.matchAll(/^\s*uniform\s+float\s+([A-Za-z_]\w*)\s*;/gm)) {
    names.push(m[1] as string);
  }
  return names;
}
