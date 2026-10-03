import { useId, useState } from "react";
import { useT } from "../i18n/useT";
import { ChevronIcon } from "../ui/icons";
import { Sheet } from "../ui/Sheet";
import styles from "./MenuSheet.module.css";
import type { MenuDef, MenuEntry } from "./menus";

type Item = Extract<MenuEntry, { kind: "item" }>;

/**
 * Menu in the compact layout (add-mobile-layout design.md D11): "☰" opens the
 * sheet "Menu" in the style of a start menu with every menu of the menu bar as
 * an expandable group, with the same entries and the same activation as
 * menus.ts. Disabled entries stay visible; shortcut hints are left out.
 */
export function MenuSheet({ menus }: { menus: readonly MenuDef[] }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const baseId = useId();

  const activate = (entry: Item) => {
    if (!entry.onSelect) return;
    setOpen(false);
    entry.onSelect();
  };

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label={t("menu.sheet")}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">☰</span>
      </button>
      <Sheet open={open} title={t("menu.sheet")} onClose={() => setOpen(false)}>
        <ul className={styles.groups}>
          {menus.map((menu) => {
            const isOpen = expanded === menu.id;
            const listId = `${baseId}-${menu.id}`;
            return (
              <li key={menu.id} className={styles.group}>
                <button
                  type="button"
                  className={styles.groupHeader}
                  aria-expanded={isOpen}
                  aria-controls={listId}
                  onClick={() => setExpanded(isOpen ? null : menu.id)}
                >
                  <span className={styles.groupLabel}>{menu.label}</span>
                  <ChevronIcon size={12} direction={isOpen ? "up" : "down"} />
                </button>
                <ul id={listId} className={styles.entries} hidden={!isOpen}>
                  {menu.entries.map((entry, index) =>
                    entry.kind === "separator" ? (
                      // biome-ignore lint/suspicious/noArrayIndexKey: separators have no id
                      <li key={`sep-${index}`} className={styles.separator} aria-hidden="true" />
                    ) : (
                      <li key={entry.id}>
                        <button
                          type="button"
                          className={styles.entry}
                          aria-disabled={entry.onSelect ? undefined : true}
                          onClick={() => activate(entry)}
                        >
                          {entry.label}
                        </button>
                      </li>
                    ),
                  )}
                </ul>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}
