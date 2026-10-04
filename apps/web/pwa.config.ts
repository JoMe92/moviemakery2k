import type { VitePWAOptions } from "vite-plugin-pwa";

/**
 * Service worker of the app shell (add-mobile-delivery design.md D6).
 *
 * - `prompt`: a new version waits until the user chooses "Reload"
 *   (src/pwa/UpdateNotice.tsx); the app registers the worker itself
 *   (src/pwa/serviceWorker.ts, only in the build and in a secure context).
 * - Precache of the built app shell only; no runtime caching, so requests to
 *   /api/ always go to the network, and navigations to /api/ never get the
 *   shell as fallback.
 * - The manifest is the static public/manifest.webmanifest (design.md D5).
 * - `MMY_PWA=off` builds a worker that unregisters itself (`selfDestroying`).
 */
export function pwaOptions(env: Record<string, string | undefined> = {}): Partial<VitePWAOptions> {
  return {
    registerType: "prompt",
    strategies: "generateSW",
    injectRegister: false,
    manifest: false,
    selfDestroying: env.MMY_PWA === "off",
    devOptions: { enabled: false },
    workbox: {
      globPatterns: ["**/*.{html,js,css,svg,png,webmanifest}"],
      navigateFallback: "/index.html",
      navigateFallbackDenylist: [/^\/api(\/|$)/],
      runtimeCaching: [],
      cleanupOutdatedCaches: true,
    },
  };
}
