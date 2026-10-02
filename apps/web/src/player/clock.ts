/**
 * requestAnimationFrame clock: calls `onTick(dt)` each frame with the time since
 * the previous frame in seconds. rAF is injectable (tests).
 */
export type Raf = (cb: (ts: number) => void) => number;
export type Caf = (id: number) => void;

export function startClock(
  onTick: (dt: number) => void,
  raf: Raf = (cb) => requestAnimationFrame(cb),
  caf: Caf = (id) => cancelAnimationFrame(id),
): () => void {
  let last: number | null = null;
  let stopped = false;
  const step = (ts: number) => {
    if (stopped) return;
    if (last !== null) onTick((ts - last) / 1000);
    last = ts;
    if (!stopped) id = raf(step);
  };
  let id = raf(step);
  return () => {
    stopped = true;
    caf(id);
  };
}
