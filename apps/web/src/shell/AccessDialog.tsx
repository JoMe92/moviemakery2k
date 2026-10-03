import { useState } from "react";
import { useT } from "../i18n/useT";
import { useAppStore } from "../store/useAppStore";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

/**
 * "Access required" (add-mobile-delivery design.md D4): the LAN mode refused
 * the request because the device has no or an outdated access token. Shown
 * once per change into that state; the status keeps saying "No access".
 */
export function AccessDialog() {
  const { t } = useT();
  const unauthorized = useAppStore((s) => s.backend.kind === "unauthorized");
  const [dismissed, setDismissed] = useState(false);
  const [wasUnauthorized, setWasUnauthorized] = useState(unauthorized);
  if (unauthorized !== wasUnauthorized) {
    setWasUnauthorized(unauthorized);
    setDismissed(false);
  }
  const close = () => setDismissed(true);
  return (
    <Dialog
      open={unauthorized && !dismissed}
      title={t("access.title")}
      onClose={close}
      footer={<Button onClick={close}>{t("common.ok")}</Button>}
    >
      <p>{t("access.body")}</p>
    </Dialog>
  );
}
