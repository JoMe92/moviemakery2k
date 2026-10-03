import { type PointerEvent as ReactPointerEvent, useState } from "react";
import { useT } from "../i18n/useT";
import type { MediaItem, Slide } from "../lib/apiClient";
import { timelineOf } from "../player/controls";
import { slideDuration } from "../store/projectOps";
import { useAppStore } from "../store/useAppStore";
import type { PlacedSlide } from "../timeline/timeline";
import { catalogName } from "../transitions/transitionName";
import { formatDuration } from "./dropLogic";
import styles from "./TimelineView.module.css";
import { dragImageDuration, dragVideoTrim, type Edge, type VideoTrim } from "./timelineViewOps";

const BASE_PX_PER_SECOND = 20;
const ZOOM_RANGE = { min: 0.25, max: 4, step: 0.25, default: 1 } as const;
const RULER_INTERVALS = [1, 2, 5, 10, 30, 60] as const;

/** Seconds between ruler ticks: the smallest interval still >= 40 px apart. */
function tickInterval(pxPerSecond: number): number {
  return RULER_INTERVALS.find((s) => s * pxPerSecond >= 40) ?? 60;
}

function ticks(duration: number, pxPerSecond: number): number[] {
  const step = tickInterval(pxPerSecond);
  const count = Math.floor(duration / step) + 1;
  return Array.from({ length: count }, (_, i) => i * step);
}

interface TrimHandleProps {
  label: string;
  edge: Edge;
  onDrag: (edge: Edge, deltaSeconds: number) => void;
}

/** Drag handle at a clip's edge: live-adjusts trimIn/trimOut (video) or the
 * display duration (picture) by pixel delta / pxPerSecond (design.md D7). */
function TrimHandle({ label, edge, onDrag }: TrimHandleProps) {
  const onPointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const onMove = (moveEvent: PointerEvent) => onDrag(edge, moveEvent.clientX - startX);
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label={label}
      data-testid={`trim-handle-${edge}`}
      className={edge === "start" ? styles.handleStart : styles.handleEnd}
      onPointerDown={onPointerDown}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

interface TimelineClipProps {
  slide: Slide;
  number: number;
  media: MediaItem | undefined;
  placed: PlacedSlide;
  pxPerSecond: number;
  selected: boolean;
  onSelect: () => void;
  onDragEdge: (edge: Edge, deltaSeconds: number) => void;
}

function TimelineClip({
  slide,
  number,
  media,
  placed,
  pxPerSecond,
  selected,
  onSelect,
  onDragEdge,
}: TimelineClipProps) {
  const { t, locale } = useT();
  const name = media?.filename ?? t("storyboard.missingImage");
  const duration = formatDuration(slideDuration(slide), locale);
  const left = placed.start * pxPerSecond;
  const width = Math.max(0, placed.end - placed.start) * pxPerSecond;
  const canTrim = slide.kind === "image" ? media?.kind === "image" : media?.kind === "video";

  return (
    <button
      type="button"
      className={styles.clip}
      data-testid={`timeline-clip-${slide.id}`}
      style={{ left: `${left}px`, width: `${width}px` }}
      aria-pressed={selected}
      data-kind={slide.kind}
      aria-label={t("timelineView.clip", { number, name, duration })}
      title={`${name} (${duration})`}
      onClick={onSelect}
    >
      <span className={styles.clipLabel}>{name}</span>
      <span className={styles.clipDuration}>{duration}</span>
      {canTrim ? (
        <>
          <TrimHandle
            edge="start"
            label={t("timelineView.trimStart", { number })}
            onDrag={onDragEdge}
          />
          <TrimHandle
            edge="end"
            label={t("timelineView.trimEnd", { number })}
            onDrag={onDragEdge}
          />
        </>
      ) : null}
    </button>
  );
}

/**
 * Timeline view (design.md D7, spec preview-player "Zeitachsen-Ansicht"): a
 * second representation of the same filmstrip - a horizontal track with a
 * time ruler, clips in proportional width, a zoom slider and drag handles at
 * each clip's edges (video: trimIn/trimOut; picture: display duration).
 * Transitions appear as a wedge between two clips. Selection and the
 * playhead come straight from the store, exactly like the storyboard strip,
 * so switching views never changes either.
 */
export function TimelineView() {
  const { t, locale } = useT();
  const slides = useAppStore((s) => s.slides);
  const media = useAppStore((s) => s.media);
  const catalog = useAppStore((s) => s.catalog);
  const selection = useAppStore((s) => s.selection);
  const select = useAppStore((s) => s.select);
  const playback = useAppStore((s) => s.playback);
  const setSlideDuration = useAppStore((s) => s.setSlideDuration);
  const setVideoTrim = useAppStore((s) => s.setVideoTrim);
  const [zoom, setZoom] = useState<number>(ZOOM_RANGE.default);

  const timeline = timelineOf(slides);
  const pxPerSecond = BASE_PX_PER_SECOND * zoom;
  const trackWidth = Math.max(timeline.duration, 1) * pxPerSecond;

  const onDragEdge = (slide: Slide) => (edge: Edge, deltaPx: number) => {
    const deltaSeconds = deltaPx / pxPerSecond;
    if (slide.kind === "video") {
      const item = media.find((m) => m.id === slide.mediaId);
      if (item?.kind !== "video") return;
      const baseline: VideoTrim = { trimIn: slide.trimIn, trimOut: slide.trimOut };
      const { trimIn, trimOut } = dragVideoTrim(edge, baseline, item.duration, deltaSeconds);
      setVideoTrim(slide.id, trimIn, trimOut);
    } else {
      const duration = dragImageDuration(edge, slide.duration, deltaSeconds);
      setSlideDuration(slide.id, duration);
    }
  };

  if (slides.length === 0) {
    return <p className={styles.hint}>{t("shell.storyboardHint")}</p>;
  }

  return (
    <div className={styles.view}>
      <div className={styles.toolbar}>
        <label className={styles.zoomLabel}>
          {t("timelineView.zoom")}
          <input
            type="range"
            aria-label={t("timelineView.zoom")}
            min={ZOOM_RANGE.min}
            max={ZOOM_RANGE.max}
            step={ZOOM_RANGE.step}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
      </div>
      <div className={styles.scroll} data-testid="timeline-scroll">
        <div className={styles.track} style={{ width: `${trackWidth}px` }}>
          <div className={styles.ruler} aria-hidden="true">
            {ticks(timeline.duration, pxPerSecond).map((time) => (
              <span
                key={time}
                className={styles.tick}
                style={{ left: `${time * pxPerSecond}px` }}
              >
                {formatDuration(time, locale)}
              </span>
            ))}
          </div>
          <div
            className={styles.lane}
            aria-label={t("timelineView.list")}
            data-testid="timeline-lane"
          >
            {timeline.slides.map((placed) => {
              const slide = slides[placed.index];
              if (!slide) return null;
              return (
                <TimelineClip
                  key={slide.id}
                  slide={slide}
                  number={placed.index + 1}
                  media={media.find((m) => m.id === slide.mediaId)}
                  placed={placed}
                  pxPerSecond={pxPerSecond}
                  selected={selection?.slideId === slide.id}
                  onSelect={() => select({ kind: "slide", slideId: slide.id })}
                  onDragEdge={onDragEdge(slide)}
                />
              );
            })}
            {timeline.slides
              .filter((placed) => placed.transitionIn > 0)
              .map((placed) => {
                const transitionId = placed.slide.transitionIn?.transitionId;
                if (!transitionId) return null;
                return (
                  <span
                    key={`wedge-${placed.slide.id}`}
                    className={styles.wedge}
                    data-testid={`timeline-transition-${placed.slide.id}`}
                    style={{
                      left: `${placed.start * pxPerSecond}px`,
                      width: `${placed.transitionIn * pxPerSecond}px`,
                    }}
                    title={catalogName(catalog, transitionId, locale)}
                    aria-label={t("timelineView.transition", {
                      name: catalogName(catalog, transitionId, locale),
                    })}
                  />
                );
              })}
            <span
              className={styles.playhead}
              data-testid="timeline-playhead"
              style={{ left: `${Math.min(playback.time, timeline.duration) * pxPerSecond}px` }}
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
