import type { TransitionRef } from "../lib/apiClient";
import { useAppStore } from "../store/useAppStore";
import { TransitionsIcon } from "../ui/icons";
import styles from "./StoryboardStrip.module.css";

export interface TransitionSlotProps {
  /** Element, in das der Übergang überblendet (Besitzer von `transitionIn`). */
  slideId: string;
  /** Laufende Nummer dieses Elements (1-basiert); das erste Element hat keinen Platz. */
  number: number;
  transitionIn: TransitionRef | null;
}

/**
 * Übergangsplatz zwischen zwei Kacheln. Leer bedeutet harter Schnitt.
 * TASK-WEB-008 macht ihn zum Ablageziel und ergänzt Dialog und Kontextmenü.
 */
export function TransitionSlot({ slideId, number, transitionIn }: TransitionSlotProps) {
  const name = useAppStore((s) =>
    transitionIn
      ? (s.catalog.find((t) => t.id === transitionIn.transitionId)?.name ??
        transitionIn.transitionId)
      : null,
  );
  const label = `Übergang vor Bild ${number}`;
  return (
    // biome-ignore lint/a11y/useSemanticElements: Platzhalter-Gruppe; TASK-WEB-008 macht daraus ein bedienbares Ablageziel.
    <div
      className={styles.transition}
      role="group"
      aria-label={label}
      title={name ? `${label}: ${name}` : `${label}: keiner (harter Schnitt)`}
      data-testid={`transition-slot-${slideId}`}
      data-filled={name ? "true" : "false"}
    >
      {name ? (
        <>
          <TransitionsIcon />
          <span className={styles.transitionName}>{name}</span>
        </>
      ) : (
        <span aria-hidden="true">–</span>
      )}
    </div>
  );
}
