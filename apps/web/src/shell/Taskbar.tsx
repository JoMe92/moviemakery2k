import { useState } from "react";
import { useT } from "../i18n/useT";
import { useAppStore } from "../store/useAppStore";
import { Sheet } from "../ui/Sheet";
import { TaskLink } from "../ui/TaskLink";
import styles from "./Taskbar.module.css";
import { type TaskGroupId, useTaskGroups } from "./tasks";

/**
 * Taskbar with the three Movie Maker steps (add-mobile-layout design.md D4).
 * Each button opens a sheet with exactly the entries of the task group of the
 * same name, with the same activation as the desktop task pane.
 */
export function Taskbar() {
  const { t } = useT();
  const groups = useTaskGroups();
  const hasSlides = useAppStore((s) => s.slides.length > 0);
  const [open, setOpen] = useState<TaskGroupId | null>(null);
  const [chosen, setChosen] = useState<TaskGroupId | null>(null);
  // The step last chosen; before that: capture while the storyboard is empty, else edit.
  const active = open ?? chosen ?? (hasSlides ? "edit" : "capture");
  const group = groups.find((g) => g.id === open);

  return (
    <nav className={styles.taskbar} aria-label={t("shell.taskbar")}>
      <ul className={styles.steps}>
        {groups.map((g) => (
          <li key={g.id} className={styles.step}>
            <button
              type="button"
              className={styles.button}
              aria-current={active === g.id ? "step" : undefined}
              aria-haspopup="dialog"
              onClick={() => {
                setChosen(g.id);
                setOpen(g.id);
              }}
            >
              {g.short}
            </button>
          </li>
        ))}
      </ul>
      <Sheet open={group !== undefined} title={group?.title ?? ""} onClose={() => setOpen(null)}>
        <ul className={styles.entries}>
          {group?.entries.map(({ id, label, icon: Icon, disabled, run }) => (
            <TaskLink
              key={id}
              icon={<Icon size={20} />}
              disabled={disabled}
              onClick={() => {
                setOpen(null);
                run?.();
              }}
            >
              {label}
            </TaskLink>
          ))}
        </ul>
      </Sheet>
    </nav>
  );
}
