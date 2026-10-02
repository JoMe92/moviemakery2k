## Why

moviemakerY2K soll öffentlich werden, die Oberfläche ist aber nur auf Deutsch.
Auch Katalognamen, Fehlermeldungen des Backends, Code-Kommentare,
Pixi-Task-Beschreibungen und CI-Schrittnamen sind deutsch (Bead `mmy-85c`).
Für ein öffentliches Open-Source-Projekt braucht es eine englische Oberfläche
und englische Kommentare, ohne die deutsche Oberfläche aufzugeben.

## What Changes

- **Zweisprachige Oberfläche (Deutsch und Englisch):** alle sichtbaren Texte
  kommen aus typisierten Sprachkatalogen. Die Sprache folgt einer gespeicherten
  Einstellung, sonst der Browsersprache; Rückfall ist Englisch.
- **Extras → „Optionen…“ wird funktional:** ein Y2K-Dialog mit der
  Spracheinstellung; die Umschaltung wirkt sofort und bleibt gespeichert.
- **Zahlen und Zeiten nach Sprache:** Dezimaltrennzeichen, Zeitanzeige
  (`h:mm:ss,cc` bzw. `h:mm:ss.cc`) und Größenangaben folgen der Sprache.
- **Katalognamen zweisprachig:** jeder Übergang hat einen deutschen und einen
  englischen Anzeigenamen. **BREAKING (API):** `name` im Katalog wird zu
  `names` mit `de` und `en`.
- **Fehler mit Codes:** Backend-Fehler liefern einen stabilen Code, Parameter
  und eine englische Meldung; das Frontend übersetzt anhand des Codes.
  **BREAKING (API):** Das Fehlerformat ändert sich für die eigenen Fehler
  (Medien, Projekt, Export).
- **Englische Code-Kommentare:** Kommentare und Docstrings in Backend, Web-App,
  Skripten und Paketen sowie Pixi-Task-Beschreibungen und CI-Schrittnamen
  werden englisch.

## Capabilities

### New Capabilities

- `localization`: Sprachwahl, Sprachkataloge, sprachabhängige Formate und die
  Übersetzung von Backend-Fehlern

### Modified Capabilities

- `app-shell`: Extras → „Optionen…“ wird funktional
- `transitions`: Katalogeinträge haben deutsche und englische Namen
- `preview-player`: die Zeitanzeige folgt der Sprache

## Nicht-Ziele

- Weitere Sprachen außer Deutsch und Englisch.
- Übersetzung von Dokumentation (sie ist bereits englisch) und der
  OpenSpec-Artefakte (sie bleiben deutsch, siehe `openspec/config.yaml`).
- Rechts-nach-links-Layouts, Übersetzung von Dateinamen oder Projektinhalten.
- Übersetzungen der Microsoft-Originalnamen; die Namen sind eigene
  Formulierungen.
- Neue Funktionen der Anwendung; alle bestehenden Abläufe bleiben gleich.
