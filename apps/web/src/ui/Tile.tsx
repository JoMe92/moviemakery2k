import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import styles from "./Tile.module.css";

export interface TileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  caption: string;
  /** Vorschaubild-URL; alternativ eigener Inhalt über `thumbnail`. */
  src?: string;
  thumbnail?: ReactNode;
  selected?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/** Kachel mit Vorschaubild und Beschriftung; auswählbar und fokussierbar. */
export function Tile({
  caption,
  src,
  thumbnail,
  selected = false,
  className,
  type = "button",
  ...rest
}: TileProps) {
  return (
    <button
      type={type}
      className={[styles.tile, className].filter(Boolean).join(" ")}
      aria-pressed={selected}
      {...rest}
    >
      <span className={styles.thumb}>
        {src ? <img src={src} alt="" draggable={false} /> : thumbnail}
      </span>
      <span className={styles.caption}>{caption}</span>
    </button>
  );
}
