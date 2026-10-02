import type { ReactNode } from "react";
import styles from "./CollectionPane.module.css";
import pane from "./Pane.module.css";

export interface CollectionPaneProps {
  /** Name der angezeigten Sammlung, z. B. „Meine Bilder“. */
  name: string;
  children: ReactNode;
}

/** Sammlungsbereich in der Mitte; zeigt Medien oder den Übergangskatalog. */
export function CollectionPane({ name, children }: CollectionPaneProps) {
  return (
    <section className={pane.pane} aria-label={`Sammlung: ${name}`}>
      <div className={pane.header}>
        <h2 className={pane.heading}>
          <span className={styles.prefix}>Sammlung: </span>
          {name}
        </h2>
      </div>
      <div className={`${pane.body} ${styles.body}`}>{children}</div>
    </section>
  );
}
