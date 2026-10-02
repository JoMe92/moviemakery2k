import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from "react";
import { useT } from "../i18n/useT";
import styles from "./Dialog.module.css";
import { CloseIcon } from "./icons";

export interface DialogProps {
  open: boolean;
  title: string;
  /** Called on the close button and Escape; the caller resets `open`. */
  onClose: () => void;
  children: ReactNode;
  /** Button row at the bottom right (e.g. OK/Cancel). */
  footer?: ReactNode;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/**
 * Modal dialog in our own Y2K window style, built on <dialog>.
 * Focus moves inside on open, Tab stays within the dialog, Escape closes,
 * and on close focus returns to the triggering element.
 */
export function Dialog({ open, title, onClose, children, footer }: DialogProps) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      // Fallback for environments without showModal (e.g. jsdom).
      dialog.setAttribute("open", "");
    }
    // Prefer the first element in the content, otherwise the close button.
    const items = focusables(dialog);
    (items[1] ?? items[0])?.focus();

    // Native Escape handling: intercept it and route it through onClose.
    const onCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", onCancel);

    return () => {
      dialog.removeEventListener("cancel", onCancel);
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !ref.current) return;
    const items = focusables(ref.current);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

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
