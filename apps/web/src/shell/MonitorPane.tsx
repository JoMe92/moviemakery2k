import { type ReactNode, useId } from "react";
import { useT } from "../i18n/useT";
import styles from "./MonitorPane.module.css";
import pane from "./Pane.module.css";

export interface MonitorPaneProps {
  /** Inhalt der schwarzen 4:3-Fläche (später die WebGL-Vorschau). */
  children?: ReactNode;
  /** Steuerleiste unter dem Bild (Wiedergabe, Stopp, Zeit …). */
  controls?: ReactNode;
}

/** Vorschaumonitor rechts: schwarze 4:3-Fläche und Steuerleiste. */
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
