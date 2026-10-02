/**
 * Testhook `?debug-progress=<transitionId>:<p>` (design.md D8): Statt der App
 * wird nur ein 640×480-Canvas gezeigt, das den Übergang zwischen zwei
 * einfarbigen Frames bei Fortschritt p zeichnet. Für E2E-Randwert- und
 * Determinismus-Prüfungen. Optional: `&from=<CSS-Farbe>&to=<CSS-Farbe>`,
 * `&fromPortrait=1` (Hochkant-Testbild als Ausgangsframe).
 */
export interface DebugProgress {
  transitionId: string;
  progress: number;
  from: string;
  to: string;
  fromPortrait: boolean;
}

export function parseDebugProgress(search: string): DebugProgress | null {
  const query = new URLSearchParams(search);
  const raw = query.get("debug-progress");
  if (raw === null) return null;
  const sep = raw.lastIndexOf(":");
  const transitionId = (sep >= 0 ? raw.slice(0, sep) : raw).trim();
  const p = sep >= 0 ? Number(raw.slice(sep + 1)) : 0;
  return {
    transitionId: transitionId || "fade",
    progress: Number.isFinite(p) ? Math.min(Math.max(p, 0), 1) : 0,
    from: query.get("from") || "#ff0000",
    to: query.get("to") || "#0000ff",
    fromPortrait: query.get("fromPortrait") === "1",
  };
}
