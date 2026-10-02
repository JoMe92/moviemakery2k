Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man sieht,
dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Die Umsetzung
beginnt erst, wenn `add-movie-export` in `develop` integriert ist (design.md,
Context). Der Change enthält keine neuen Übergänge oder Effekte, daher keine
Golden-Frame-Tasks.

## 1. Grundlage

- [ ] TASK-WEB-015 i18n-Kern: typisierte Kataloge `en.ts` (Referenz) und `de.ts` (`satisfies`), `t()` mit Platzhaltern und Mehrzahl, Sprachwahl (Einstellung → Browser → `en`) im Store, `<html lang>`, Formatierer für Zahlen und Zeit, Testumgebung auf Deutsch (nach Integration von add-movie-export; design.md D1–D3, D6). Erledigt, wenn Vitest Sprachwahl, Platzhalter, Mehrzahl, beide Zeitformate und gleiche Schlüssel in beiden Katalogen prüft.
- [ ] TASK-WEB-016 Dialog „Optionen“: Extras → „Optionen…“ funktional, Auswahl „Deutsch“/„English“, sofortiger Wechsel ohne Neuladen, gespeichert in `localStorage` (nach TASK-WEB-015). Erledigt, wenn Komponententests Öffnen per Maus und Tastatur, Wechsel, Abbrechen und das Speichern über ein Neuladen hinweg abdecken.

## 2. Texte umstellen

- [ ] TASK-WEB-017 Texte der Shell in die Kataloge verschieben: Menüs, Aufgabenbereich, Symbolleiste, Statusleiste, Info- und Bestätigungsdialoge, ARIA-Beschriftungen (nach TASK-WEB-015). Erledigt, wenn in diesen Komponenten keine sichtbaren deutschen Texte mehr stehen, die bestehenden Tests grün sind und ein Test die englischen Menünamen prüft.
- [ ] TASK-WEB-018 Texte von Mediensammlung, Bildstreifen, Übergangssammlung, Player und Dauer-Dialogen verschieben; Zeitanzeige und Dauern nach Sprache, Eingabe mit Komma und Punkt (nach TASK-WEB-015; design.md D3). Erledigt, wenn die bestehenden Tests grün sind und Tests die englische Zeitanzeige „0:00:12.50“ und die Eingabe „2,5“ auf Englisch abdecken.
- [ ] TASK-WEB-019 Texte des Assistenten „Film speichern“ verschieben, Größenangaben nach Sprache, Fehler anhand der Codes übersetzen mit Rückfall auf die englische Meldung (nach TASK-WEB-015, TASK-API-008; design.md D5). Erledigt, wenn Komponententests beide Sprachen, einen bekannten und einen unbekannten Fehlercode abdecken.

## 3. Katalog und Backend

- [ ] TASK-CAT-003 Katalognamen zweisprachig: Schema `names` mit `de` und `en`, `transitions.json` mit den englischen Namen aus design.md D4, Backend-Modell, `gen-api`, Anzeige `names[locale]` in Sammlung, Bildstreifen und Dialogen (nach TASK-WEB-015). Erledigt, wenn pytest den Start-Abbruch ohne englischen Namen abdeckt, Vitest den englischen Namen in der Sammlung prüft und `gen-api` sauber ist.
- [ ] TASK-API-008 Fehlercodes im Backend: eigene Fehler von Medien, Projekt und Export als `{code, params, message}` mit englischer Meldung, Export-Jobs mit `errorCode`, `gen-api` (nach Integration von add-movie-export; design.md D5). Erledigt, wenn pytest für jeden Fehlerpfad Code und englische Meldung prüft und `gen-api` sauber ist.

## 4. Kommentare, Abschluss

- [ ] TASK-INFRA-007 Englische Kommentare und Docstrings in `backend/` und `scripts/`, englische Beschreibungen in `pixi.toml` und Schrittnamen in `.github/workflows/` (nach Integration von add-movie-export; design.md D7). Erledigt, wenn dort keine deutschen Kommentare mehr stehen (Stichprobe per `grep` auf Umlaute außerhalb von Testdaten) und `pixi run check` grün ist.
- [ ] TASK-INFRA-008 Englische Kommentare in `apps/web/` und `packages/` (nach TASK-WEB-017, TASK-WEB-018, TASK-WEB-019; design.md D7). Erledigt, wenn außerhalb von `de.ts` und deutschen Testdaten keine deutschen Kommentare mehr stehen und `pixi run check` grün ist.
- [ ] TASK-WEB-020 E2E und Doku: bestehende E2E-Tests mit Locale `de-DE`, neuer E2E-Test für den Wechsel auf Englisch über „Optionen“ (Menü, Übergangsname, Zeitanzeige), README und CHANGELOG ergänzen (nach TASK-WEB-016, TASK-INFRA-008, TASK-CAT-003). Erledigt, wenn `pixi run test-e2e` lokal und in CI grün ist.
