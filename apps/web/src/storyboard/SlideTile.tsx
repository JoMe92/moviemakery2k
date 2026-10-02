import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { KeyboardEvent, MouseEvent } from "react";
import type { MediaItem, Slide } from "../lib/apiClient";
import { EffectsIcon } from "../ui/icons";
import { type DragItem, formatDuration } from "./dropLogic";
import styles from "./StoryboardStrip.module.css";
import { TransitionSlot } from "./TransitionSlot";

export interface SlideTileProps {
  slide: Slide;
  /** Laufende Nummer (1-basiert). */
  number: number;
  media: MediaItem | undefined;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onMenu: (x: number, y: number) => void;
  /** Eigenschaftendialog (Bilddauer). */
  onProperties: () => void;
  /** Aktionen am eingehenden Übergangsplatz. */
  onTransitionProperties: () => void;
  onTransitionRemove: () => void;
  onTransitionMenu: (x: number, y: number) => void;
  tileRef?: (el: HTMLButtonElement | null) => void;
  /** Einfügemarke vor bzw. hinter dieser Kachel (Ziehen aus der Sammlung). */
  marker?: "before" | "after" | null;
}

/** Storyboard-Kachel: Thumbnail, Nummer, Dauer und (deaktivierter) Effekt-Platz; sortierbar. */
export function SlideTile({
  slide,
  number,
  media,
  selected,
  onSelect,
  onRemove,
  onMenu,
  onProperties,
  onTransitionProperties,
  onTransitionRemove,
  onTransitionMenu,
  tileRef,
  marker = null,
}: SlideTileProps) {
  const data: DragItem = { type: "slide", slideId: slide.id };
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
    data,
    attributes: { roleDescription: "verschiebbare Kachel" },
  });
  // aria-pressed zeigt die Auswahl; die Rolle ergibt sich aus <button>.
  const { "aria-pressed": _pressed, role: _role, ...dragAttributes } = attributes;
  const name = media?.filename ?? "fehlendes Bild";
  const duration = formatDuration(slide.duration);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (isDragging) return;
    if (event.key === "Delete") {
      event.preventDefault();
      onRemove();
      return;
    }
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      onSelect();
      const rect = event.currentTarget.getBoundingClientRect();
      onMenu(rect.left + rect.width / 2, rect.top + rect.height / 2);
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
          setNodeRef(el);
          tileRef?.(el);
        }}
        {...dragAttributes}
        {...listeners}
        className={styles.tile}
        aria-pressed={selected}
        aria-label={`Bild ${number}: ${name}, ${duration}`}
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
          {media ? <img src={media.thumbnailUrl} alt="" loading="lazy" draggable={false} /> : null}
          <span className={styles.number}>{number}</span>
        </span>
        <span className={styles.duration}>{duration}</span>
      </button>
      <button
        type="button"
        className={styles.effect}
        aria-disabled="true"
        aria-label={`Effekt-Platz für Bild ${number}`}
        title="Videoeffekte folgen später"
        tabIndex={-1}
      >
        <EffectsIcon size={12} />
      </button>
    </li>
  );
}
