import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import styles from "./MusicClipDialogs.module.css";
import { Waveform } from "./Waveform";

export interface TrimWaveformProps {
  peaksUrl: string;
  /** Duration of the audio file in seconds. */
  duration: number;
  start: number;
  end: number;
  /** Smallest distance between the handles (s). */
  minLength: number;
  /** Keyboard step (s). */
  step: number;
  startLabel: string;
  endLabel: string;
  format: (seconds: number) => string;
  onChange: (start: number, end: number) => void;
  /** Called with the handle's time when it is released (plays a short preview). */
  onRelease: (time: number) => void;
}

const WAVE_WIDTH = 600;

/**
 * Whole file as a waveform with two draggable handles for start and end
 * (add-mobile-layout design.md D10). Handles are 44 px touch targets and
 * keyboard sliders (arrow keys by `step`).
 */
export function TrimWaveform({
  peaksUrl,
  duration,
  start,
  end,
  minLength,
  step,
  startLabel,
  endLabel,
  format,
  onChange,
  onRelease,
}: TrimWaveformProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ handle: "start" | "end"; id: number } | null>(null);
  const last = useRef({ start, end });
  last.current = { start, end };

  const clampStart = (v: number) => Math.min(Math.max(0, v), end - minLength);
  const clampEnd = (v: number) => Math.max(Math.min(duration, v), start + minLength);
  const set = (handle: "start" | "end", v: number) => {
    const rounded = Math.round(v * 100) / 100;
    if (handle === "start") onChange(clampStart(rounded), end);
    else onChange(start, clampEnd(rounded));
  };

  const timeAt = (clientX: number) => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return ((clientX - rect.left) / rect.width) * duration;
  };

  const handleProps = (handle: "start" | "end") => {
    const value = handle === "start" ? start : end;
    return {
      role: "slider",
      tabIndex: 0,
      "aria-label": handle === "start" ? startLabel : endLabel,
      "aria-valuemin": handle === "start" ? 0 : start + minLength,
      "aria-valuemax": handle === "start" ? end - minLength : duration,
      "aria-valuenow": value,
      "aria-valuetext": format(value),
      className: styles.handle,
      style: { left: `${(value / duration) * 100}%` },
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragging.current = { handle, id: event.pointerId };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        if (dragging.current?.id !== event.pointerId) return;
        set(handle, timeAt(event.clientX));
      },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
        if (dragging.current?.id !== event.pointerId) return;
        dragging.current = null;
        onRelease(handle === "start" ? last.current.start : last.current.end);
      },
      onPointerCancel: () => {
        dragging.current = null;
      },
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        const delta =
          event.key === "ArrowRight" || event.key === "ArrowUp"
            ? step
            : event.key === "ArrowLeft" || event.key === "ArrowDown"
              ? -step
              : 0;
        if (delta === 0) return;
        event.preventDefault();
        set(handle, value + delta);
      },
    } as const;
  };

  return (
    <div ref={areaRef} className={styles.wave} data-testid="trim-waveform">
      <Waveform peaksUrl={peaksUrl} start={0} end={duration} width={WAVE_WIDTH} />
      <div
        className={styles.cutout}
        style={{ left: 0, width: `${(start / duration) * 100}%` }}
        aria-hidden="true"
      />
      <div
        className={styles.cutout}
        style={{ left: `${(end / duration) * 100}%`, right: 0 }}
        aria-hidden="true"
      />
      <div {...handleProps("start")} />
      <div {...handleProps("end")} />
    </div>
  );
}
