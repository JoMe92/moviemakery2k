import { type ReactNode, useId } from "react";
import { useT } from "../i18n/useT";
import { Button } from "../ui/Button";
import { TimelineIcon } from "../ui/icons";
import pane from "./Pane.module.css";
import styles from "./StoryboardPane.module.css";

export interface StoryboardPaneProps {
  /** Elemente des Bildstreifens; leer → Hinweistext. */
  children?: ReactNode;
}

/** Storyboard über die volle Breite. Die Zeitachse ist im MVP deaktiviert. */
export function StoryboardPane({ children }: StoryboardPaneProps) {
  const { t } = useT();
  const headingId = useId();
  const isEmpty = children === undefined || children === null || children === false;
  return (
    <section className={`${pane.pane} ${styles.storyboard}`} aria-labelledby={headingId}>
      <div className={pane.header}>
        <Button
          variant="toolbar"
          icon={<TimelineIcon />}
          aria-pressed={false}
          disabled
          className={styles.toggle}
        >
          {t("shell.showTimeline")}
        </Button>
        <h2 id={headingId} className={pane.heading}>
          {t("shell.storyboard")}
        </h2>
      </div>
      <div className={`${pane.body} ${styles.body}`}>
        {isEmpty ? <p className={styles.hint}>{t("shell.storyboardHint")}</p> : children}
      </div>
    </section>
  );
}
