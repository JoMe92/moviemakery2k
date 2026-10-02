import { type ReactNode, useId } from "react";
import { useT } from "../i18n/useT";
import styles from "./MonitorPane.module.css";
import pane from "./Pane.module.css";

export interface MonitorPaneProps {
  /** Content of the black 4:3 area (later the WebGL preview). */
  children?: ReactNode;
  /** Control bar below the picture (play, stop, time …). */
  controls?: ReactNode;
}

/** Preview monitor on the right: black 4:3 area and control bar. */
export function MonitorPane({ children, controls }: MonitorPaneProps) {
  const { t } = useT();
  const headingId = useId();
  return (
    <section className={pane.pane} aria-labelledby={headingId}>
      <div className={pane.header}>
        <h2 id={headingId} className={pane.heading}>
          {t("shell.preview")}
        </h2>
      </div>
      <div className={styles.stage}>
        <div className={styles.screen}>{children}</div>
      </div>
      {controls ? <div className={styles.controls}>{controls}</div> : null}
    </section>
  );
}
