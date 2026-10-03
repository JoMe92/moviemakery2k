import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import styles from "./Tile.module.css";

export interface TileProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  caption: string;
  /** Thumbnail URL; alternatively custom content via `thumbnail`. */
  src?: string;
  thumbnail?: ReactNode;
  selected?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/** Tile with thumbnail and caption; selectable and focusable. */
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
        {src ? (
          <img src={src} alt="" loading="lazy" decoding="async" draggable={false} />
        ) : (
          thumbnail
        )}
      </span>
      <span className={styles.caption}>{caption}</span>
    </button>
  );
}
