/**
 * Test hook `?debug-progress=<transitionId>:<p>` (design.md D8): instead of the
 * app, only a 640×480 canvas is shown that draws the transition between two
 * solid-colour frames at progress p. For E2E boundary-value and determinism
 * checks. Optional: `&from=<CSS colour>&to=<CSS colour>`,
 * `&fromPortrait=1` (portrait test image as the source frame).
 * `?debug-progress=<transitionId>:<p>:pattern` (design.md D10) uses the built-in
 * 640×480 test pattern (`testPattern.ts`) for both frames instead of solid colours.
 */
export interface DebugProgress {
  transitionId: string;
  progress: number;
  from: string;
  to: string;
  fromPortrait: boolean;
  pattern: boolean;
}

export function parseDebugProgress(search: string): DebugProgress | null {
  const query = new URLSearchParams(search);
  let raw = query.get("debug-progress");
  if (raw === null) return null;
  const pattern = raw.endsWith(":pattern");
  if (pattern) raw = raw.slice(0, -":pattern".length);
  const sep = raw.lastIndexOf(":");
  const transitionId = (sep >= 0 ? raw.slice(0, sep) : raw).trim();
  const p = sep >= 0 ? Number(raw.slice(sep + 1)) : 0;
  return {
    transitionId: transitionId || "fade",
    progress: Number.isFinite(p) ? Math.min(Math.max(p, 0), 1) : 0,
    from: query.get("from") || "#ff0000",
    to: query.get("to") || "#0000ff",
    fromPortrait: query.get("fromPortrait") === "1",
    pattern,
  };
}
