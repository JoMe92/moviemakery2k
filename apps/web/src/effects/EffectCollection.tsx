import { useDraggable } from "@dnd-kit/core";
import { useT } from "../i18n/useT";
import type { Effect } from "../lib/apiClient";
import { useAppStore } from "../store/useAppStore";
import { type DragItem, effectDraggableId } from "../storyboard/dropLogic";
import { EffectsIcon } from "../ui/icons";
import { Tile } from "../ui/Tile";
import styles from "./EffectCollection.module.css";
import { entryName } from "./effectName";

interface EffectTileProps {
  effect: Effect;
  selected: boolean;
  onDemo: () => void;
}

/** Catalog tile, draggable onto the effect slot of a tile via dnd-kit. */
function EffectTile({ effect, selected, onDemo }: EffectTileProps) {
  const { t, locale } = useT();
  const name = entryName(effect, locale);
  const data: DragItem = { type: "effect", effectId: effect.id };
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: effectDraggableId(effect.id),
    data,
    attributes: { roleDescription: t("effects.draggable") },
  });
  const { "aria-pressed": _pressed, role: _role, ...dragAttributes } = attributes;
  return (
    <Tile
      ref={setNodeRef}
      {...dragAttributes}
      {...listeners}
      caption={name}
      aria-label={name}
      title={name}
      thumbnail={
        <span className={styles.thumb}>
          <EffectsIcon size={28} />
        </span>
      }
      selected={selected}
      onDoubleClick={onDemo}
    />
  );
}

/**
 * "Video Effects" collection (add-effects-catalog design.md D4): all catalog
 * entries as tiles. A double-click demonstrates the effect on the self-made
 * sample image in the monitor; dragging a tile onto an element's effect slot
 * sets it.
 */
export function EffectCollection() {
  const { t } = useT();
  const effects = useAppStore((s) => s.effects);
  const previewId = useAppStore((s) => s.previewEffectId);
  const setPreview = useAppStore((s) => s.setPreviewEffect);

  if (effects.length === 0) {
    return <p className={styles.hint}>{t("effects.unavailable")}</p>;
  }

  return (
    <ul className={styles.grid} aria-label={t("effects.list")}>
      {effects.map((entry) => (
        <li key={entry.id}>
          <EffectTile
            effect={entry}
            selected={previewId === entry.id}
            onDemo={() => setPreview(entry.id)}
          />
        </li>
      ))}
    </ul>
  );
}
