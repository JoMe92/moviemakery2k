import { useEffect, useState } from "react";
import { describeHealth, fetchHealth, type Health } from "./api";

// Platzhalter-Shell im Movie-Maker-Layout: Aufgabenbereich | Sammlung | Vorschau, darunter Storyboard.
// Die eigentliche UI wird über OpenSpec-Changes geplant.
export function App() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchHealth(ctrl.signal)
      .then(setHealth)
      .catch(() => setHealth(null));
    return () => ctrl.abort();
  }, []);

  return (
    <div className="window">
      <header className="titlebar">moviemakerY2K</header>
      <main className="workspace">
        <aside className="pane tasks">Aufgaben</aside>
        <section className="pane collection">Sammlung</section>
        <section className="pane monitor">Vorschau</section>
      </main>
      <footer className="pane storyboard">Storyboard</footer>
      <div className="statusbar">{describeHealth(health)}</div>
    </div>
  );
}
