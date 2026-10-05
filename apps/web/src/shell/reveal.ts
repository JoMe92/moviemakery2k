import { type RefObject, useEffect, useRef } from "react";
import type { RevealRequest } from "../store/appStore";
import { useAppStore } from "../store/useAppStore";

/** How an element is brought into view: no page jump, animated where allowed. */
const INTO_VIEW: ScrollIntoViewOptions = {
  block: "nearest",
  inline: "nearest",
  behavior: "smooth",
};

/** Scrolls an element into view, if there is one (jsdom has no scrollIntoView). */
export function scrollIntoView(element: HTMLElement | null | undefined): void {
  element?.scrollIntoView?.(INTO_VIEW);
}

/**
 * Serves the store's reveal requests for one kind of element (app-shell
 * design.md D6): adding from the collection asks, and the view that owns the
 * tiles and the scroll container scrolls. `tiles` is the id → button map the
 * filmstrip and the music track already keep for their menus.
 */
export function useRevealRequest(
  kind: RevealRequest["kind"],
  tiles: RefObject<Map<string, HTMLElement>>,
): void {
  const request = useAppStore((s) => s.revealRequest);
  const seen = useRef(request?.seq ?? 0);

  useEffect(() => {
    if (!request || request.seq === seen.current) return;
    seen.current = request.seq;
    if (request.kind !== kind) return;
    const id = "slideId" in request ? request.slideId : request.clipId;
    scrollIntoView(tiles.current?.get(id));
  }, [request, kind, tiles]);
}
