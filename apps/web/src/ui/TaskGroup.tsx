import { type ReactNode, useId, useState } from "react";
import { ChevronIcon } from "./icons";
import styles from "./TaskGroup.module.css";

export interface TaskGroupProps {
  title: string;
  children: ReactNode;
  /** Startzustand im unkontrollierten Modus (Standard: aufgeklappt). */
  defaultExpanded?: boolean;
  /** Kontrollierter Modus: Zustand kommt von außen. */
  expanded?: boolean;
  onToggle?: (expanded: boolean) => void;
}

/** Ein- und ausklappbare Aufgabengruppe mit blauem Verlaufskopf. */
export function TaskGroup({
  title,
  children,
  defaultExpanded = true,
  expanded,
  onToggle,
}: TaskGroupProps) {
  const [internal, setInternal] = useState(defaultExpanded);
  const isExpanded = expanded ?? internal;
  const bodyId = useId();

  const toggle = () => {
    const next = !isExpanded;
    if (expanded === undefined) setInternal(next);
    onToggle?.(next);
  };

  return (
    <div className={styles.group}>
      <h2 className={styles.heading}>
        <button
          type="button"
          className={styles.header}
          aria-expanded={isExpanded}
          aria-controls={bodyId}
          onClick={toggle}
        >
          <span className={styles.title}>{title}</span>
          <span className={styles.chevron}>
            <ChevronIcon size={12} direction={isExpanded ? "up" : "down"} />
          </span>
        </button>
      </h2>
      <ul id={bodyId} className={styles.body} hidden={!isExpanded}>
        {children}
      </ul>
    </div>
  );
}
