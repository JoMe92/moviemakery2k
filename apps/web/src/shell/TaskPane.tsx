import { useId } from "react";
import { useT } from "../i18n/useT";
import { TaskGroup } from "../ui/TaskGroup";
import { TaskLink } from "../ui/TaskLink";
import styles from "./TaskPane.module.css";
import type { TaskGroupData } from "./tasks";

export interface TaskPaneProps {
  groups: TaskGroupData[];
}

/** Task pane on the left ("Movie Tasks") with blue-backed groups. */
export function TaskPane({ groups }: TaskPaneProps) {
  const { t } = useT();
  const headingId = useId();
  return (
    <aside className={styles.pane} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        {t("shell.taskPane")}
      </h2>
      <div className={styles.groups}>
        {groups.map((group) => (
          <TaskGroup key={group.id} title={group.title}>
            {group.entries.map(({ id, label, icon: Icon, disabled, run }) => (
              <TaskLink key={id} icon={<Icon />} disabled={disabled} onClick={run}>
                {label}
              </TaskLink>
            ))}
          </TaskGroup>
        ))}
      </div>
    </aside>
  );
}
