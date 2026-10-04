import { type PointerEvent, type ReactNode, useId, useRef } from "react";
import { useT } from "../i18n/useT";
import { usePrefersReducedMotion } from "../shell/layoutMode";
import { CloseIcon } from "./icons";
import styles from "./Sheet.module.css";
import { useModal } from "./useModal";

export type SheetHeight = "auto" | "full";

export interface SheetProps {
  open: boolean;
  title: string;
  /** Called on close, Escape, the backdrop and a swipe down; the caller resets `open`. */
  onClose: () => void;
  children: ReactNode;
  /** Fixed row at the bottom (e.g. the main action). */
  footer?: ReactNode;
  /** `auto`: up to 90 % of the height; `full`: the whole screen. */
  height?: SheetHeight;
  /** Accessible name of the close button (default: "Close"). */
  closeLabel?: string;
}

/** Distance (px) a swipe down at the grip must cover to close the sheet. */
export const SWIPE_CLOSE_DISTANCE = 80;
/** Speed (px/ms) from which a shorter swipe down still closes the sheet. */
const SWIPE_CLOSE_VELOCITY = 0.5;

/**
 * Modal bottom sheet in the Y2K window style (add-mobile-layout design.md D5):
 * Luna title bar with a grip, beige face. Closes via the close button,
 * Escape, a tap on the backdrop and a swipe down at the grip; traps the focus
 * and returns it to the trigger like Dialog.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
  height = "auto",
  closeLabel,
}: SheetProps) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; time: number; id: number } | null>(null);
  const titleId = useId();
  const reducedMotion = usePrefersReducedMotion();
  const onKeyDown = useModal(ref, open, onClose);

  if (!open) return null;

  const setOffset = (dy: number) => {
    const panel = panelRef.current;
    if (panel) panel.style.transform = dy > 0 ? `translateY(${dy}px)` : "";
  };

  const onGripDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { y: event.clientY, time: performance.now(), id: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onGripMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    setOffset(Math.max(0, event.clientY - drag.current.y));
  };
  const onGripUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    drag.current = null;
    if (start?.id !== event.pointerId) return;
    const dy = event.clientY - start.y;
    const dt = Math.max(1, performance.now() - start.time);
    setOffset(0);
    if (dy > SWIPE_CLOSE_DISTANCE || (dy > 16 && dy / dt > SWIPE_CLOSE_VELOCITY)) onClose();
  };
  const onGripCancel = () => {
    drag.current = null;
    setOffset(0);
  };

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-modal="true"
      aria-labelledby={titleId}
      data-motion={reducedMotion ? "reduce" : "full"}
      onKeyDown={onKeyDown}
    >
      {/* The backdrop is a plain surface; the close button is its keyboard equivalent. */}
      <div className={styles.backdrop} aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        className={[styles.panel, height === "full" ? styles.full : ""].filter(Boolean).join(" ")}
      >
        <div
          className={styles.grip}
          aria-hidden="true"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripCancel}
        >
          <span className={styles.gripBar} />
        </div>
        <div className={styles.titlebar}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.close}
            aria-label={closeLabel ?? t("common.close")}
            onClick={onClose}
          >
            <CloseIcon size={14} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </dialog>
  );
}
