/**
 * Load images for the preview (same origin, no crossOrigin needed).
 * One promise per URL so the storyboard and player decode the same image
 * only once. Failed loads are not cached.
 */
import { useEffect, useState } from "react";
import type { ImageSource } from "./Renderer";

const cache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(url: string): Promise<HTMLImageElement> {
  let pending = cache.get(url);
  if (!pending) {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    // decode() is missing in some environments (jsdom): wait for load/error instead.
    const decoded =
      typeof img.decode === "function"
        ? img.decode()
        : new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error(`Bild nicht ladbar: ${url}`));
          });
    pending = decoded.then(
      () => img,
      (err: unknown) => {
        cache.delete(url);
        throw err;
      },
    );
    cache.set(url, pending);
  }
  return pending;
}

/** Tests/cleanup only. */
export function clearImageCache(): void {
  cache.clear();
}

/** Loads `url` and returns the decoded image; `undefined` until it is available. */
export function useImage(url: string | null | undefined): ImageSource | undefined {
  const [loaded, setLoaded] = useState<{ url: string; image: ImageSource } | null>(null);
  useEffect(() => {
    if (!url) return;
    let active = true;
    loadImage(url).then(
      (image) => {
        if (active) setLoaded({ url, image });
      },
      () => {
        // No image: the monitor stays black at this point.
      },
    );
    return () => {
      active = false;
    };
  }, [url]);
  return loaded && loaded.url === url ? loaded.image : undefined;
}
