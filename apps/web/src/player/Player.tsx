import { useDndMonitor } from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n/useT";
import type { MediaItem, Slide } from "../lib/apiClient";
import { loadImage } from "../render/imageCache";
import { PreviewCanvas } from "../render/PreviewCanvas";
import type { ImageSource } from "../render/Renderer";
import { MonitorPane } from "../shell/MonitorPane";
import { useAppStore, useAppStoreApi } from "../store/useAppStore";
import { frameAt } from "../timeline/timeline";
import { transitionName } from "../transitions/transitionName";
import { Button } from "../ui/Button";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon, StopIcon } from "../ui/icons";
import { startClock } from "./clock";
import { demoFrame, shouldToggleOnSpace, timelineOf } from "./controls";
import styles from "./Player.module.css";
import { sampleImages } from "./sampleImages";

/** Load the preview images (previewUrl) of all images in the filmstrip, in order. */
function useSlideImages(slides: readonly Slide[], media: readonly MediaItem[]) {
  const [loaded, setLoaded] = useState<ReadonlyMap<string, ImageSource>>(new Map());

  useEffect(() => {
    let active = true;
    const urls = new Map(
      media.flatMap((m) => (m.kind === "image" ? [[m.id, m.previewUrl] as const] : [])),
    );
    const wanted = [...new Set(slides.map((s) => s.mediaId))];
    for (const mediaId of wanted) {
      const url = urls.get(mediaId);
      if (!url) continue;
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

  return useCallback(
    (index: number) => {
      const mediaId = slides[index]?.mediaId;
      return mediaId ? loaded.get(mediaId) : undefined;
    },
    [slides, loaded],
  );
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
  const slides = useAppStore((s) => s.slides);
  const media = useAppStore((s) => s.media);
  const catalog = useAppStore((s) => s.catalog);
  const playback = useAppStore((s) => s.playback);
  const demo = useAppStore((s) => s.demo);
  const previewId = useAppStore((s) => s.previewTransitionId);

  const timeline = timelineOf(slides);
  const empty = slides.length === 0;
  const slideImages = useSlideImages(slides, media);

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

  // rAF clock only while something is playing.
  const running = playback.playing || Boolean(demo?.playing);
  useEffect(() => {
    if (!running) return;
    return startClock((dt) => store.getState().tick(dt));
  }, [running, store]);

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
  }, [store]);

  const playing = playback.playing && !demo;
  const state = store.getState;

  return (
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
              onClick={() => state().togglePlay()}
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
          </div>
        </div>
      }
    >
      <PreviewCanvas frame={frame} images={images} params={params} />
      {demoTransition ? (
        <p className={styles.sample} role="status">
          {t("player.sample", { name: transitionName(demoTransition, locale) })}
        </p>
      ) : null}
    </MonitorPane>
  );
}
