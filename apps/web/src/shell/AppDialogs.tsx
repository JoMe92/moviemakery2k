import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

export const ABOUT_TEXT =
  "moviemakerY2K ist vom klassischen Movie Maker inspiriert. Es ist kein Microsoft-Produkt und steht in keiner Verbindung zu Microsoft.";

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      title="Info über moviemakerY2K"
      onClose={onClose}
      footer={<Button onClick={onClose}>OK</Button>}
    >
      <p>
        <strong>moviemakerY2K</strong> · Version 0.0.0
      </p>
      <p>{ABOUT_TEXT}</p>
      <p>Lizenz: GPL-3.0-or-later</p>
    </Dialog>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Ja",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onConfirm}>{confirmLabel}</Button>
          <Button onClick={onCancel}>Nein</Button>
        </>
      }
    >
      <p>{message}</p>
    </Dialog>
  );
}
