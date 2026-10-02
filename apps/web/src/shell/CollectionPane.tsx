import type { HTMLAttributes, ReactNode } from "react";
import { useT } from "../i18n/useT";
import styles from "./CollectionPane.module.css";
import pane from "./Pane.module.css";

export interface CollectionPaneProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Name of the collection shown, e.g. "My Pictures". */
  name: string;
  children: ReactNode;
  /** Fixed bar below the scrollable content (e.g. import progress). */
  footer?: ReactNode;
}

/** Collection pane in the middle; shows media or the transition catalog. */
export function CollectionPane({
  name,
  children,
  footer,
  className,
  ...rest
}: CollectionPaneProps) {
  const { t } = useT();
  return (
    <section
      className={[pane.pane, className].filter(Boolean).join(" ")}
      aria-label={t("shell.collection", { name })}
      {...rest}
    >
      <div className={pane.header}>
        <h2 className={pane.heading}>
          <span className={styles.prefix}>{t("shell.collectionPrefix")} </span>
          {name}
        </h2>
      </div>
      <div className={`${pane.body} ${styles.body}`}>{children}</div>
      {footer}
    </section>
  );
}
