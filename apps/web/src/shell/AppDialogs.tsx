import { useT } from "../i18n/useT";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

export const APP_VERSION = "0.1.0";
export const APP_LICENSE = "GPL-3.0-or-later";

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const app = t("app.name");
  return (
    <Dialog
      open={open}
      title={t("about.title", { app })}
      onClose={onClose}
      footer={<Button onClick={onClose}>{t("common.ok")}</Button>}
    >
      <p>
        <strong>{app}</strong> · {t("about.version", { version: APP_VERSION })}
      </p>
      <p>{t("about.text", { app })}</p>
      <p>{t("about.license", { license: APP_LICENSE })}</p>
    </Dialog>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** Label of the confirm button; defaults to "Yes" in the UI language. */
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useT();
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onConfirm}>{confirmLabel ?? t("common.yes")}</Button>
          <Button onClick={onCancel}>{t("common.no")}</Button>
        </>
      }
    >
      <p>{message}</p>
    </Dialog>
  );
}
