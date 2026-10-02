import { useEffect, useMemo, useState } from "react";
import styles from "./MusicTrack.module.css";
import { loadPeaks, type Peaks, peaksForRange } from "./peaks";

export interface WaveformProps {
  peaksUrl: string;
  /** Played source range in seconds. */
  start: number;
  end: number;
  /** Width of the block in px; one bar per 2 px. */
  width: number;
}

/** Mini waveform of a music clip (SVG, colours from the theme tokens). */
export function Waveform({ peaksUrl, start, end, width }: WaveformProps) {
  const [peaks, setPeaks] = useState<Peaks | null>(null);
  useEffect(() => {
    let live = true;
    void loadPeaks(peaksUrl).then((p) => {
      if (live) setPeaks(p);
    });
    return () => {
      live = false;
    };
  }, [peaksUrl]);

  // Normalised to the loudest peak of the file, so quiet recordings stay
  // visible and trimming does not rescale the waveform.
  const loudest = useMemo(
    () => (peaks ? peaks.peaks.reduce((a, b) => Math.max(a, b), 0) : 0),
    [peaks],
  );
  const bars = peaks ? peaksForRange(peaks, start, end, Math.max(1, Math.floor(width / 2))) : [];
  // Bars mirrored around the centre line; height 2 = full amplitude.
  const path = bars
    .map((p, i) => {
      const h = Math.max(loudest > 0 ? (p / loudest) * 0.9 : 0, 0.02);
      return `M${i} ${1 - h}V${1 + h}`;
    })
    .join("");
  return (
    <svg
      className={styles.waveform}
      viewBox={`0 0 ${Math.max(bars.length, 1)} 2`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-testid="waveform"
      data-bars={bars.length}
    >
      <line className={styles.waveformAxis} x1="0" y1="1" x2={Math.max(bars.length, 1)} y2="1" />
      {path ? <path className={styles.waveformBars} d={path} /> : null}
    </svg>
  );
}
