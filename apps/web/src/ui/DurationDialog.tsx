import { type ReactNode, useEffect, useId, useState } from "react";
import { useT } from "../i18n/useT";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import styles from "./DurationDialog.module.css";
import { durationInputValue, parseDuration, rangeMessage } from "./duration";

export interface DurationDialogProps {
  open: boolean;
  title: string;
  /** Beschriftung des Eingabefelds, z. B. „Bilddauer (Sekunden)“. */
  label: string;
  value: number;
  range: { min: number; max: number; step: number };
  /** Übernimmt den Wert; `false` = ungültig (Dialog bleibt offen und nennt den Bereich). */
  onConfirm: (value: number) => boolean;
  onClose: () => void;
  /** Zusätzliche Aktion links in der Schaltflächenzeile (z. B. „Übergang entfernen“). */
  extraAction?: ReactNode;
  children?: ReactNode;
}

/** Eigenschaftendialog für eine Dauer in Sekunden mit Bereichsprüfung. */
export function DurationDialog({
  open,
  title,
  label,
  value,
  range,
  onConfirm,
  onClose,
  extraAction,
  children,
}: DurationDialogProps) {
  const { t, locale } = useT();
  const inputId = useId();
  const hintId = useId();
  const [text, setText] = useState(durationInputValue(value, locale));
  const [error, setError] = useState<string | null>(null);

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
