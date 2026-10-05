import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type KeyboardEvent, type MouseEvent, type PointerEvent, useRef } from "react";
import { useT } from "../i18n/useT";
import type { MediaItem, Slide } from "../lib/apiClient";
import { isTouchLayout, useLayoutMode } from "../shell/layoutMode";
import { slideDuration, slideEffectId } from "../store/projectOps";
import { titleLabel, titleLines } from "../titles/titleRender";
import { chain, useLongPress } from "../ui/useLongPress";
import { type DragItem, formatDuration } from "./dropLogic";
import { EffectSlot } from "./EffectSlot";
import styles from "./StoryboardStrip.module.css";
import { TransitionSlot } from "./TransitionSlot";

export interface SlideTileProps {
  slide: Slide;
  /** Sequence number (1-based). */
  number: number;
  media: MediaItem | undefined;
  selected: boolean;
  /** Currently visible during playback (highlight). */
  playing?: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onMenu: (x: number, y: number) => void;
  /** Properties dialog (picture duration). */
  onProperties: () => void;
  /** Actions on the incoming transition slot. */
  onTransitionProperties: () => void;
  onTransitionRemove: () => void;
  onTransitionMenu: (x: number, y: number) => void;
  /** Tap on the transition slot with touch operation. */
  onTransitionActivate?: () => void;
  /** "Keinen Effekt" on the effect slot (add-effects-catalog D4). */
  onEffectRemove: () => void;
  onEffectMenu: (x: number, y: number) => void;
  tileRef?: (el: HTMLButtonElement | null) => void;
  /** Insertion marker before or after this tile (dragging from the collection). */
  marker?: "before" | "after" | null;
}

/** Storyboard tile: thumbnail, number, duration and effect slot; sortable. */
export function SlideTile({
  slide,
  number,
  media,
  selected,
  playing = false,
  onSelect,
  onRemove,
  onMenu,
  onProperties,
  onTransitionProperties,
  onTransitionRemove,
  onTransitionMenu,
  onTransitionActivate,
  onEffectRemove,
  onEffectMenu,
  tileRef,
  marker = null,
}: SlideTileProps) {
  const { t, locale } = useT();
  const data: DragItem = { type: "slide", slideId: slide.id };
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
    data,
    attributes: { roleDescription: t("storyboard.sortable") },
  });
  // aria-pressed shows the selection; the role comes from <button>.
  const { "aria-pressed": _pressed, role: _role, ...dragAttributes } = attributes;
  // A title element refers to no medium, so its first line names it instead
  // of a file name (add-titles-and-credits design.md D5).
  const name =
    slide.kind === "title"
      ? titleLabel(slide, t("titles.noText"))
      : (media?.filename ?? t("storyboard.missingImage"));
  const duration = formatDuration(slideDuration(slide), locale);
  const touch = isTouchLayout(useLayoutMode());
  const openMenuAt = (el: HTMLElement) => {
    onSelect();
    const rect = el.getBoundingClientRect();
    onMenu(rect.left + rect.width / 2, rect.top + rect.height / 2);
  };
  const tileEl = useRef<HTMLButtonElement | null>(null);
  // Long press opens the action sheet (add-mobile-layout design.md D6).
  const longPress = useLongPress(() => tileEl.current && openMenuAt(tileEl.current), {
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
      {number > 1 ? (
        <TransitionSlot
          slideId={slide.id}
          number={number}
          transitionIn={slide.transitionIn}
          onProperties={onTransitionProperties}
          onRemove={onTransitionRemove}
          onMenu={onTransitionMenu}
          onActivate={onTransitionActivate}
        />
      ) : null}
      {marker ? (
        <span
          className={`${styles.marker} ${
            marker === "after"
              ? styles.markerAfter
              : number > 1
                ? styles.markerGap
                : styles.markerFirst
          }`}
          data-testid="insert-marker"
          aria-hidden="true"
        />
      ) : null}
      <button
        type="button"
        ref={(el) => {
          tileEl.current = el;
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
        onTouchMove={longPress.onTouchMove}
        onTouchEnd={longPress.onTouchEnd}
        className={styles.tile}
        aria-pressed={selected}
        aria-current={playing ? "true" : undefined}
        data-playing={playing || undefined}
        aria-label={
          // A title element is not a picture: it names itself by its text.
          slide.kind === "title"
            ? t("titles.tile", { number, text: name, duration })
            : t("storyboard.slide", { number, name, duration })
        }
        title={name}
        onKeyDown={onKeyDown}
        onClick={onSelect}
        onDoubleClick={() => {
          onSelect();
          onProperties();
        }}
        onContextMenu={onContextMenu}
      >
        <span className={styles.thumb}>
          {media?.kind === "image" ? (
            <img
              src={media.thumbnailUrl}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          ) : media?.kind === "video" ? (
            <img src={media.posterUrl} alt="" loading="lazy" decoding="async" draggable={false} />
          ) : slide.kind === "title" ? (
            <span className={styles.titleThumb} style={{ color: slide.color }}>
              {titleLines(slide)
                .filter((line) => line.trim().length > 0)
                .slice(0, 2)
                .map((line) => (
                  <span key={line}>{line}</span>
                ))}
            </span>
          ) : null}
          <span className={styles.number}>{number}</span>
        </span>
        <span className={styles.duration}>{duration}</span>
      </button>
      {touch ? (
        <button
          type="button"
          className={styles.more}
          aria-label={t("actions.slideMore", { number })}
          aria-haspopup="menu"
          onClick={(event) => openMenuAt(event.currentTarget)}
        >
          ⋯
        </button>
      ) : (
        <EffectSlot
          slideId={slide.id}
          number={number}
          effectId={slideEffectId(slide)}
          onRemove={onEffectRemove}
          onMenu={onEffectMenu}
        />
      )}
    </li>
  );
}
