import { type ReactNode, useId } from "react";
import { useT } from "../i18n/useT";
import { Button } from "../ui/Button";
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
  /** Collection pane visible; the toggle is marked pressed while it is. */
  collectionVisible: boolean;
  onToggleCollection: () => void;
  /** Additional toolbar buttons to the left of the collection picker. */
  children?: ReactNode;
}

/**
 * Toolbar with the "Collections" toggle and the collection picker. The
 * toggle's name stays the same in both states; its state is `aria-pressed`
 * (pressed while the pane is visible, design.md D1).
 */
export function Toolbar({
  collections,
  collection,
  onCollectionChange,
  collectionVisible,
  onToggleCollection,
  children,
}: ToolbarProps) {
  const { t } = useT();
  const selectId = useId();
  return (
    <div className={styles.toolbar} role="toolbar" aria-label={t("shell.toolbar")}>
      <div className={styles.buttons}>
        <Button
          variant="toolbar"
          icon={<FolderIcon size={16} />}
          aria-pressed={collectionVisible}
          onClick={onToggleCollection}
        >
          {t("shell.toggleCollections")}
        </Button>
        {children}
      </div>
      <label htmlFor={selectId} className={styles.label}>
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
