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
  /** Element, in das der Übergang überblendet (Besitzer von `transitionIn`). */
  slideId: string;
  /** Laufende Nummer dieses Elements (1-basiert); das erste Element hat keinen Platz. */
  number: number;
  transitionIn: TransitionRef | null;
  /** Eigenschaften öffnen (Doppelklick, Eingabe); nur bei gesetztem Übergang. */
  onProperties: () => void;
  onRemove: () => void;
  onMenu: (x: number, y: number) => void;
}

/**
 * Übergangsplatz zwischen zwei Kacheln: Ablageziel für Übergänge aus dem
 * Katalog. Leer bedeutet harter Schnitt.
 */
export function TransitionSlot({
  slideId,
  number,
  transitionIn,
  onProperties,
  onRemove,
  onMenu,
}: TransitionSlotProps) {
  const { t, locale } = useT();
  const data: DropTarget = { type: "transitionSlot", slideId };
  // Nur für Übergänge ein Ziel; sonst würde die Tastatursteuerung beim
  // Umsortieren von Kacheln auf den Plätzen stehen bleiben.
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
