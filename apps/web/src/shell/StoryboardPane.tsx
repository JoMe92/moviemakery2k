import { type ReactNode, useId } from "react";
import { useT } from "../i18n/useT";
import { Button } from "../ui/Button";
import { TimelineIcon } from "../ui/icons";
import { stepTileSize, TILE_SIZES, useTileSize } from "../storyboard/tileSize";
import { isTouchLayout, useLayoutMode } from "./layoutMode";
import pane from "./Pane.module.css";
import styles from "./StoryboardPane.module.css";

export interface StoryboardPaneProps {
  /** Storyboard items; empty → hint text. */
  children?: ReactNode;
  /** Music track below the storyboard strip (add-music-track D7). */
  musicTrack?: ReactNode;
}

/** Full-width storyboard with the music track below it. The timeline is disabled in the MVP. */
export function StoryboardPane({ children, musicTrack }: StoryboardPaneProps) {
  const { t } = useT();
  const headingId = useId();
  const isEmpty = children === undefined || children === null || children === false;
  // The disabled timeline toggle is left out on phones (design.md D3).
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
            aria-pressed={false}
            disabled
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
    </section>
  );
}
