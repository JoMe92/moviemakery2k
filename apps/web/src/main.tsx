import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createApi } from "./lib/apiClient";
import { listenForInstall } from "./pwa/install";
import { registerServiceWorker } from "./pwa/serviceWorker";
import { UpdateNotice } from "./pwa/UpdateNotice";
import { parseDebugProgress } from "./render/debugProgress";
import { createAppStore } from "./store/appStore";
import { AppStoreContext } from "./store/useAppStore";
import "./styles/theme.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root fehlt in index.html");

// Test hook ?debug-progress=<id>:<p>[:pattern] shows only the debug canvas instead of the app.
const debug = parseDebugProgress(window.location.search);
const DebugView = lazy(() => import("./render/DebugView"));

const store = createAppStore(createApi());
if (!debug) void store.getState().init();
// Save pending changes immediately when leaving the page.
window.addEventListener("pagehide", () => void store.getState().flushSave());
// Service worker of the app shell: only in the build and in a secure context.
if (!debug) void registerServiceWorker();
// Keep the browser's install event for "Install as app…" (design.md D7).
listenForInstall();

createRoot(root).render(
  <StrictMode>
    {debug ? (
      <Suspense fallback={null}>
        <DebugView spec={debug} />
      </Suspense>
    ) : (
      <AppStoreContext.Provider value={store}>
        <App />
        <UpdateNotice />
      </AppStoreContext.Provider>
    )}
  </StrictMode>,
);
