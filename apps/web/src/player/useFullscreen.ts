import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

export type FullscreenMode = "off" | "native" | "overlay";

/** Controls hide after this long without a touch in full screen (design.md D12). */
export const CONTROLS_HIDE_MS = 3000;

type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

function requestNative(el: FullscreenElement): Promise<void> | null {
  if (typeof el.requestFullscreen === "function" && document.fullscreenEnabled !== false) {
    return el.requestFullscreen();
  }
  if (typeof el.webkitRequestFullscreen === "function") {
    return Promise.resolve(el.webkitRequestFullscreen());
  }
  return null;
}

function nativeElement(): Element | null {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/**
 * Full-screen preview of the monitor (add-mobile-layout design.md D12): the
 * Fullscreen API on the monitor container, or, where it is missing (Safari on
 * the iPhone), a fixed overlay over the whole viewport. Escape and "Exit full
 * screen" end both; in full screen the controls hide after 3 s without touch.
 */
export function useFullscreen(rootRef: RefObject<HTMLElement | null>) {
  const [mode, setMode] = useState<FullscreenMode>("off");
  const [controlsVisible, setControlsVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
  }, []);

  const enter = useCallback(() => {
    const el = rootRef.current as FullscreenElement | null;
    if (!el) return;
    const request = requestNative(el);
    if (!request) {
      setMode("overlay");
      return;
    }
    request.then(
      () => setMode("native"),
      () => setMode("overlay"),
    );
  }, [rootRef]);

  const exit = useCallback(() => {
    if (nativeElement()) {
      const doc = document as FullscreenDocument;
      void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
    }
    setMode("off");
  }, []);

  // Leaving native full screen via the browser (Escape, back gesture).
  useEffect(() => {
    if (mode !== "native") return;
    const onChange = () => {
      if (!nativeElement()) setMode("off");
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, [mode]);

  // Escape ends the overlay (native full screen handles it itself).
  useEffect(() => {
    if (mode !== "overlay") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMode("off");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  useEffect(() => {
    if (mode === "off") {
      if (timer.current) clearTimeout(timer.current);
      setControlsVisible(true);
    } else {
      showControls();
    }
  }, [mode, showControls]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { mode, enter, exit, controlsVisible, showControls };
}
