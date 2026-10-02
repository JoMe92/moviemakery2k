import { type ReactNode, useId } from "react";
import { useT } from "../i18n/useT";
import { FolderIcon } from "../ui/icons";
import styles from "./Toolbar.module.css";

export interface CollectionOption {
  id: string;
  label: string;
}

export interface ToolbarProps {
  collections: readonly CollectionOption[];
  /** Kontrollierter Wert: ID der aktuell angezeigten Sammlung. */
  collection: string;
  onCollectionChange: (id: string) => void;
  /** Zusätzliche Symbolleisten-Schaltflächen links der Sammlungsauswahl. */
  children?: ReactNode;
}

/** Symbolleiste mit Sammlungsauswahl. */
export function Toolbar({ collections, collection, onCollectionChange, children }: ToolbarProps) {
  const { t } = useT();
  const selectId = useId();
  return (
    <div className={styles.toolbar} role="toolbar" aria-label={t("shell.toolbar")}>
      {children ? <div className={styles.buttons}>{children}</div> : null}
      <label htmlFor={selectId} className={styles.label}>
        <FolderIcon size={16} />
        {t("shell.collections")}
      </label>
      <select
        id={selectId}
        className={styles.select}
        value={collection}
        onChange={(event) => onCollectionChange(event.target.value)}
      >
        {collections.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
