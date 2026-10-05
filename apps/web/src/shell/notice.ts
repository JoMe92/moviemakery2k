import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";

/** How long a short notice stays visible (ms). */
export const NOTICE_DURATION = 2500;

/**
 * The store's action notice while it is fresh (design.md D4). One channel,
 * two presentations: the notice strip of the compact and medium layouts and
 * the temporary status-bar field of the wide one both read it from here, so
 * both show the same text for the same time.
 *
 * A newer notice replaces the standing one at once and starts the time over -
 * whoever adds twice in a row reads the newer number.
 */
export function useActionNotice(): string | null {
  const notice = useAppStore((s) => s.notice);
  const [text, setText] = useState<string | null>(null);
  // A notice that was already standing when this presentation mounted is not
  // shown again (a layout change must not replay it).
  const seen = useRef(notice?.seq ?? 0);

  useEffect(() => {
    if (!notice || notice.seq === seen.current) return;
    seen.current = notice.seq;
    setText(notice.text);
    const timer = setTimeout(() => setText(null), NOTICE_DURATION);
    return () => clearTimeout(timer);
  }, [notice]);

  return text;
}
