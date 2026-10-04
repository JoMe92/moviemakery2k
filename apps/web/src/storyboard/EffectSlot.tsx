import { useDndContext, useDroppable } from "@dnd-kit/core";
import type { KeyboardEvent, MouseEvent } from "react";
import { effectName } from "../effects/effectName";
import { useT } from "../i18n/useT";
import { useAppStore } from "../store/useAppStore";
import { EffectsIcon } from "../ui/icons";
import { type DragItem, type DropTarget, effectSlotId } from "./dropLogic";
import styles from "./StoryboardStrip.module.css";

export interface EffectSlotProps {
  slideId: string;
  /** Sequence number of the element (1-based), for the label. */
  number: number;
  /** Catalog ID of the set effect, or null for "no effect". */
  effectId: string | null;
  /** Remove the effect ("Keinen Effekt"); only when one is set. */
  onRemove: () => void;
  onMenu: (x: number, y: number) => void;
}

/**
 * Effect slot on a storyboard tile (add-effects-catalog design.md D4): drop
 * target for effects from the "Video Effects" collection, shows a small icon
 * while an effect is set, and offers "Keinen Effekt" via context menu or Delete.
 */
export function EffectSlot({ slideId, number, effectId, onRemove, onMenu }: EffectSlotProps) {
  const { t } = useT();
  const data: DropTarget = { type: "effectSlot", slideId };
  // A target only for effects, so dragging tiles never stops on the slots.
  const { active } = useDndContext();
  const accepts = (active?.data.current as DragItem | undefined)?.type === "effect";
  const { setNodeRef, isOver } = useDroppable({
    id: effectSlotId(slideId),
    data,
    disabled: !accepts,
  });
  const dropping = isOver && accepts;
  const name = useAppStore((s) => (effectId ? effectName(s.effects, effectId, s.locale) : null));
  const label = t("storyboard.effectSlot", { number });
  const description = name ?? t("storyboard.noEffect");

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Delete" && effectId) {
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
      className={styles.effect}
      aria-label={`${label}: ${description}`}
      title={`${label}: ${description}`}
      data-testid={`effect-slot-${slideId}`}
      data-filled={effectId ? "true" : "false"}
      data-drop={dropping || undefined}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
    >
      <EffectsIcon size={12} />
    </button>
  );
}
