import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/useT";
import { describeBackend } from "../store/status";
import { useAppStore } from "../store/useAppStore";
import { WarningIcon } from "../ui/icons";
import styles from "./StatusNotices.module.css";

/** How long a short notice stays visible (ms). */
export const NOTICE_DURATION = 2500;

/**
 * Short notices that replace the status bar in the compact layout
 * (add-mobile-layout design.md D3): "Saved" only on the change into that
 * state, and every change of the backend state after the first.
 */
export function StatusNotices() {
  const { t } = useT();
  const saveState = useAppStore((s) => s.saveState);
  const backend = useAppStore((s) => describeBackend(s.backend, t));
  const [notice, setNotice] = useState<string | null>(null);
  const prev = useRef({ saveState, backend });

  useEffect(() => {
    const before = prev.current;
    prev.current = { saveState, backend };
    let text: string | null = null;
    if (saveState === "saved" && before.saveState !== "saved") text = t("status.saved");
    else if (backend !== before.backend) text = backend;
    if (text === null) return;
    setNotice(text);
    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION);
    return () => clearTimeout(timer);
  }, [saveState, backend, t]);

  return (
    <div className={styles.notices} role="status" aria-live="polite">
      {notice ? <p className={styles.notice}>{notice}</p> : null}
    </div>
  );
}

/** Lasting warning symbol in the title bar while the last save failed. */
export function SaveFailedIndicator() {
  const { t } = useT();
  const failed = useAppStore((s) => s.saveState === "error");
  if (!failed) return null;
  return (
    <span className={styles.saveFailed} role="img" aria-label={t("status.saveFailed")}>
      <WarningIcon size={18} />
    </span>
  );
}
