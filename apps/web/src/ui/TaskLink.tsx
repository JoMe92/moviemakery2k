import type { MouseEvent, ReactNode } from "react";
import styles from "./TaskLink.module.css";

export interface TaskLinkProps {
  children: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  /**
   * Disabled: stays visible and keyboard-reachable, is marked via
   * aria-disabled and triggers no action.
   */
  disabled?: boolean;
}

/** Item of a task group: a real button styled as a link. */
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
