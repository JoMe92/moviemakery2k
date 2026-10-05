Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man
sieht, dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Die
Änderung sitzt in einer reinen Funktion und ihrem Aufrufer; ein neues
Datenmodell oder eine API-Änderung braucht sie nicht.

## 1. Zeitmodell

- [x] TASK-WEB-079 `fitToMusic` rechnet mit dehnbaren und festen Elementen
  Dehnbar sind Bild- und Titel-Elemente, fest ist ein Videoclip;
  bisektiert wird die gleichmäßige Dauer der dehnbaren Elemente, gemessen
  über den ganzen Bildstreifen, der Rest liegt auf dem letzten dehnbaren
  Element, die Grenzen rechnen die festen Clips mit (design.md D1, D2,
  D3). Erledigt, wenn Vitest den exakten Treffer mit einem festen
  Videoclip, den mitgedehnten Titel, einen Übergang an der Grenze
  zwischen festem und dehnbarem Element, den Bildstreifen ohne dehnbares
  Element und die unveränderten Ergebnisse der bestehenden Fälle ohne
  Video abdeckt.

## 2. Oberfläche

- [x] TASK-WEB-080 Aufrufer und Dialog auf dehnbare Elemente nachgezogen
  Der Store setzt die Dauern, die die Funktion liefert, statt selbst zu
  entscheiden, welches Element er dehnt; der Menüeintrag bleibt
  verfügbar, solange es Elemente und Musik gibt, und der Dialog nennt die
  erreichbare Dauer in beiden Richtungen (nach TASK-WEB-079; design.md
  D3, D4). Erledigt, wenn Komponententests den Menüeintrag mit einem
  Bildstreifen aus lauter Videoclips, die Meldung in beiden Richtungen
  und AutoMovie „Musikvideo“ mit einem Videoclip in der Sammlung bei
  genauer Gesamtlänge abdecken.

## 3. Abschluss

- [x] TASK-INFRA-030 E2E und Doku zur exakten Anpassung an die Musik
  Playwright baut einen Bildstreifen aus Bildern und einem Videoclip,
  fügt Musik hinzu, wählt „Film an Musik anpassen“ und prüft die
  Gesamtdauer in der Zeitanzeige des Monitors (die Statusleiste zeigt sie
  nicht; Befund aus mmy-osu); dazu README und CHANGELOG „Unreleased“
  (nach TASK-WEB-080). Erledigt, wenn `pixi run test-e2e` und
  `pixi run check` grün sind.
