/**
 * Waveform data of an audio medium (`AudioItem.peaksUrl`, design.md D7):
 * `{ rate, peaks }` with `rate` peaks per second, each peak in 0…1.
 * Loaded once per URL and cached for the session.
 */
export interface Peaks {
  rate: number;
  peaks: number[];
}

const cache = new Map<string, Promise<Peaks | null>>();

function isPeaks(value: unknown): value is Peaks {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { rate?: unknown; peaks?: unknown };
  return (
    typeof v.rate === "number" &&
    v.rate > 0 &&
    Array.isArray(v.peaks) &&
    v.peaks.every((p) => typeof p === "number")
  );
}

/** Peaks for `url`; `null` if they cannot be loaded (the waveform then stays flat). */
export function loadPeaks(url: string): Promise<Peaks | null> {
  let entry = cache.get(url);
  if (!entry) {
    entry = fetch(url)
      .then(async (response) => {
        if (!response.ok) return null;
        const data: unknown = await response.json();
        return isPeaks(data) ? data : null;
      })
      .catch(() => null)
      .then((peaks) => {
        // A failed load may be retried later (e.g. backend was briefly offline).
        if (peaks === null) cache.delete(url);
        return peaks;
      });
    cache.set(url, entry);
  }
  return entry;
}

/** Forget all cached peaks (tests). */
export function clearPeaksCache(): void {
  cache.clear();
}

/**
 * The peaks of the source range `[start, end)` reduced to `bars` values
 * (maximum per bucket), each in 0…1.
 */
export function peaksForRange(peaks: Peaks, start: number, end: number, bars: number): number[] {
  const from = Math.max(0, Math.floor(start * peaks.rate));
  const to = Math.min(peaks.peaks.length, Math.ceil(end * peaks.rate));
  const count = Math.max(0, Math.floor(bars));
  if (to <= from || count === 0) return [];
  const result: number[] = [];
  const step = (to - from) / count;
  for (let i = 0; i < count; i += 1) {
    const a = from + Math.floor(i * step);
    const b = Math.max(a + 1, from + Math.floor((i + 1) * step));
    let max = 0;
    for (let j = a; j < b && j < to; j += 1) max = Math.max(max, peaks.peaks[j] ?? 0);
    result.push(Math.min(1, Math.max(0, max)));
  }
  return result;
}
