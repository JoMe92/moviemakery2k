import { useSyncExternalStore } from "react";
import { useT } from "../i18n/useT";
import { Button } from "../ui/Button";
import { updateState } from "./serviceWorker";
import styles from "./UpdateNotice.module.css";

/** "New version available" with "Reload" (add-mobile-delivery design.md D6). */
export function UpdateNotice() {
  const { t } = useT();
  const needRefresh = useSyncExternalStore(updateState.subscribe, updateState.needRefresh);
  if (!needRefresh) return null;
  return (
    <div className={styles.notice} role="status">
      <span>{t("pwa.updateAvailable")}</span>
      <Button onClick={() => void updateState.reload()}>{t("pwa.reload")}</Button>
    </div>
  );
}
