import { type ReactNode, useEffect, useId, useState } from "react";
import { useT } from "../i18n/useT";
import { isTouchLayout, useLayoutMode } from "../shell/layoutMode";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import styles from "./DurationDialog.module.css";
import { durationInputValue, parseDuration, rangeMessage } from "./duration";
import { Stepper } from "./Stepper";

export interface DurationDialogProps {
  open: boolean;
  title: string;
  /** Label of the input field, e.g. "Picture duration (seconds)". */
  label: string;
  value: number;
  range: { min: number; max: number; step: number };
  /** Applies the value; `false` = invalid (the dialog stays open and states the range). */
  onConfirm: (value: number) => boolean;
  onClose: () => void;
  /** Extra action on the left of the button row (e.g. "Remove transition"). */
  extraAction?: ReactNode;
  /**
   * Step of the stepper and slider shown with touch operation
   * (add-mobile-layout design.md D10); without it only the field is shown.
   */
  touchStep?: number;
  children?: ReactNode;
}

/** Properties dialog for a duration in seconds with a range check. */
export function DurationDialog({
  open,
  title,
  label,
  value,
  range,
  onConfirm,
  onClose,
  extraAction,
  touchStep,
  children,
}: DurationDialogProps) {
  const { t, locale } = useT();
  const inputId = useId();
  const hintId = useId();
  const [text, setText] = useState(durationInputValue(value, locale));
  const [error, setError] = useState<string | null>(null);
  const touch = isTouchLayout(useLayoutMode()) && touchStep !== undefined;
  const parsedText = parseDuration(text);
  const current =
    parsedText !== null && parsedText >= range.min && parsedText <= range.max ? parsedText : value;
  const setFromControl = (next: number) => {
    setText(durationInputValue(next, locale));
    setError(null);
  };
  const name = label.replace(/\s*:\s*$/, "");

  useEffect(() => {
    if (open) {
      setText(durationInputValue(value, locale));
      setError(null);
    }
  }, [open, value, locale]);

  const confirm = () => {
    const parsed = parseDuration(text);
    if (parsed === null || !onConfirm(parsed)) {
      setError(rangeMessage(range, locale));
      return;
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          {extraAction ? <span className={styles.extra}>{extraAction}</span> : null}
          <Button onClick={confirm}>{t("common.ok")}</Button>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
        </>
      }
    >
      {children}
      {touch ? (
        <div className={styles.touch}>
          <Stepper
            label={name}
            value={current}
            min={range.min}
            max={range.max}
            step={touchStep}
            format={(v) => t("units.seconds", { value: durationInputValue(v, locale) })}
            onChange={setFromControl}
          />
          <input
            type="range"
            className={styles.slider}
            aria-label={name}
            min={range.min}
            max={range.max}
            step={touchStep}
            value={current}
            aria-valuetext={t("units.seconds", { value: durationInputValue(current, locale) })}
            onChange={(event) => setFromControl(Number(event.target.value))}
          />
        </div>
      ) : null}
      <div className={styles.field}>
        <label htmlFor={inputId}>{label}</label>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={hintId}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              confirm();
            }
          }}
        />
      </div>
      {error ? (
        <p id={hintId} className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        <p id={hintId} className={styles.hint}>
          {rangeMessage(range, locale)}
        </p>
      )}
    </Dialog>
  );
}
