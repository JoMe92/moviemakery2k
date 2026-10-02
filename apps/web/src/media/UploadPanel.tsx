import { useEffect } from "react";
import { translateError } from "../i18n/errors";
import { useT } from "../i18n/useT";
import { useAppStore } from "../store/useAppStore";
import { Button } from "../ui/Button";
import styles from "./UploadPanel.module.css";

/**
 * Progress and errors of the running import at the bottom of the collection.
 * Errors stay until "Close"; an error-free import clears itself.
 */
export function UploadPanel() {
  const { t, locale } = useT();
  const uploads = useAppStore((s) => s.uploads);
  const clearUploads = useAppStore((s) => s.clearUploads);

  const active = uploads.some((u) => u.status === "pending" || u.status === "uploading");
  const finished = uploads.filter((u) => u.status === "done" || u.status === "error").length;
  const errors = uploads.filter((u) => u.status === "error");

  useEffect(() => {
    if (!active && uploads.length > 0 && errors.length === 0) clearUploads();
  }, [active, uploads.length, errors.length, clearUploads]);

  if (!active && errors.length === 0) return null;

  const total = uploads.length;
  const current = Math.min(finished + 1, total);

  return (
    <div className={styles.panel}>
      {active ? (
        <div className={styles.progress}>
          <span aria-live="polite">{t("upload.progress", { current, total })}</span>
          <div
            className={styles.bar}
            role="progressbar"
            aria-label={t("upload.progressLabel")}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={finished}
          >
            <div className={styles.fill} style={{ width: `${(finished / total) * 100}%` }} />
          </div>
        </div>
      ) : null}
      {errors.length > 0 ? (
        <div className={styles.errors} role="alert">
          <div className={styles.errorHead}>
            <strong>{t("upload.failed", { count: errors.length })}</strong>
            {active ? null : <Button onClick={clearUploads}>{t("common.close")}</Button>}
          </div>
          <ul className={styles.list}>
            {errors.map((u) => (
              <li key={u.key}>
                <span className={styles.filename}>{u.filename}</span>:{" "}
                {u.offline
                  ? t("upload.offline")
                  : u.failure
                    ? translateError(u.failure, locale)
                    : t("upload.unknownError")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
