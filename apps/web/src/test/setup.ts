import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { applyDocumentLocale, LOCALE_STORAGE_KEY } from "../i18n/locale";
import { resetTileSize, TILE_SIZE_STORAGE_KEY } from "../storyboard/tileSize";
import { VIBRATION_STORAGE_KEY } from "../ui/haptics";
import { restoreLayout } from "./mockLayout";

// Tests run with the German UI (localization design.md D6): every store
// created without an explicit locale starts in German.
function forceGermanLocale(): void {
  localStorage.setItem(LOCALE_STORAGE_KEY, "de");
  applyDocumentLocale("de");
}
forceGermanLocale();
beforeEach(forceGermanLocale);

afterEach(() => {
  cleanup();
});

// jsdom has no canvas: getContext returns null like a browser without
// support (instead of a "Not implemented" message).
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  writable: true,
  value: () => null,
});

// Every case starts without matchMedia (jsdom has none) = wide layout;
// tests opt into a mobile layout with mockLayout().
afterEach(() => {
  restoreLayout();
  localStorage.removeItem(TILE_SIZE_STORAGE_KEY);
  localStorage.removeItem(VIBRATION_STORAGE_KEY);
  resetTileSize();
});
