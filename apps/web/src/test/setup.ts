import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { applyDocumentLocale, LOCALE_STORAGE_KEY } from "../i18n/locale";

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

// jsdom kennt kein Canvas: getContext liefert wie in einem Browser ohne
// Unterstützung null (statt einer „Not implemented“-Meldung).
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  writable: true,
  value: () => null,
});
