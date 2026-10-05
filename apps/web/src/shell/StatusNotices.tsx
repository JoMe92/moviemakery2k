import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/useT";
import { describeBackend } from "../store/status";
import { useAppStore } from "../store/useAppStore";
import { WarningIcon } from "../ui/icons";
import { NOTICE_DURATION, useActionNotice } from "./notice";
import styles from "./StatusNotices.module.css";

export { NOTICE_DURATION } from "./notice";

/**
 * "Saved" only on the change into that state, and every change of the backend
 * state after the first (add-mobile-layout design.md D3).
 *
 * `suppressed` = an action notice is standing and must not be pushed aside
 * (app-shell design.md D4). A state message that falls due then is dropped,
 * not queued: the autosave that the action itself triggered must not
 * overwrite the confirmation a fraction of a second later.
 */
function useStateNotice(suppressed: boolean): string | null {
  const { t } = useT();
  const saveState = useAppStore((s) => s.saveState);
  const backend = useAppStore((s) => describeBackend(s.backend, t));
  const [notice, setNotice] = useState<string | null>(null);
  const prev = useRef({ saveState, backend });
  const hidden = useRef(suppressed);
  hidden.current = suppressed;

  // An arriving action notice also clears a state message already standing,
  // so it cannot reappear once the action notice has run out.
  useEffect(() => {
    if (suppressed) setNotice(null);
  }, [suppressed]);

  useEffect(() => {
    const before = prev.current;
    prev.current = { saveState, backend };
    let text: string | null = null;
    if (saveState === "saved" && before.saveState !== "saved") text = t("status.saved");
    else if (backend !== before.backend) text = backend;
    if (text === null || hidden.current) return;
    setNotice(text);
    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION);
    return () => clearTimeout(timer);
  }, [saveState, backend, t]);

  return notice;
}

/**
 * Short notices that replace the status bar in the compact and medium layouts
 * (add-mobile-layout design.md D3): the notice about the last action, and
 * otherwise the state messages. The wide layout shows the same action notice
 * in its status bar instead (app-shell design.md D4).
 */
export function StatusNotices() {
  const action = useActionNotice();
  const state = useStateNotice(action !== null);
  const notice = action ?? state;

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

/** Lasting "No access" in the title bar while the LAN mode refuses this device. */
export function NoAccessIndicator() {
  const { t } = useT();
  const unauthorized = useAppStore((s) => s.backend.kind === "unauthorized");
  if (!unauthorized) return null;
  return (
    <span className={styles.noAccess} role="status">
      {t("status.noAccess")}
    </span>
  );
}
