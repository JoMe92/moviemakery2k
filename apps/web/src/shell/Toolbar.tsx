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
  /** Controlled value: ID of the collection currently shown. */
  collection: string;
  onCollectionChange: (id: string) => void;
  /** Additional toolbar buttons to the left of the collection picker. */
  children?: ReactNode;
}

/** Toolbar with the collection picker. */
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
