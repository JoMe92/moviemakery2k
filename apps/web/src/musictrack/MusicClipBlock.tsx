import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type KeyboardEvent, type MouseEvent, type PointerEvent, useRef } from "react";
import { formatClipDuration } from "../i18n/format";
import { useT } from "../i18n/useT";
import { isTouchLayout, useLayoutMode } from "../shell/layoutMode";
import type { AudioItem, MusicClip } from "../lib/apiClient";
import { type DragItem, musicClipSortableId } from "../storyboard/dropLogic";
import styles from "./MusicTrack.module.css";
import { chain, useLongPress } from "../ui/useLongPress";
import { Waveform } from "./Waveform";

/** Width of one second of music on the music track (blocks are proportional to their length). */
export const MUSIC_PX_PER_SECOND = 3;

export interface MusicClipBlockProps {
  clip: MusicClip;
  /** Position on the music track (1-based). */
  number: number;
  /** The audio medium; undefined if it is missing. */
  item: AudioItem | undefined;
  /** Played length in seconds (end − start). */
  length: number;
  selected: boolean;
  /** Insertion marker before or after this block (dragging audio from the collection). */
  marker?: "before" | "after" | null;
  onSelect: () => void;
  onRemove: () => void;
  onMenu: (x: number, y: number) => void;
  tileRef?: (el: HTMLButtonElement | null) => void;
}

/** Block on the music track: name, played length and waveform; sortable. */
export function MusicClipBlock({
  clip,
  number,
  item,
  length,
  selected,
  marker = null,
  onSelect,
  onRemove,
  onMenu,
  tileRef,
}: MusicClipBlockProps) {
  const { t, locale } = useT();
  const data: DragItem = { type: "music", clipId: clip.id };
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: musicClipSortableId(clip.id),
    data,
    attributes: { roleDescription: t("musicTrack.sortable") },
  });
  // aria-pressed shows the selection; the role comes from <button>.
  const { "aria-pressed": _pressed, role: _role, ...dragAttributes } = attributes;
  const name = item?.filename ?? t("musicTrack.missingAudio");
  const duration = formatClipDuration(locale, length);
  const width = Math.max(0, length) * MUSIC_PX_PER_SECOND;
  const end = item ? (clip.trimEnd === null ? item.duration : clip.trimEnd) : 0;
  const touch = isTouchLayout(useLayoutMode());
  const blockEl = useRef<HTMLButtonElement | null>(null);
  const openMenuAt = (el: HTMLElement) => {
    onSelect();
    const rect = el.getBoundingClientRect();
    onMenu(rect.left + rect.width / 2, rect.top + rect.height / 2);
  };
  // Long press opens the action sheet (add-mobile-layout design.md D6).
  const longPress = useLongPress(() => blockEl.current && openMenuAt(blockEl.current), {
    enabled: touch,
    // The touch sensor activates at the same moment and vibrates (design.md D13).
    haptic: false,
  });

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (isDragging) return;
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
    listeners?.onKeyDown?.(event);
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
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-dragging={isDragging || undefined}
    >
      {marker ? (
        <span
          className={`${styles.marker} ${marker === "after" ? styles.markerAfter : styles.markerBefore}`}
          data-testid="music-insert-marker"
          aria-hidden="true"
        />
      ) : null}
      <button
        type="button"
        ref={(el) => {
          blockEl.current = el;
          setNodeRef(el);
          tileRef?.(el);
        }}
        {...dragAttributes}
        {...listeners}
        onPointerDown={chain(
          listeners?.onPointerDown as ((event: PointerEvent<HTMLElement>) => void) | undefined,
          longPress.onPointerDown,
        )}
        onPointerMove={longPress.onPointerMove}
        onPointerUp={longPress.onPointerUp}
        onPointerCancel={longPress.onPointerCancel}
        className={styles.block}
        style={{ width: `${width}px` }}
        aria-pressed={selected}
        aria-label={t("musicTrack.clip", { number, name, duration })}
        title={`${name} (${duration})`}
        onKeyDown={onKeyDown}
        onClick={onSelect}
        onContextMenu={onContextMenu}
      >
        {item ? (
          <Waveform peaksUrl={item.peaksUrl} start={clip.trimStart} end={end} width={width} />
        ) : null}
        <span className={styles.name}>{name}</span>
        <span className={styles.duration}>{duration}</span>
      </button>
      {touch ? (
        <button
          type="button"
          className={styles.more}
          aria-label={t("actions.clipMore", { number })}
          aria-haspopup="menu"
          onClick={(event) => openMenuAt(event.currentTarget)}
        >
          ⋯
        </button>
      ) : null}
    </li>
  );
}
