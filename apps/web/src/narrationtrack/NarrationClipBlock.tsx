import { type KeyboardEvent, type MouseEvent, type PointerEvent, useRef, useState } from "react";
import { formatClipDuration } from "../i18n/format";
import { useT } from "../i18n/useT";
import type { AudioItem, NarrationClip } from "../lib/apiClient";
import { Waveform } from "../musictrack/Waveform";
import { isTouchLayout, useLayoutMode } from "../shell/layoutMode";
import { chain, useLongPress } from "../ui/useLongPress";
import styles from "./NarrationTrack.module.css";

/** Width of one second on the narration bar; the same scale as the music bar,
 * so the two line up under each other. */
export const NARRATION_PX_PER_SECOND = 3;
/** Keyboard move step in seconds; Shift makes it four times as large. */
export const MOVE_STEP = 0.25;
export const MOVE_STEP_COARSE = 1;

export interface NarrationClipBlockProps {
  clip: NarrationClip;
  /** Position on the narration track (1-based), for the labels. */
  number: number;
  /** The audio medium; undefined if it is missing. */
  item: AudioItem | undefined;
  /** Played length in seconds (end − start). */
  length: number;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  /** New absolute start time in seconds; the store clamps and validates. */
  onMove: (at: number) => void;
  onMenu: (x: number, y: number) => void;
  tileRef?: (el: HTMLButtonElement | null) => void;
}

/**
 * Block on the narration bar (spec narration-track "Erzählungsleiste"): sits at
 * its clip's absolute `at`, so it is positioned, not laid out in a row — two
 * blocks may overlap and both stay where they are.
 *
 * Dragging it sideways changes the start time, and so do the arrow keys (0.25 s,
 * 1 s with Shift). It is not a dnd-kit sortable like a music clip: there is no
 * order to sort, only a time to set.
 */
export function NarrationClipBlock({
  clip,
  number,
  item,
  length,
  selected,
  onSelect,
  onRemove,
  onMove,
  onMenu,
  tileRef,
}: NarrationClipBlockProps) {
  const { t, locale } = useT();
  const name = item?.filename ?? t("narrationTrack.missingAudio");
  const duration = formatClipDuration(locale, length);
  const start = formatClipDuration(locale, clip.at);
  const width = Math.max(0, length) * NARRATION_PX_PER_SECOND;
  const end = item ? (clip.trimEnd === null ? item.duration : clip.trimEnd) : 0;
  const touch = isTouchLayout(useLayoutMode());
  const blockEl = useRef<HTMLButtonElement | null>(null);
  const drag = useRef<{ pointerId: number; startX: number; startAt: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const openMenuAt = (el: HTMLElement) => {
    onSelect();
    const rect = el.getBoundingClientRect();
    onMenu(rect.left + rect.width / 2, rect.top + rect.height / 2);
  };
  // Long press opens the action sheet (add-mobile-layout design.md D6).
  const longPress = useLongPress(() => blockEl.current && openMenuAt(blockEl.current), {
    enabled: touch,
    haptic: false,
  });

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startAt: clip.at };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const moved = (event.clientX - current.startX) / NARRATION_PX_PER_SECOND;
    // A few pixels of finger drift are a tap, not a move.
    if (!dragging && Math.abs(event.clientX - current.startX) < 3) return;
    setDragging(true);
    onMove(Math.max(0, current.startAt + moved));
  };

  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Delete") {
      event.preventDefault();
      onRemove();
      return;
    }
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      openMenuAt(event.currentTarget);
      return;
    }
    const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (direction !== 0) {
      event.preventDefault();
      const step = event.shiftKey ? MOVE_STEP_COARSE : MOVE_STEP;
      onMove(Math.max(0, clip.at + direction * step));
    }
  };

  const onContextMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.focus();
    onSelect();
    onMenu(event.clientX, event.clientY);
  };

  return (
    <li
      className={styles.slot}
      style={{ left: `${Math.max(0, clip.at) * NARRATION_PX_PER_SECOND}px` }}
    >
      <button
        type="button"
        ref={(el) => {
          blockEl.current = el;
          tileRef?.(el);
        }}
        className={styles.block}
        style={{ width: `${width}px` }}
        aria-pressed={selected}
        aria-label={t("narrationTrack.clip", { number, name, start, duration })}
        title={`${name} (${start}, ${duration})`}
        data-dragging={dragging || undefined}
        onPointerDown={chain(onPointerDown, longPress.onPointerDown)}
        onPointerMove={chain(onPointerMove, longPress.onPointerMove)}
        onPointerUp={chain(endDrag, longPress.onPointerUp)}
        onPointerCancel={chain(endDrag, longPress.onPointerCancel)}
        onTouchMove={longPress.onTouchMove}
        onTouchEnd={longPress.onTouchEnd}
        onKeyDown={onKeyDown}
        onClick={() => {
          if (!dragging) onSelect();
        }}
        onContextMenu={onContextMenu}
      >
        {item ? (
          <Waveform peaksUrl={item.peaksUrl} start={clip.trimStart} end={end} width={width} />
        ) : null}
        <span className={styles.name}>{name}</span>
        <span className={styles.duration}>{start}</span>
      </button>
      {touch ? (
        <button
          type="button"
          className={styles.more}
          aria-label={t("narrationTrack.clipMore", { number })}
          aria-haspopup="menu"
          onClick={(event) => openMenuAt(event.currentTarget)}
        >
          ⋯
        </button>
      ) : null}
    </li>
  );
}
