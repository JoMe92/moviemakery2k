import { useEffect, useId, useRef, useState } from "react";
import { formatNumber, parseDecimal } from "../i18n/format";
import { useT } from "../i18n/useT";
import type { MusicClip } from "../lib/apiClient";
import { isTouchLayout, useLayoutMode } from "../shell/layoutMode";
import { MUSIC_CLIP_MIN_LENGTH, MUSIC_VOLUME } from "../store/musicOps";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Stepper } from "../ui/Stepper";
import { formatClipTime, parseClipTime } from "./clipTime";
import styles from "./MusicClipDialogs.module.css";
import { TrimWaveform } from "./TrimWaveform";

const PERCENT_MIN = MUSIC_VOLUME.min * 100;
const PERCENT_MAX = MUSIC_VOLUME.max * 100;

/** Touch steps (add-mobile-layout design.md D10): volume 5 %, trim 0.1 s. */
export const VOLUME_TOUCH_STEP = 5;
export const TRIM_TOUCH_STEP = 0.1;
/** Length (s) played from a trim handle after it is released. */
export const TRIM_PREVIEW_SECONDS = 2;

/** "50", "50,5", "50.5" or "50 %" → 50 / 50.5; null for anything else. */
export function parseVolumePercent(text: string): number | null {
  return parseDecimal(text.trim().replace(/\s*%$/, ""));
}

export interface VolumeDialogProps {
  open: boolean;
  /** Position of the clip on the music track (1-based), for the title. */
  number: number;
  /** Linear gain, 1 = 100 %. */
  volume: number;
  /** Applies the gain; `false` = refused (the dialog stays open and states the range). */
  onConfirm: (volume: number) => boolean;
  onClose: () => void;
}

/** "Volume…": slider and number field, 0–200 %. */
export function VolumeDialog({ open, number, volume, onConfirm, onClose }: VolumeDialogProps) {
  const { t, locale } = useT();
  const sliderId = useId();
  const fieldId = useId();
  const hintId = useId();
  const initialText = formatNumber(locale, Math.round(volume * 1000) / 10);
  const [text, setText] = useState(initialText);
  const [error, setError] = useState(false);
  const touch = isTouchLayout(useLayoutMode());

  useEffect(() => {
    if (open) {
      setText(initialText);
      setError(false);
    }
  }, [open, initialText]);

  const parsed = parseVolumePercent(text);
  const valid = parsed !== null && parsed >= PERCENT_MIN && parsed <= PERCENT_MAX;
  const sliderValue = valid ? parsed : Math.round(volume * 100);
  const range = t("musicTrack.volumeRange", {
    min: formatNumber(locale, PERCENT_MIN),
    max: formatNumber(locale, PERCENT_MAX),
  });

  const confirm = () => {
    if (!valid || !onConfirm(parsed / 100)) {
      setError(true);
      return;
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      title={t("musicTrack.volumeTitle", { number })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={confirm}>{t("common.ok")}</Button>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
        </>
      }
    >
      {touch ? (
        <div className={styles.stepper}>
          <Stepper
            label={t("musicTrack.volumeSlider")}
            value={sliderValue}
            min={PERCENT_MIN}
            max={PERCENT_MAX}
            step={VOLUME_TOUCH_STEP}
            format={(v) => `${formatNumber(locale, v)} %`}
            onChange={(v) => {
              setText(formatNumber(locale, v));
              setError(false);
            }}
          />
        </div>
      ) : null}
      <div className={styles.field}>
        <label htmlFor={sliderId}>{t("musicTrack.volumeSlider")}</label>
        <input
          id={sliderId}
          className={styles.slider}
          type="range"
          min={PERCENT_MIN}
          max={PERCENT_MAX}
          step={touch ? VOLUME_TOUCH_STEP : 1}
          value={sliderValue}
          aria-valuetext={`${formatNumber(locale, sliderValue)} %`}
          onChange={(event) => {
            setText(formatNumber(locale, Number(event.target.value)));
            setError(false);
          }}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={fieldId}>{t("musicTrack.volumeField")}</label>
        <input
          id={fieldId}
          className={styles.input}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={hintId}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              confirm();
            }
          }}
        />
      </div>
      <p
        id={hintId}
        className={error ? styles.error : styles.hint}
        role={error ? "alert" : undefined}
      >
        {range}
      </p>
    </Dialog>
  );
}

export interface TrimDialogProps {
  open: boolean;
  number: number;
  clip: Pick<MusicClip, "trimStart" | "trimEnd">;
  /** Duration of the audio file in seconds. */
  fileDuration: number;
  /** Applies the range (`trimEnd` null = end of the file); `false` = refused. */
  onConfirm: (trimStart: number, trimEnd: number | null) => boolean;
  onClose: () => void;
  /** Waveform of the whole file for the touch handles (optional). */
  peaksUrl?: string;
  /** Audio of the file for the preview after releasing a handle. */
  audioUrl?: string;
  /** Plays a short preview from `time` (default: HTMLAudioElement over `audioUrl`). */
  onPreview?: (time: number) => void;
}

/** Plays `seconds` of `url` from `time`; returns a stop function. */
function playSnippet(url: string, time: number, seconds: number): () => void {
  const audio = new Audio(url);
  audio.currentTime = time;
  const timer = setTimeout(() => audio.pause(), seconds * 1000);
  void audio.play()?.catch(() => undefined);
  return () => {
    clearTimeout(timer);
    audio.pause();
  };
}

/** Display rounding of the time fields (hundredths): an end within it counts as the file end. */
const DISPLAY_TOLERANCE = 0.005;

/** "Trim…": start and end within the file, `0 ≤ start < end ≤ duration`, length ≥ 0.5 s. */
export function TrimDialog({
  open,
  number,
  clip,
  fileDuration,
  onConfirm,
  onClose,
  peaksUrl,
  audioUrl,
  onPreview,
}: TrimDialogProps) {
  const { t, locale } = useT();
  const startId = useId();
  const endId = useId();
  const hintId = useId();
  const initialStart = formatClipTime(locale, clip.trimStart);
  const initialEnd = formatClipTime(locale, clip.trimEnd ?? fileDuration);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [error, setError] = useState(false);
  const touch = isTouchLayout(useLayoutMode());
  const stopPreview = useRef<(() => void) | null>(null);
  useEffect(() => () => stopPreview.current?.(), []);
  const preview = (time: number) => {
    if (onPreview) return onPreview(time);
    if (!audioUrl) return;
    stopPreview.current?.();
    stopPreview.current = playSnippet(audioUrl, time, TRIM_PREVIEW_SECONDS);
  };

  useEffect(() => {
    if (open) {
      setStart(initialStart);
      setEnd(initialEnd);
      setError(false);
    }
  }, [open, initialStart, initialEnd]);

  const range = t("musicTrack.trimRange", {
    min: formatClipTime(locale, 0),
    max: formatClipTime(locale, fileDuration),
    length: formatNumber(locale, MUSIC_CLIP_MIN_LENGTH),
  });

  const confirm = () => {
    // Unchanged fields keep their exact value (the display is rounded to hundredths).
    const startValue = start === initialStart ? clip.trimStart : parseClipTime(start);
    const endValue = end === initialEnd ? (clip.trimEnd ?? fileDuration) : parseClipTime(end);
    if (startValue === null || endValue === null) {
      setError(true);
      return;
    }
    // The file end is stored as null.
    const atFileEnd = Math.abs(endValue - fileDuration) <= DISPLAY_TOLERANCE;
    if (!onConfirm(startValue, atFileEnd ? null : endValue)) {
      setError(true);
      return;
    }
    onClose();
  };

  const field = (id: string, label: string, value: string, onChange: (v: string) => void) => (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={styles.input}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            confirm();
          }
        }}
      />
    </div>
  );

  function trimControls() {
    const startNow = start === initialStart ? clip.trimStart : parseClipTime(start);
    const endNow = end === initialEnd ? (clip.trimEnd ?? fileDuration) : parseClipTime(end);
    const s = startNow ?? clip.trimStart;
    const e = endNow ?? clip.trimEnd ?? fileDuration;
    const fmt = (v: number) => formatClipTime(locale, v);
    const setRange = (nextStart: number, nextEnd: number) => {
      if (nextStart !== s) setStart(fmt(nextStart));
      if (nextEnd !== e) setEnd(fmt(nextEnd));
      setError(false);
    };
    return (
      <>
        {peaksUrl ? (
          <TrimWaveform
            peaksUrl={peaksUrl}
            duration={fileDuration}
            start={s}
            end={e}
            minLength={MUSIC_CLIP_MIN_LENGTH}
            step={TRIM_TOUCH_STEP}
            startLabel={t("musicTrack.trimStart")}
            endLabel={t("musicTrack.trimEnd")}
            format={fmt}
            onChange={setRange}
            onRelease={preview}
          />
        ) : null}
        <div className={styles.stepper}>
          <Stepper
            label={t("musicTrack.trimStart")}
            value={s}
            min={0}
            max={Math.max(0, e - MUSIC_CLIP_MIN_LENGTH)}
            step={TRIM_TOUCH_STEP}
            format={fmt}
            onChange={(v) => setRange(v, e)}
          />
        </div>
        <div className={styles.stepper}>
          <Stepper
            label={t("musicTrack.trimEnd")}
            value={e}
            min={Math.min(fileDuration, s + MUSIC_CLIP_MIN_LENGTH)}
            max={fileDuration}
            step={TRIM_TOUCH_STEP}
            format={fmt}
            onChange={(v) => setRange(s, v)}
          />
        </div>
      </>
    );
  }

  return (
    <Dialog
      open={open}
      title={t("musicTrack.trimTitle", { number })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={confirm}>{t("common.ok")}</Button>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
        </>
      }
    >
      <p className={styles.info}>
        {t("musicTrack.trimFile", { duration: formatClipTime(locale, fileDuration) })}
      </p>
      {touch ? trimControls() : null}
      {field(startId, t("musicTrack.trimStart"), start, setStart)}
      {field(endId, t("musicTrack.trimEnd"), end, setEnd)}
      <p className={styles.hint}>{t("musicTrack.trimFormat")}</p>
      <p
        id={hintId}
        className={error ? styles.error : styles.hint}
        role={error ? "alert" : undefined}
      >
        {range}
      </p>
    </Dialog>
  );
}
