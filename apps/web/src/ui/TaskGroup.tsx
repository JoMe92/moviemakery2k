import { type ReactNode, useId, useState } from "react";
import { ChevronIcon } from "./icons";
import styles from "./TaskGroup.module.css";

export interface TaskGroupProps {
  title: string;
  children: ReactNode;
  /** Initial state in uncontrolled mode (default: expanded). */
  defaultExpanded?: boolean;
  /** Controlled mode: the state comes from outside. */
  expanded?: boolean;
  onToggle?: (expanded: boolean) => void;
}

/** Collapsible task group with a blue gradient header. */
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
