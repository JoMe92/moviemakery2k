import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "default" | "toolbar";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Icon before the text. */
  icon?: ReactNode;
  /**
   * Accessible name and tooltip. Required for icon-only buttons
   * (without children) so assistive technologies get a name.
   */
  label?: string;
}

/** Raised Y2K button (default) or flat toolbar button. */
export function Button({
  variant = "default",
  icon,
  label,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const iconOnly = children === undefined || children === null;
  return (
    <button
      type={type}
      className={[styles.button, styles[variant], className].filter(Boolean).join(" ")}
      aria-label={iconOnly ? label : undefined}
      title={label}
      {...rest}
    >
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      {iconOnly ? null : <span>{children}</span>}
    </button>
  );
}
