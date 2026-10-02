import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { Button } from "../ui/Button";
import styles from "./UploadPanel.module.css";

/**
 * Fortschritt und Fehler des laufenden Imports unten in der Sammlung.
 * Fehler bleiben bis „Schließen“ stehen; ein fehlerfreier Import räumt sich selbst ab.
 */
export function UploadPanel() {
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
          <span aria-live="polite">
            Importiere {current} von {total} …
          </span>
          <div
            className={styles.bar}
            role="progressbar"
            aria-label="Importfortschritt"
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
            <strong>
              {errors.length === 1
                ? "1 Datei wurde nicht importiert:"
                : `${errors.length} Dateien wurden nicht importiert:`}
            </strong>
            {active ? null : <Button onClick={clearUploads}>Schließen</Button>}
          </div>
          <ul className={styles.list}>
            {errors.map((u) => (
              <li key={u.key}>
                <span className={styles.filename}>{u.filename}</span>: {u.message ?? "Fehler"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
