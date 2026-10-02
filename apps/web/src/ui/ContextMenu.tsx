import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./ContextMenu.module.css";

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

export interface ContextMenuProps {
  /** Zugänglicher Name des Menüs. */
  label: string;
  /** Ankerpunkt in Viewport-Koordinaten (z. B. clientX/clientY des Rechtsklicks). */
  x: number;
  y: number;
  items: readonly ContextMenuItem[];
  /** Escape, Tab, Klick daneben oder nach Auswahl; der Aufrufer blendet das Menü aus. */
  onClose: () => void;
}

/**
 * Kleines Y2K-Kontextmenü. Fokus springt beim Öffnen auf den ersten Eintrag,
 * Pfeiltasten/Pos1/Ende bewegen ihn, Escape schließt; danach kehrt der Fokus
 * zum auslösenden Element zurück.
 */
export function ContextMenu({ label, x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [pos, setPos] = useState({ left: x, top: y });

  // Im Viewport halten.
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
    ref.current
      ?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
      ?.focus();

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
      // Fokus nur zurückgeben, wenn er noch im Menü steht (nicht, wenn z. B. ein Dialog ihn übernommen hat).
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
    const menuItems = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ??
        [],
    );
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
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={styles.item}
          aria-disabled={item.disabled || undefined}
          onClick={() => {
            if (item.disabled) return;
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
