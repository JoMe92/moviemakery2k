import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { parseDebugProgress } from "./render/debugProgress";
import "./styles/theme.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root fehlt in index.html");

// Testhook ?debug-progress=<id>:<p> zeigt statt der App nur das Debug-Canvas.
const debug = parseDebugProgress(window.location.search);
const DebugView = lazy(() => import("./render/DebugView"));

createRoot(root).render(
  <StrictMode>
    {debug ? (
      <Suspense fallback={null}>
        <DebugView spec={debug} />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
