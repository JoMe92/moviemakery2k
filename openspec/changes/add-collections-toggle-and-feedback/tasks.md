Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man sieht,
dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Diese Change
setzt auf `add-mobile-layout` auf (Layout-Modi, Sammlungs-Sheet, Haptik) und
wird nach ihr archiviert (design.md D7). Backend, Datenmodell, Katalog und
Shader bleiben unberührt.

## 1. Sammlungsbereich ein- und ausblenden

- [x] TASK-WEB-074 Sichtbarkeit des Sammlungsbereichs im App-Store: flüchtiger Zustand neben `collection`, `setCollection` blendet den Bereich wieder ein, `AppWindow` lässt ihn im breiten und mittleren Layout weg und gibt den Platz dem Monitor (design.md D3, D5). Erledigt, wenn Tests beide Layout-Modi, den unveränderten Aufgabenbereich, das Wiedereinblenden über jede Sammlungswahl und den sichtbaren Bereich nach einem Neuladen abdecken.
- [x] TASK-WEB-075 Umschaltfläche „Sammlungen“ in der Symbolleiste: Y2K-Schaltfläche mit `FolderIcon` links neben der Sammlungsauswahl, gleichbleibender Name, `aria-pressed` für den Zustand, Texte in `de` und `en` (nach TASK-WEB-074; design.md D1, D2). Erledigt, wenn Tests Umschalten per Maus und Tastatur, `aria-pressed` in beiden Zuständen, beide Sprachen und das Fehlen der Schaltfläche im kompakten Layout abdecken.

## 2. Rückmeldung beim Hinzufügen

- [x] TASK-WEB-076 Kurzhinweis als gemeinsamer Kanal: Hinweis und auslösende Aktion im App-Store, `StatusNotices` zeigt ihn mit Vorrang vor „Gespeichert“ und Backend-Wechsel, die Statusleiste des breiten Layouts bekommt eine vorübergehende Angabe mit `role="status"` (design.md D4). Erledigt, wenn Tests beide Darstellungen, den Ablauf nach 2,5 s, den Vorrang vor einer Zustandsmeldung und das Ersetzen durch einen neueren Hinweis abdecken.
- [x] TASK-WEB-077 Bestätigung beim Hinzufügen aus der Sammlung: Sheet-Schaltfläche, Doppelklick und Kontextmenü melden Anzahl und Art mit Pluralformen in `de` und `en`, scrollen das zuletzt hinzugefügte Element sichtbar, lassen die Auswahl unverändert und lösen `vibrate("drop")` aus (nach TASK-WEB-076; design.md D6). Erledigt, wenn Tests alle drei Wege, beide Sprachen, Einzahl und Mehrzahl, das Scrollen und die Vibration je Schalterstellung abdecken.

## 3. Abschluss

- [ ] TASK-INFRA-028 E2E und Doku: Playwright fährt den Weg des Product Owners am Handy ab (mehrere Bilder wählen, hinzufügen, Kurzhinweis lesen, Bilder im Bildstreifen sehen) und blendet am Desktop den Sammlungsbereich aus und über die Sammlungsauswahl wieder ein; dazu README und CHANGELOG „Unreleased“ (nach allen anderen Tasks; design.md D8). Erledigt, wenn `pixi run test-e2e` und `pixi run check` grün sind.
