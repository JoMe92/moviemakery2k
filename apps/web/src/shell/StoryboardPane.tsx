import { type ReactNode, useId } from "react";
import { useT } from "../i18n/useT";
import { useAppStore } from "../store/useAppStore";
import { stepTileSize, TILE_SIZES, useTileSize } from "../storyboard/tileSize";
import { Button } from "../ui/Button";
import { TimelineIcon } from "../ui/icons";
import { isTouchLayout, useLayoutMode } from "./layoutMode";
import pane from "./Pane.module.css";
import styles from "./StoryboardPane.module.css";

export interface StoryboardPaneProps {
  /** Storyboard items; empty → hint text. */
  children?: ReactNode;
  /** Music track below the storyboard strip (add-music-track D7). */
  musicTrack?: ReactNode;
  /** Narration bar below the music track (add-narration-and-audio-levels D2). */
  narrationTrack?: ReactNode;
}

/**
 * Full-width storyboard with the music track and the narration bar below it, in
 * that order (design.md D2). The toggle button
 * switches the body between the filmstrip and the timeline view (design.md
 * D7) - both read the same store fields, so neither selection nor the
 * playhead position change when switching.
 */
export function StoryboardPane({ children, musicTrack, narrationTrack }: StoryboardPaneProps) {
  const { t } = useT();
  const headingId = useId();
  const timelineView = useAppStore((s) => s.timelineView);
  const toggleTimelineView = useAppStore((s) => s.toggleTimelineView);
  const isEmpty = children === undefined || children === null || children === false;
  // The timeline toggle is left out on phones (add-mobile-layout design.md D3);
  // View -> "Zeitachse" in the menu sheet still switches the view there.
  const layout = useLayoutMode();
  const compact = layout.mode === "compact";
  const touch = isTouchLayout(layout);
  const tileSize = useTileSize();
  return (
    <section className={`${pane.pane} ${styles.storyboard}`} aria-labelledby={headingId}>
      <div className={pane.header}>
        {compact ? null : (
          <Button
            variant="toolbar"
            icon={<TimelineIcon />}
            aria-pressed={timelineView}
            onClick={toggleTimelineView}
            className={styles.toggle}
          >
            {t("shell.showTimeline")}
          </Button>
        )}
        <h2 id={headingId} className={pane.heading}>
          {t("shell.storyboard")}
        </h2>
        {touch ? (
          <>
            {/* Alternative to the two-finger zoom of the tiles (design.md D12). */}
            <Button
              variant="toolbar"
              disabled={tileSize === TILE_SIZES[0]}
              onClick={() => stepTileSize(-1)}
            >
              {t("storyboard.smaller")}
            </Button>
            <Button
              variant="toolbar"
              disabled={tileSize === TILE_SIZES[TILE_SIZES.length - 1]}
              onClick={() => stepTileSize(1)}
            >
              {t("storyboard.larger")}
            </Button>
          </>
        ) : null}
      </div>
      <div className={`${pane.body} ${styles.body}`}>
        {isEmpty ? <p className={styles.hint}>{t("shell.storyboardHint")}</p> : children}
      </div>
      {musicTrack}
      {narrationTrack}
    </section>
  );
}
