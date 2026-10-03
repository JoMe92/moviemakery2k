import { describe, expect, it } from "vitest";
import { pwaOptions } from "./pwa.config.ts";

// add-mobile-delivery design.md D6: nothing under /api/ is ever cached.
describe("service worker configuration", () => {
  const options = pwaOptions();
  const workbox = options.workbox ?? {};

  it("asks before activating a new version and registers manually", () => {
    expect(options.registerType).toBe("prompt");
    expect(options.strategies).toBe("generateSW");
    expect(options.injectRegister).toBe(false);
    expect(options.devOptions?.enabled).toBe(false);
    expect(options.selfDestroying).toBe(false);
    expect(pwaOptions({ MMY_PWA: "off" }).selfDestroying).toBe(true);
  });

  it("has no runtime caching rule, so /api/ always goes to the network", () => {
    expect(workbox.runtimeCaching ?? []).toEqual([]);
    expect(JSON.stringify(workbox.globPatterns)).not.toContain("api");
  });

  it("never answers /api/ navigations with the app shell", () => {
    expect(workbox.navigateFallback).toBe("/index.html");
    const denied = (path: string) =>
      (workbox.navigateFallbackDenylist ?? []).some((pattern) => pattern.test(path));
    expect(denied("/api/project")).toBe(true);
    expect(denied("/api/exports/1/file")).toBe(true);
    expect(denied("/api")).toBe(true);
    expect(denied("/")).toBe(false);
    expect(denied("/apiary")).toBe(false);
  });
});
