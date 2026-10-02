import { type KeyboardEvent, useRef, useState } from "react";
import styles from "./MenuBar.module.css";

export interface MenuBarItem {
  id: string;
  label: string;
}

export const DEFAULT_MENUS: readonly MenuBarItem[] = [
  { id: "file", label: "Datei" },
  { id: "edit", label: "Bearbeiten" },
  { id: "view", label: "Ansicht" },
  { id: "tools", label: "Extras" },
  { id: "clip", label: "Clip" },
  { id: "play", label: "Wiedergabe" },
  { id: "help", label: "Hilfe" },
];

export interface MenuBarProps {
  items?: readonly MenuBarItem[];
  /** Wird beim Aktivieren eines Hauptmenüs aufgerufen (Untermenüs folgen später). */
  onOpenMenu?: (id: string) => void;
}

/**
 * Menüleiste mit Hauptmenüs. Ein einziger Tab-Stopp; Pfeil links/rechts,
 * Pos1/Ende wechseln zwischen den Einträgen (Roving Tabindex).
 */
export function MenuBar({ items = DEFAULT_MENUS, onOpenMenu }: MenuBarProps) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (index: number) => {
    const next = (index + items.length) % items.length;
    setActive(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => move(active + 1),
      ArrowLeft: () => move(active - 1),
      Home: () => move(0),
      End: () => move(items.length - 1),
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  return (
    <div className={styles.menubar} role="menubar" aria-label="Menüleiste" onKeyDown={onKeyDown}>
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={false}
          tabIndex={index === active ? 0 : -1}
          className={styles.item}
          onFocus={() => setActive(index)}
          onClick={() => onOpenMenu?.(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
