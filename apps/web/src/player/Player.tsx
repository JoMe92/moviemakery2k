import { useDndMonitor } from "@dnd-kit/core";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMusicAudio } from "../audio/useMusicAudio";
import { useT } from "../i18n/useT";
import type { MediaItem, Slide } from "../lib/apiClient";
import { loadImage } from "../render/imageCache";
import { PreviewCanvas } from "../render/PreviewCanvas";
import type { ImageSource } from "../render/Renderer";
import { isTouchLayout, useLayoutMode } from "../shell/layoutMode";
import { MonitorPane } from "../shell/MonitorPane";
import { useAppStore, useAppStoreApi } from "../store/useAppStore";
import { frameAt, type Timeline } from "../timeline/timeline";
import { transitionName } from "../transitions/transitionName";
import { Button } from "../ui/Button";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon, StopIcon } from "../ui/icons";
import { useGestures } from "../ui/useGestures";
import { startClock } from "./clock";
import {
  demoFrame,
  shouldToggleOnSpace,
  timelineOf,
  videoScrubTime,
  videoSeekTarget,
} from "./controls";
import styles from "./Player.module.css";
import { sampleImages } from "./sampleImages";
import { useFullscreen } from "./useFullscreen";

/** Load the preview images (previewUrl) of all images in the filmstrip, in order. */
function useLoadedImages(slides: readonly Slide[], media: readonly MediaItem[]) {
  const [loaded, setLoaded] = useState<ReadonlyMap<string, ImageSource>>(new Map());

  useEffect(() => {
    let active = true;
    const urls = new Map(
      media.flatMap((m) => (m.kind === "image" ? [[m.id, m.previewUrl] as const] : [])),
    );
    const wanted = [...new Set(slides.map((s) => (s.kind === "image" ? s.mediaId : null)))];
    for (const mediaId of wanted) {
      const url = mediaId === null ? undefined : urls.get(mediaId);
      if (!url || mediaId === null) continue;
      loadImage(url).then(
        (img) => {
          if (!active) return;
          setLoaded((prev) => (prev.get(mediaId) === img ? prev : new Map(prev).set(mediaId, img)));
        },
        () => {
          // Not loadable: the monitor stays black at this point.
        },
      );
    }
    return () => {
      active = false;
    };
  }, [slides, media]);

  return loaded;
}

/** A `<video>` element must stay out of the document's layout but, unlike
 * `display: none`, still actually load and decode (design.md D5). */
const HIDDEN_VIDEO_STYLE: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
};

/** How often the "a video is present" redraw pump bumps `tick`, in ms (~15 Hz). */
const VIDEO_PUMP_INTERVAL_MS = 66;

/**
 * One hidden, paused, muted `<video>` element per video medium used in the
 * filmstrip (add-timeline-editing design.md D5): no own playback clock, the
 * element is only ever scrubbed via `currentTime`. A real (if visually
 * hidden) DOM element, not a detached node - some engines do not reliably
 * decode a `<video>` that was never attached. Kept until its last slide is
 * gone, React then unmounts and releases it.
 *
 * A video's decode progress is not reliably observable as a one-shot,
 * awaitable event across engines the way a picture's `loadImage()` promise
 * is, so instead of reacting to a specific event, `tick` is pumped at a
 * steady pace for as long as any video slide exists; a caller depends on it
 * to force a redraw. This also covers a scrub landing before the browser has
 * decoded that position yet.
 */
function useVideoElements(slides: readonly Slide[], media: readonly MediaItem[]) {
  const videosRef = useRef(new Map<string, HTMLVideoElement>());
  const [tick, setTick] = useState(0);

  // Chromium (and others) only fetch metadata for a video that is not visible
  // in the viewport, regardless of `preload` - a brief, muted play()/pause()
  // once metadata is known makes it actually decode a frame (never visibly
  // "plays": it is muted, effectively zero-sized, and paused again
  // immediately; the timeline stays the only clock, design.md D5).
  const onMetadataLoaded = useCallback((event: { currentTarget: HTMLVideoElement }) => {
    // `currentTarget` is only valid synchronously; the DOM resets it to null
    // once the event finishes dispatching, well before `play()` resolves.
    const video = event.currentTarget;
    video.play().then(
      () => video.pause(),
      () => {
        // Autoplay refused (unlikely: muted): the element stays at trimIn.
      },
    );
  }, []);

  const urls = new Map(
    media.flatMap((m) => (m.kind === "video" ? [[m.id, m.videoUrl] as const] : [])),
  );
  const wanted = [...new Set(slides.flatMap((s) => (s.kind === "video" ? [s.mediaId] : [])))];

  useEffect(() => {
    if (wanted.length === 0) return;
    let raf = 0;
    let last = 0;
    const step = (now: number) => {
      if (now - last >= VIDEO_PUMP_INTERVAL_MS) {
        last = now;
        setTick((n) => n + 1);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [wanted.length]);

  const elements = (
    <div aria-hidden="true" style={HIDDEN_VIDEO_STYLE}>
      {wanted.flatMap((mediaId) => {
        const url = urls.get(mediaId);
        if (!url) return [];
        return (
          <video
            key={mediaId}
            ref={(el) => {
              if (el) videosRef.current.set(mediaId, el);
              else videosRef.current.delete(mediaId);
            }}
            muted
            preload="auto"
            playsInline
            src={url}
            onLoadedMetadata={onMetadataLoaded}
          >
            <track kind="captions" />
          </video>
        );
      })}
    </div>
  );

  return { videos: videosRef, tick, elements };
}

/**
 * Image source for each filmstrip index: a decoded preview image, or a video
 * scrubbed to `trimIn + (time − segment start)` (design.md D5, spec
 * preview-player "Videoclips in der Wiedergabe"). `time` is the instant being
 * drawn (`playback.time`), independent of whether playback is running.
 */
export function useSlideImages(
  slides: readonly Slide[],
  media: readonly MediaItem[],
  timeline: Timeline,
  time: number,
) {
  const loadedImages = useLoadedImages(slides, media);
  const { videos, tick, elements: videoElements } = useVideoElements(slides, media);

  // `tick` is in the list without being read in the body: a new identity per
  // pump tick is what redraws the canvas while a video's frame is still
  // catching up (design.md D5).
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick only forces a new identity.
  const images = useCallback(
    (index: number): ImageSource | undefined => {
      const slide = slides[index];
      if (!slide) return undefined;
      if (slide.kind === "image") return loadedImages.get(slide.mediaId);
      const video = videos.current.get(slide.mediaId);
      if (!video) return undefined;
      const placed = timeline.slides[index];
      const target = placed
        ? videoScrubTime(slide.trimIn, slide.trimOut, placed.start, time)
        : slide.trimIn;
      const seekTo = videoSeekTarget(video, target, slide.trimIn, slide.trimOut);
      if (seekTo !== null) video.currentTime = seekTo;
      return video;
    },
    [slides, loadedImages, videos, timeline, time, tick],
  );

  return { images, videoElements };
}

/**
 * Preview monitor with player: rAF clock, control bar, seek bar, time display,
 * space bar and transition demo for the catalog. During the demo the monitor
 * is labelled "Sample: <name>"; play, seek and filmstrip selection return to
 * the project (design.md D7).
 */
export function Player() {
  const { t, formatTime, locale } = useT();
  const store = useAppStoreApi();
  const audio = useMusicAudio(store);
  const slides = useAppStore((s) => s.slides);
  const media = useAppStore((s) => s.media);
  const catalog = useAppStore((s) => s.catalog);
  const playback = useAppStore((s) => s.playback);
  const demo = useAppStore((s) => s.demo);
  const previewId = useAppStore((s) => s.previewTransitionId);

  const timeline = timelineOf(slides);
  const empty = slides.length === 0;
  const { images: slideImages, videoElements } = useSlideImages(
    slides,
    media,
    timeline,
    playback.time,
  );

  const demoTransition = demo && previewId ? catalog.find((t) => t.id === previewId) : undefined;
  const frame = demoTransition
    ? demoFrame(demo?.time ?? 0, demoTransition.id, demoTransition.defaultDuration)
    : frameAt(timeline, playback.time);
  const images = useMemo(
    () => (demoTransition ? (i: number) => sampleImages()[i] : slideImages),
    [demoTransition, slideImages],
  );
  const params = useCallback(
    (id: string) => catalog.find((t) => t.id === id)?.params ?? {},
    [catalog],
  );

  // rAF clock only while something is playing. While music is scheduled, the
  // audio clock is the master clock (add-music-track design.md D5).
  const running = playback.playing || Boolean(demo?.playing);
  useEffect(() => {
    if (!running) return;
    return startClock((dt) => {
      const state = store.getState();
      const audioTime = audio.clockTime();
      state.tick(audioTime === null ? dt : audioTime - state.playback.time);
    });
  }, [running, store, audio]);

  // A hidden tab pauses playback, which also stops the rAF clock; the
  // monitor keeps the paused position (add-mobile-layout design.md D14).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      const state = store.getState();
      if (state.playback.playing) state.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [store]);

  // Space bar: play/pause (except in input fields, dialogs, menus and while dragging).
  const draggingRef = useRef(false);
  useDndMonitor({
    onDragStart: () => {
      draggingRef.current = true;
    },
    onDragEnd: () => {
      draggingRef.current = false;
    },
    onDragCancel: () => {
      draggingRef.current = false;
    },
  });
  useEffect(() => {
    let swallowKeyUp = false;
    const onKeyDown = (event: KeyboardEvent) => {
      const state = store.getState();
      if (state.slides.length === 0) return;
      const ok = shouldToggleOnSpace(event, {
        dialogOpen: document.querySelector("dialog[open]") !== null,
        dragging: draggingRef.current,
      });
      if (!ok) return;
      // Intercept before buttons and dnd-kit so nothing fires twice.
      event.preventDefault();
      event.stopPropagation();
      swallowKeyUp = true;
      // Inside the user gesture: create/resume the AudioContext.
      audio.unlock();
      state.togglePlay();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (swallowKeyUp && (event.key === " " || event.code === "Space")) {
        event.preventDefault();
        event.stopPropagation();
        swallowKeyUp = false;
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [store, audio]);

  const playing = playback.playing && !demo;
  const state = store.getState;

  // Gestures and full screen (add-mobile-layout design.md D12).
  const touch = isTouchLayout(useLayoutMode());
  const rootRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(rootRef);
  const gestures = useGestures(
    {
      onSwipeLeft: () => {
        if (store.getState().slides.length > 0) store.getState().nextSlide();
      },
      onSwipeRight: () => {
        if (store.getState().slides.length > 0) store.getState().prevSlide();
      },
      onDoubleTap: () => (fullscreen.mode === "off" ? fullscreen.enter() : fullscreen.exit()),
      onActivity: () => {
        if (fullscreen.mode !== "off") fullscreen.showControls();
      },
    },
    touch,
  );

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-fullscreen={fullscreen.mode}
      data-controls={
        fullscreen.mode !== "off" && !fullscreen.controlsVisible ? "hidden" : undefined
      }
      onPointerDown={fullscreen.mode !== "off" ? fullscreen.showControls : undefined}
    >
      <MonitorPane
        controls={
          <div className={styles.controls}>
            <input
              className={styles.seek}
              type="range"
              aria-label={t("player.seek")}
              min={0}
              max={timeline.duration}
              step={0.01}
              value={Math.min(playback.time, timeline.duration)}
              aria-valuetext={formatTime(playback.time)}
              disabled={empty}
              onChange={(event) => state().seek(Number(event.target.value))}
            />
            <div className={styles.buttons}>
              <Button
                variant="toolbar"
                icon={playing ? <PauseIcon /> : <PlayIcon />}
                label={playing ? t("player.pause") : t("player.play")}
                disabled={empty}
                onClick={() => {
                  audio.unlock();
                  state().togglePlay();
                }}
              />
              <Button
                variant="toolbar"
                icon={<StopIcon />}
                label={t("player.stop")}
                disabled={empty}
                onClick={() => state().stop()}
              />
              <Button
                variant="toolbar"
                icon={<PrevIcon />}
                label={t("player.previous")}
                disabled={empty}
                onClick={() => state().prevSlide()}
              />
              <Button
                variant="toolbar"
                icon={<NextIcon />}
                label={t("player.next")}
                disabled={empty}
                onClick={() => state().nextSlide()}
              />
              <output className={styles.time} aria-label={t("player.time")}>
                {formatTime(playback.time)} / {formatTime(timeline.duration)}
              </output>
              {fullscreen.mode !== "off" ? (
                <Button variant="toolbar" onClick={fullscreen.exit}>
                  {t("player.exitFullscreen")}
                </Button>
              ) : touch ? (
                <Button variant="toolbar" onClick={fullscreen.enter}>
                  {t("player.fullscreen")}
                </Button>
              ) : null}
            </div>
          </div>
        }
      >
        <div className={styles.gestures} data-testid="monitor-gestures" {...gestures}>
          <PreviewCanvas frame={frame} images={images} params={params} />
        </div>
        {videoElements}
        {demoTransition ? (
          <p className={styles.sample} role="status">
            {t("player.sample", { name: transitionName(demoTransition, locale) })}
          </p>
        ) : null}
      </MonitorPane>
    </div>
  );
}
