import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { isTouchLayout, useLayoutMode } from "../shell/layoutMode";
import styles from "./ContextMenu.module.css";
import { Sheet } from "./Sheet";

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Toggle item with a check mark (`menuitemcheckbox`); undefined = plain item. */
  checked?: boolean;
}

const ITEM_SELECTOR =
  '[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemcheckbox"]:not([aria-disabled="true"])';

export interface ContextMenuProps {
  /** Accessible name of the menu. */
  label: string;
  /** Anchor point in viewport coordinates (e.g. clientX/clientY of the right-click). */
  x: number;
  y: number;
  items: readonly ContextMenuItem[];
  /** Escape, Tab, click outside or after a selection; the caller hides the menu. */
  onClose: () => void;
}

/**
 * Context menu of an element. With touch operation (coarse pointer or compact
 * layout) it appears as an action sheet with the same entries and logic
 * (add-mobile-layout design.md D6), otherwise as a small popup at the pointer.
 */
export function ContextMenu(props: ContextMenuProps) {
  const touch = isTouchLayout(useLayoutMode());
  return touch ? <ActionSheet {...props} /> : <PopupMenu {...props} />;
}

function ActionSheet({ label, items, onClose }: ContextMenuProps) {
  return (
    <Sheet open title={label} onClose={onClose}>
      <div role="menu" aria-label={label} className={styles.sheetMenu}>
        {items.map((item) => {
          const common = {
            type: "button",
            className: styles.sheetItem,
            "aria-disabled": item.disabled || undefined,
            onClick: () => {
              if (item.disabled) return;
              onClose();
              item.onSelect();
            },
          } as const;
          return item.checked === undefined ? (
            <button key={item.label} role="menuitem" {...common}>
              {item.label}
            </button>
          ) : (
            <button
              key={item.label}
              role="menuitemcheckbox"
              aria-checked={item.checked}
              {...common}
            >
              <span aria-hidden="true" className={styles.check}>
                {item.checked ? "✓" : ""}
              </span>
              {item.label}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

/**
 * Small Y2K context menu. Focus jumps to the first item on open,
 * arrow keys/Home/End move it, Escape closes; afterwards focus returns
 * to the triggering element.
 */
function PopupMenu({ label, x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [pos, setPos] = useState({ left: x, top: y });

  // Keep inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(0, Math.min(x, window.innerWidth - rect.width));
    const top = Math.max(0, Math.min(y, window.innerHeight - rect.height));
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();

    const onPointerDown = (event: PointerEvent | MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onCloseRef.current();
    };
    const onBlurWindow = () => onCloseRef.current();
    document.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("blur", onBlurWindow);
    window.addEventListener("resize", onBlurWindow);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("blur", onBlurWindow);
      window.removeEventListener("resize", onBlurWindow);
      // Return focus only if it is still in the menu (not if, e.g., a dialog has taken it).
      const active = document.activeElement;
      if (
        opener?.isConnected &&
        (!active || active === document.body || ref.current?.contains(active))
      ) {
        opener.focus();
      }
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const menuItems = Array.from(ref.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
    const index = menuItems.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => menuItems[(i + menuItems.length) % menuItems.length]?.focus();
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusAt(index < 0 ? -1 : index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(-1);
        break;
      case "Escape":
      case "Tab":
        event.preventDefault();
        event.stopPropagation();
        onClose();
        break;
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={styles.menu}
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => {
        const common = {
          type: "button",
          tabIndex: -1,
          className: styles.item,
          "aria-disabled": item.disabled || undefined,
          onClick: () => {
            if (item.disabled) return;
            onClose();
            item.onSelect();
          },
        } as const;
        return item.checked === undefined ? (
          <button key={item.label} role="menuitem" {...common}>
            {item.label}
          </button>
        ) : (
          <button key={item.label} role="menuitemcheckbox" aria-checked={item.checked} {...common}>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
