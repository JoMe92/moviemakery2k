import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import styles from "./MenuBar.module.css";
import type { MenuDef, MenuEntry } from "./menus";

export interface MenuBarProps {
  menus: readonly MenuDef[];
}

type Item = Extract<MenuEntry, { kind: "item" }>;

/**
 * Menüleiste mit aufklappbaren Menüs (WAI-ARIA Menubar-Muster).
 * Ein Tab-Stopp; ←/→, Pos1/Ende wechseln Hauptmenüs, ↓/Enter/Leertaste öffnet,
 * im Menü ↑/↓ wählen, Enter aktiviert, Escape schließt. Deaktivierte Einträge
 * sind fokussierbar, lösen aber nichts aus.
 */
export function MenuBar({ menus }: MenuBarProps) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const topRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const items = (index: number | null): Item[] =>
    index === null ? [] : (menus[index]?.entries.filter((e): e is Item => e.kind === "item") ?? []);

  const focusTop = (index: number) => {
    const next = (index + menus.length) % menus.length;
    setActive(next);
    topRefs.current[next]?.focus();
    return next;
  };

  const openMenu = (index: number, focusFirst: boolean) => {
    setActive(index);
    setOpen(index);
    if (focusFirst) requestAnimationFrame(() => itemRefs.current[0]?.focus());
  };

  const close = (refocus = true) => {
    const was = open;
    setOpen(null);
    if (refocus && was !== null) topRefs.current[was]?.focus();
  };

  // Klick außerhalb schließt das Menü.
  useEffect(() => {
    if (open === null) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const activate = (entry: Item) => {
    if (!entry.onSelect) return;
    close();
    entry.onSelect();
  };

  const onTopKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => {
        const next = focusTop(index + 1);
        if (open !== null) openMenu(next, false);
      },
      ArrowLeft: () => {
        const next = focusTop(index - 1);
        if (open !== null) openMenu(next, false);
      },
      Home: () => focusTop(0),
      End: () => focusTop(menus.length - 1),
      ArrowDown: () => openMenu(index, true),
      Enter: () => openMenu(index, true),
      " ": () => openMenu(index, true),
      Escape: () => close(),
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  const onItemKeyDown = (event: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const list = items(open);
    const focusItem = (n: number) => itemRefs.current[(n + list.length) % list.length]?.focus();
    const keys: Record<string, () => void> = {
      ArrowDown: () => focusItem(i + 1),
      ArrowUp: () => focusItem(i - 1),
      Home: () => focusItem(0),
      End: () => focusItem(list.length - 1),
      Escape: () => close(),
      Tab: () => close(false),
      ArrowRight: () => openMenu(focusTop((open ?? 0) + 1), true),
      ArrowLeft: () => openMenu(focusTop((open ?? 0) - 1), true),
    };
    const action = keys[event.key];
    if (action) {
      if (event.key !== "Tab") event.preventDefault();
      action();
    }
  };

  let itemIndex = -1;
  return (
    <div className={styles.menubar} role="menubar" aria-label="Menüleiste" ref={rootRef}>
      {menus.map((menu, index) => (
        <div key={menu.id} className={styles.menu}>
          <button
            ref={(el) => {
              topRefs.current[index] = el;
            }}
            id={`menu-${menu.id}`}
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === index}
            tabIndex={index === active ? 0 : -1}
            className={styles.item}
            onFocus={() => setActive(index)}
            onClick={() => (open === index ? close() : openMenu(index, false))}
            onMouseEnter={() => {
              if (open !== null && open !== index) openMenu(index, false);
            }}
            onKeyDown={(e) => onTopKeyDown(e, index)}
          >
            {menu.label}
          </button>
          {open === index && (
            <div className={styles.dropdown} role="menu" aria-labelledby={`menu-${menu.id}`}>
              {(() => {
                itemRefs.current = [];
                itemIndex = -1;
                return null;
              })()}
              {menu.entries.map((entry, n) => {
                if (entry.kind === "separator") {
                  // biome-ignore lint/suspicious/noArrayIndexKey: Trenner haben keine ID
                  return <hr key={`sep-${n}`} className={styles.separator} />;
                }
                itemIndex += 1;
                const i = itemIndex;
                const disabled = !entry.onSelect;
                return (
                  <button
                    key={entry.id}
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    aria-disabled={disabled || undefined}
                    className={styles.entry}
                    onClick={() => activate(entry)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        activate(entry);
                        return;
                      }
                      onItemKeyDown(e, i);
                    }}
                  >
                    <span>{entry.label}</span>
                    {entry.shortcut && <span className={styles.shortcut}>{entry.shortcut}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
