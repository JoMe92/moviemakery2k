import { useDraggable } from "@dnd-kit/core";
import type { Transition } from "../lib/apiClient";
import { useAppStore } from "../store/useAppStore";
import { type DragItem, transitionDraggableId } from "../storyboard/dropLogic";
import { Tile } from "../ui/Tile";
import styles from "./TransitionCollection.module.css";
import { TransitionIcon } from "./TransitionIcon";

interface TransitionTileProps {
  transition: Transition;
  selected: boolean;
  onSelect: () => void;
  onApply: () => void;
}

/** Katalogkachel, per dnd-kit auf einen Übergangsplatz ziehbar. */
function TransitionTile({ transition, selected, onSelect, onApply }: TransitionTileProps) {
  const data: DragItem = { type: "transition", transitionId: transition.id };
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: transitionDraggableId(transition.id),
    data,
    attributes: { roleDescription: "ziehbarer Übergang" },
  });
  const { "aria-pressed": _pressed, role: _role, ...dragAttributes } = attributes;
  return (
    <Tile
      ref={setNodeRef}
      {...dragAttributes}
      {...listeners}
      caption={transition.name}
      aria-label={transition.name}
      title={transition.name}
      thumbnail={<TransitionIcon transitionId={transition.id} size={80} />}
      selected={selected}
      onClick={onSelect}
      onDoubleClick={onApply}
    />
  );
}

/**
 * Sammlung „Videoübergänge“: alle Katalogeinträge als Kacheln. Auswahl zeigt
 * den Übergang im Monitor (previewTransitionId); Ziehen auf einen
 * Übergangsplatz setzt ihn; Doppelklick setzt ihn vor das ausgewählte Bild.
 */
export function TransitionCollection() {
  const catalog = useAppStore((s) => s.catalog);
  const previewId = useAppStore((s) => s.previewTransitionId);
  const setPreview = useAppStore((s) => s.setPreviewTransition);
  const selection = useAppStore((s) => s.selection);
  const setTransition = useAppStore((s) => s.setTransition);

  if (catalog.length === 0) {
    return <p className={styles.hint}>Der Übergangskatalog ist nicht verfügbar.</p>;
  }

  return (
    <ul className={styles.grid} aria-label="Übergänge">
      {catalog.map((t) => (
        <li key={t.id}>
          <TransitionTile
            transition={t}
            selected={previewId === t.id}
            onSelect={() => setPreview(t.id)}
            onApply={() => {
              if (selection) setTransition(selection.slideId, t.id);
            }}
          />
        </li>
      ))}
    </ul>
  );
}
