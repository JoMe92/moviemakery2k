import type { MouseEvent, ReactNode } from "react";
import styles from "./TaskLink.module.css";

export interface TaskLinkProps {
  children: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  /**
   * Deaktiviert: bleibt sichtbar und per Tastatur erreichbar, ist über
   * aria-disabled ausgezeichnet und löst keine Aktion aus.
   */
  disabled?: boolean;
}

/** Eintrag einer Aufgabengruppe: eine echte Schaltfläche im Link-Stil. */
export function TaskLink({ children, icon, onClick, disabled = false }: TaskLinkProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onClick?.();
  };

  return (
    <li className={styles.item}>
      <button
        type="button"
        className={styles.link}
        aria-disabled={disabled || undefined}
        onClick={handleClick}
      >
        {icon ? <span className={styles.icon}>{icon}</span> : null}
        <span className={styles.text}>{children}</span>
      </button>
    </li>
  );
}
