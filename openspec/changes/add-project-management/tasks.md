Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man
sieht, dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Dieser
Change ist rein clientseitig (kein Backend, keine API, kein Schema-Wechsel)
und wird als erste von neun geplanten WMM-2.x-Lücken-Changes umgesetzt und
archiviert.

## 1. Rückgängig/Wiederholen

- [ ] TASK-WEB-052 Verlaufs-Infrastruktur: Undo-/Redo-Stack im Store
  (Snapshot von `slides` und `music`, höchstens 50 Einträge, Redo-Leerung bei
  neuer Aktion), Aktionen `undo()`/`redo()`, Menüeinträge „Rückgängig“ und
  „Wiederholen“ aktiv/inaktiv je Stack-Füllstand, globaler
  `keydown`-Listener für Strg+Z und Strg+Y/Strg+Umschalt+Z, der in
  Eingabefeldern nicht greift (design.md D1–D3). Erledigt, wenn Vitest
  mehrere Schritte (Bild hinzufügen, umsortieren, Dauer ändern, Übergang
  setzen und entfernen) je rückgängig und wiederholbar prüft, die
  Stack-Grenze bei 50 Einträgen, die Leerung des Wiederholen-Verlaufs nach
  einer neuen Änderung, die deaktivierten Menüeinträge bei leerem Stack und
  ein ignoriertes Strg+Z bei Fokus in einem Eingabefeld.

## 2. Ausschneiden, Kopieren, Einfügen

- [ ] TASK-WEB-053 Zwischenablage und Bildstreifen: interner
  Ein-Element-Zwischenablage-Zustand (Art `slide`/`musicClip`, design.md D4),
  Strg+X/C/V und Bearbeiten → „Ausschneiden“/„Kopieren“/„Einfügen“ für ein
  Bildstreifen-Element, Einfügen ohne eingehenden Übergang an der
  Zielposition aus design.md D5, neues Element automatisch ausgewählt (nach
  TASK-WEB-052). Erledigt, wenn Komponententests Kopieren+Einfügen (Duplikat
  ohne Übergang, direkt nach dem Original), Ausschneiden+Einfügen (Original
  entfernt, ein Undo-Schritt für den ganzen Vorgang), Einfügen ohne Auswahl
  (ans Ende) und Einfügen bei leerer Zwischenablage (deaktiviert) abdecken.
- [ ] TASK-WEB-054 Zwischenablage und Musikspur: dieselbe Mechanik für
  Musikstücke (Kürzung, Lautstärke, Blenden bleiben beim Kopieren erhalten),
  Ersetzen des Zwischenablage-Inhalts beim Wechsel der Art (nach
  TASK-WEB-053; design.md D4, D5). Erledigt, wenn Komponententests dieselben
  Szenarien für Musikstücke prüfen und zusätzlich: Kopieren eines Bildes,
  danach Kopieren eines Musikstücks lässt nur Letzteres in der
  Zwischenablage, und Einfügen trifft danach die Musikspur statt den
  Bildstreifen.

## 3. Abschluss

- [ ] TASK-WEB-055 Menü- und Text-Abschluss: `app-shell`-Spec-Zustand im
  Code nachgezogen (Datei → „Projekt öffnen…“/„Projekt speichern“ und
  Bearbeiten → „Alles auswählen“ bleiben sichtbar und deaktiviert,
  `aria-disabled`), Tastenkürzel-Texte `menu.keys.*` in `de`/`en` ergänzt
  (Strg+Z/Strg+Y/Strg+Umschalt+Z/Strg+X/Strg+C/Strg+V bzw.
  Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z/Ctrl+X/Ctrl+C/Ctrl+V), README/CHANGELOG
  „Unreleased“ (nach TASK-WEB-053, TASK-WEB-054). Erledigt, wenn
  `pixi run check` grün ist.
- [ ] TASK-INFRA-018 E2E-Szenario: Playwright-Smoke erweitert um Bilder
  hinzufügen, umsortieren, Strg+Z, Strg+Y, ein Bild kopieren und einfügen;
  Neuladen danach zeigt den zuletzt bestätigten Stand ohne Undo-Verlauf
  (nach TASK-WEB-055). Erledigt, wenn `pixi run test-e2e` grün ist.
