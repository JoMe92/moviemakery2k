import { describe, expect, it } from "vitest";
import { startClock } from "./clock";

function fakeRaf() {
  const queue = new Map<number, (ts: number) => void>();
  let next = 1;
  return {
    raf: (cb: (ts: number) => void) => {
      queue.set(next, cb);
      return next++;
    },
    caf: (id: number) => {
      queue.delete(id);
    },
    frame(ts: number) {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const cb of callbacks) cb(ts);
    },
    get pending() {
      return queue.size;
    },
  };
}

describe("rAF clock", () => {
  it("delivers dt in seconds from the second frame and stops after stopping", () => {
    const f = fakeRaf();
    const ticks: number[] = [];
    const stop = startClock((dt) => ticks.push(dt), f.raf, f.caf);
    f.frame(1000);
    f.frame(1016);
    f.frame(1050);
    expect(ticks.map((t) => Math.round(t * 1000))).toEqual([16, 34]);
    stop();
    expect(f.pending).toBe(0);
    f.frame(1100);
    expect(ticks).toHaveLength(2);
  });
});
