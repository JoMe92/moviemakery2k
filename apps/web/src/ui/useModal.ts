import { type KeyboardEvent, type RefObject, useEffect, useRef } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/**
 * Modal behaviour shared by Dialog and Sheet, built on <dialog>: opens
 * modally, moves the focus inside (first content element, else the close
 * button), keeps Tab within the element, routes Escape to onClose and returns
 * the focus to the triggering element on close.
 */
export function useModal(
  ref: RefObject<HTMLDialogElement | null>,
  open: boolean,
  onClose: () => void,
): (event: KeyboardEvent<HTMLDialogElement>) => void {
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
  }, [open, ref]);

  return (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
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
}
