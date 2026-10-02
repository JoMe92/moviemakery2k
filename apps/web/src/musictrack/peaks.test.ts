import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPeaksCache, loadPeaks, peaksForRange } from "./peaks";

describe("peaks", () => {
  beforeEach(clearPeaksCache);
  afterEach(() => vi.unstubAllGlobals());

  it("reduces the played range to the maximum per bar", () => {
    const peaks = { rate: 2, peaks: [0.1, 0.5, 0.2, 0.8, 0.3, 0.4] };
    expect(peaksForRange(peaks, 0, 3, 3)).toEqual([0.5, 0.8, 0.4]);
    // Trimmed: seconds 1 to 2 → peaks 2 and 3.
    expect(peaksForRange(peaks, 1, 2, 2)).toEqual([0.2, 0.8]);
    expect(peaksForRange(peaks, 2, 2, 4)).toEqual([]);
    expect(peaksForRange(peaks, 0, 3, 0)).toEqual([]);
  });

  it("loads once per URL and caches; failures give null and are retried", async () => {
    const ok = { rate: 50, peaks: [0.5] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValue(new Response(JSON.stringify(ok)));
    vi.stubGlobal("fetch", fetchMock);
    expect(await loadPeaks("/p")).toBeNull();
    expect(await loadPeaks("/p")).toEqual(ok);
    expect(await loadPeaks("/p")).toEqual(ok);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ rate: 0, peaks: [] }))),
    );
    expect(await loadPeaks("/bad")).toBeNull();
  });
});
