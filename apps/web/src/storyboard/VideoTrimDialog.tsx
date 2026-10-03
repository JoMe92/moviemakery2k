import { useEffect, useId, useRef, useState } from "react";
import { useT } from "../i18n/useT";
import type { VideoItem } from "../lib/apiClient";
import { formatClipTime, parseClipTime } from "../musictrack/clipTime";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import styles from "./VideoTrimDialog.module.css";

/** Small, muted preview of the video's frame at `time` (design.md D3: "Vorschau
 * des resultierenden Posterbilds an den neuen Rändern"). Canvas2D only, no
 * WebGL: a plain `drawImage` of a same-origin `<video>`. */
function FramePreview({ src, time, label }: { src: string; time: number; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!video || !canvas || !ctx || video.readyState < 2) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 1) return; // seeked once metadata loads instead
    if (Math.abs(video.currentTime - time) > 0.001) video.currentTime = time;
    else draw();
  }, [time]);

  return (
    <span className={styles.preview}>
      <video
        ref={videoRef}
        src={src}
        muted
        preload="auto"
        playsInline
        className={styles.hiddenVideo}
        onLoadedMetadata={(event) => {
          event.currentTarget.currentTime = time;
        }}
        onSeeked={draw}
      >
        <track kind="captions" />
      </video>
      <canvas ref={canvasRef} width={80} height={60} aria-label={label} role="img" />
    </span>
  );
}

export interface VideoTrimDialogProps {
  open: boolean;
  number: number;
  clip: { trimIn: number; trimOut: number };
  video: VideoItem;
  /** Applies the range; `false` = refused (the dialog stays open and states the range). */
  onConfirm: (trimIn: number, trimOut: number) => boolean;
  onClose: () => void;
}

/** "Properties…" for a video clip: trim start/end with a live poster preview at
 * each, `0 <= trimIn < trimOut <= ` the video's duration (design.md D3). */
export function VideoTrimDialog({
  open,
  number,
  clip,
  video,
  onConfirm,
  onClose,
}: VideoTrimDialogProps) {
  const { t, locale } = useT();
  const startId = useId();
  const endId = useId();
  const hintId = useId();
  const initialStart = formatClipTime(locale, clip.trimIn);
  const initialEnd = formatClipTime(locale, clip.trimOut);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (open) {
      setStart(initialStart);
      setEnd(initialEnd);
      setError(false);
    }
  }, [open, initialStart, initialEnd]);

  const range = t("storyboard.videoTrimRange", {
    min: formatClipTime(locale, 0),
    max: formatClipTime(locale, video.duration),
  });

  const confirm = () => {
    const startValue = start === initialStart ? clip.trimIn : parseClipTime(start);
    const endValue = end === initialEnd ? clip.trimOut : parseClipTime(end);
    if (startValue === null || endValue === null || !onConfirm(startValue, endValue)) {
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

  const clamp = (value: number) => Math.min(Math.max(value, 0), video.duration);
  const previewStart = clamp(parseClipTime(start) ?? clip.trimIn);
  const previewEnd = clamp(parseClipTime(end) ?? clip.trimOut);

  return (
    <Dialog
      open={open}
      title={t("storyboard.videoTrimTitle", { number })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={confirm}>{t("common.ok")}</Button>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
        </>
      }
    >
      <p className={styles.info}>
        {t("storyboard.videoTrimFile", { duration: formatClipTime(locale, video.duration) })}
      </p>
      <div className={styles.previews}>
        <FramePreview
          src={video.videoUrl}
          time={previewStart}
          label={t("storyboard.videoPreviewStart")}
        />
        <FramePreview
          src={video.videoUrl}
          time={previewEnd}
          label={t("storyboard.videoPreviewEnd")}
        />
      </div>
      {field(startId, t("storyboard.videoTrimIn"), start, setStart)}
      {field(endId, t("storyboard.videoTrimOut"), end, setEnd)}
      <p className={styles.hint}>{t("storyboard.videoTrimFormat")}</p>
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
