import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "default" | "toolbar";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Symbol vor dem Text. */
  icon?: ReactNode;
  /**
   * Zugänglicher Name und Tooltip. Pflicht für reine Symbol-Schaltflächen
   * (ohne children), damit Hilfstechnologien einen Namen haben.
   */
  label?: string;
}

/** Plastische Y2K-Schaltfläche (Standard) oder flache Symbolleisten-Schaltfläche. */
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
