import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createApi } from "./lib/apiClient";
import { parseDebugProgress } from "./render/debugProgress";
import { createAppStore } from "./store/appStore";
import { AppStoreContext } from "./store/useAppStore";
import "./styles/theme.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root fehlt in index.html");

// Testhook ?debug-progress=<id>:<p> zeigt statt der App nur das Debug-Canvas.
const debug = parseDebugProgress(window.location.search);
const DebugView = lazy(() => import("./render/DebugView"));

const store = createAppStore(createApi());
if (!debug) void store.getState().init();
// Beim Verlassen der Seite ausstehende Änderungen sofort speichern.
window.addEventListener("pagehide", () => void store.getState().flushSave());

createRoot(root).render(
  <StrictMode>
    {debug ? (
      <Suspense fallback={null}>
        <DebugView spec={debug} />
      </Suspense>
    ) : (
      <AppStoreContext.Provider value={store}>
        <App />
      </AppStoreContext.Provider>
    )}
  </StrictMode>,
);
