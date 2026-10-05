Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man
sieht, dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei.
Diese Change ist rein kombinatorisch (kein Backend-Eingriff, keine neue
Render-Technik) und die achte von neun geplanten WMM-2.x-Lücken-Changes.

## 1. Katalog

- [x] TASK-CAT-008 AutoMovie-Katalog: 3 Einträge in
  `packages/catalog/automovie.json` (Klassisch, Alter Film, Musikvideo),
  Start-Validierung (design.md D1). Erledigt, wenn ein Test alle drei
  Einträge, ihre Übergangs-/Effekt-/Titel-Stil-Referenzen gegen die
  jeweiligen Kataloge und die `requiresMusic`-Markierung prüft.

## 2. Oberfläche

- [x] TASK-WEB-069 AutoMovie-Dialog und Algorithmus: Extras → „AutoMovie…“
  öffnet den Dialog (Filmtitel, Stil-Auswahl mit deaktiviertem
  musikpflichtigem Stil ohne Musikspur, Rückfrage bei nicht leerem
  Bildstreifen); „Erstellen“ baut den Bildstreifen aus der
  Mediensammlung in Importreihenfolge, setzt Übergang und Effekt des
  Stils, fügt Start- und Endtitel ein und ruft bei vorhandener Musik
  `fitToMusic` auf (nach TASK-CAT-008; design.md D2, D3). Erledigt, wenn
  Komponententests alle drei Stile (inkl. Alter-Film-Effekt und
  Musikvideo-Anpassung an die Musik), die Rückfrage und die Deaktivierung
  des musikpflichtigen Stils ohne Musik abdecken.

## 3. Abschluss

- [ ] TASK-INFRA-025 E2E und Doku: Playwright-Smoke erweitert um AutoMovie
  mit dem Stil „Klassisch“ auf eine gefüllte Mediensammlung; Export des
  Ergebnisses funktioniert unverändert; README/CHANGELOG „Unreleased“
  (nach TASK-WEB-069). Erledigt, wenn `pixi run test-e2e` grün ist.
