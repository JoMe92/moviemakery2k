import { useT } from "../i18n/useT";
import styles from "./Stepper.module.css";

export interface StepperProps {
  /** Name of the value (e.g. "Transition duration"); the buttons derive theirs from it. */
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Display of the value (e.g. "1,25 s"). */
  format: (value: number) => string;
  disabled?: boolean;
}

/** Rounds onto the step grid starting at `min` (avoids 0.1 + 0.2 drift). */
export function snap(value: number, min: number, step: number): number {
  return Math.round((min + Math.round((value - min) / step) * step) * 1e6) / 1e6;
}

/**
 * Touch stepper "− value +" with fixed step (add-mobile-layout design.md
 * D10). The buttons are disabled at the limits.
 */
export function Stepper({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  disabled = false,
}: StepperProps) {
  const { t } = useT();
  const change = (delta: number) => {
    const next = snap(Math.min(max, Math.max(min, value + delta)), min, step);
    if (next !== value) onChange(next);
  };
  return (
    <fieldset className={styles.stepper} aria-label={label}>
      <button
        type="button"
        className={styles.button}
        aria-label={t("stepper.decrease", { label })}
        disabled={disabled || value <= min}
        onClick={() => change(-step)}
      >
        −
      </button>
      <output className={styles.value} aria-live="polite">
        {format(value)}
      </output>
      <button
        type="button"
        className={styles.button}
        aria-label={t("stepper.increase", { label })}
        disabled={disabled || value >= max}
        onClick={() => change(step)}
      >
        +
      </button>
    </fieldset>
  );
}
