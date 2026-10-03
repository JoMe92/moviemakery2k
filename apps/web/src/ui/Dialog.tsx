import { type ReactNode, useId, useRef } from "react";
import { useT } from "../i18n/useT";
import { useLayoutMode } from "../shell/layoutMode";
import styles from "./Dialog.module.css";
import { CloseIcon } from "./icons";
import { Sheet, type SheetHeight } from "./Sheet";
import { useModal } from "./useModal";

export interface DialogProps {
  open: boolean;
  title: string;
  /** Called on the close button and Escape; the caller resets `open`. */
  onClose: () => void;
  children: ReactNode;
  /** Button row at the bottom right (e.g. OK/Cancel). */
  footer?: ReactNode;
  /** Height when shown as a sheet in the compact layout (default: auto). */
  sheetHeight?: SheetHeight;
}

/**
 * Modal dialog in our own Y2K window style. In the compact layout it renders
 * as a bottom sheet (add-mobile-layout design.md D5), so every dialog follows
 * without changes of its own.
 */
export function Dialog({ sheetHeight = "auto", ...props }: DialogProps) {
  const { t } = useT();
  const { mode } = useLayoutMode();
  if (mode === "compact") {
    return <Sheet {...props} height={sheetHeight} closeLabel={t("common.closeDialog")} />;
  }
  return <WindowDialog {...props} />;
}

/**
 * Centered dialog built on <dialog>. Focus moves inside on open, Tab stays
 * within the dialog, Escape closes, and on close focus returns to the
 * triggering element.
 */
function WindowDialog({ open, title, onClose, children, footer }: DialogProps) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const onKeyDown = useModal(ref, open, onClose);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
    >
      <div className={styles.titlebar}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <button
          type="button"
          className={styles.close}
          aria-label={t("common.closeDialog")}
          onClick={onClose}
        >
          <CloseIcon size={12} />
        </button>
      </div>
      <div className={styles.body}>{children}</div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </dialog>
  );
}
