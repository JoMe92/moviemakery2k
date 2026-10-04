import { useDndContext, useDroppable } from "@dnd-kit/core";
import type { KeyboardEvent, MouseEvent } from "react";
import { useT } from "../i18n/useT";
import type { TransitionRef } from "../lib/apiClient";
import { useAppStore } from "../store/useAppStore";
import { TransitionIcon } from "../transitions/TransitionIcon";
import { catalogName } from "../transitions/transitionName";
import { type DragItem, type DropTarget, formatDuration, transitionSlotId } from "./dropLogic";
import styles from "./StoryboardStrip.module.css";

export interface TransitionSlotProps {
  /** Item the transition leads into (owner of `transitionIn`). */
  slideId: string;
  /** Sequence number of this item (1-based); the first item has no slot. */
  number: number;
  transitionIn: TransitionRef | null;
  /** Open properties (double-click, Enter); only when a transition is set. */
  onProperties: () => void;
  onRemove: () => void;
  onMenu: (x: number, y: number) => void;
  /** Tap with touch operation: opens the transition sheet (add-mobile-layout D9). */
  onActivate?: () => void;
}

/**
 * Transition slot between two tiles: drop target for transitions from the
 * catalog. Empty means a hard cut.
 */
export function TransitionSlot({
  slideId,
  number,
  transitionIn,
  onProperties,
  onRemove,
  onMenu,
  onActivate,
}: TransitionSlotProps) {
  const { t, locale } = useT();
  const data: DropTarget = { type: "transitionSlot", slideId };
  // A target only for transitions; otherwise keyboard control would stop on
  // the slots while reordering tiles.
  const { active } = useDndContext();
  const accepts = (active?.data.current as DragItem | undefined)?.type === "transition";
  const { setNodeRef, isOver } = useDroppable({
    id: transitionSlotId(slideId),
    data,
    disabled: !accepts,
  });
  const dropping = isOver && accepts;
  const name = useAppStore((s) =>
    transitionIn ? catalogName(s.catalog, transitionIn.transitionId, s.locale) : null,
  );
  const label = t("storyboard.transitionBefore", { number });
  const description =
    transitionIn && name
      ? `${name}, ${formatDuration(transitionIn.duration, locale)}`
      : t("storyboard.noTransition");

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (onActivate && (event.key === "Enter" || event.key === " ")) {
      // The click handler opens the sheet (touch operation).
      return;
    }
    if (event.key === "Enter" && transitionIn) {
      event.preventDefault();
      onProperties();
    } else if (event.key === "Delete" && transitionIn) {
      event.preventDefault();
      onRemove();
    } else if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      onMenu(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
  };

  const onContextMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.focus();
    onMenu(event.clientX, event.clientY);
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={styles.transition}
      aria-label={`${label}: ${description}`}
      title={`${label}: ${description}`}
      data-testid={`transition-slot-${slideId}`}
      data-filled={transitionIn ? "true" : "false"}
      data-drop={dropping || undefined}
      onClick={onActivate}
      onDoubleClick={() => {
        if (transitionIn) onProperties();
      }}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
    >
      {transitionIn ? (
        <>
          <TransitionIcon transitionId={transitionIn.transitionId} size={24} />
          <span className={styles.transitionName}>{name}</span>
          <span className={styles.transitionDuration}>
            {formatDuration(transitionIn.duration, locale)}
          </span>
        </>
      ) : (
        <span aria-hidden="true">–</span>
      )}
    </button>
  );
}
