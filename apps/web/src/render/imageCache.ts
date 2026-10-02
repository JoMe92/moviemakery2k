/**
 * Bilder für die Vorschau laden (gleiche Herkunft, kein crossOrigin nötig).
 * Ein Promise je URL, damit Storyboard und Player dasselbe Bild nur einmal
 * dekodieren. Fehlgeschlagene Ladevorgänge werden nicht gecacht.
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
    // decode() fehlt in manchen Umgebungen (jsdom): dann auf load/error warten.
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

/** Nur für Tests/Aufräumen. */
export function clearImageCache(): void {
  cache.clear();
}

/** Lädt `url` und liefert das dekodierte Bild, solange es nicht da ist `undefined`. */
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
        // Kein Bild: der Monitor bleibt an dieser Stelle schwarz.
      },
    );
    return () => {
      active = false;
    };
  }, [url]);
  return loaded && loaded.url === url ? loaded.image : undefined;
}
