Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man
sieht, dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Dieser
Change ist bewusst auf den Import begrenzt (design.md Context) und wird als
zweite von neun geplanten WMM-2.x-Lücken-Changes umgesetzt und archiviert.

## 1. Backend

- [x] TASK-API-016 Erkennung und Datenmodell: dritter Erkennungszweig in
  `media.py` (Pillow → Video-Check per ffprobe → Audio-Check), `VideoItem`
  (`kind: "video"`, `filename`, `duration`, `width`, `height`, `codec`,
  `created_at`, `poster_url`), Grenzen 500 MB/10 Minuten, Fehlercodes
  `media.videoTooLong` und `media.noVideoStream`, `gen-api` (design.md D1,
  D2). Erledigt, wenn pytest je unterstütztem Video-Codec den Import, ein zu
  langes Video, ein zu großes Video, ein Video ohne Videostream mit
  Audiostream (gilt dann als Audio) und eine Datei ohne jeden nutzbaren
  Stream abdeckt.
- [x] TASK-API-017 Posterbild: ein FFmpeg-Lauf extrahiert ein Frame bei 1 s
  bzw. der halben Laufzeit bei kürzeren Videos als JPEG (Qualität 90),
  Dreh-Metadatung berücksichtigt, Endpunkt `GET /api/media/{id}/poster`
  (nach TASK-API-016; design.md D3). Erledigt, wenn pytest den
  Extraktions-Zeitpunkt (inkl. Sonderfall unter 2 s), den Rotations-Fall und
  Format/Qualität des Posterbilds prüft.

## 2. Oberfläche

- [x] TASK-WEB-056 Sammlung „Meine Videos“ und Aufgabenbereich:
  Store-Erweiterung um `kind: "video"`, dritte Kachel-Gruppe mit
  Posterbild, Dateiname und Dauer (`mm:ss`), Aufgabenbereich „Video
  importieren“ mit gefiltertem Dateidialog aktiv, generischer Import und
  Drag & Drop akzeptieren alle drei Medienarten gemischt, Löschen mit
  Rückfrage ohne `inUseByExport`-Prüfung, Texte in `de`/`en` (nach
  TASK-API-017; design.md D4, D5). Erledigt, wenn Komponententests Import
  über den gefilterten Dialog, gemischten Import aller drei Arten,
  Kachel-Anzeige mit Posterbild/Dauer und Löschen (auch während eines
  laufenden Exports eines anderen Mediums) abdecken.
- [x] TASK-WEB-057 Menü- und Text-Abschluss: `app-shell`-Spec-Zustand im
  Code nachgezogen (Aufgabenbereich-Eintrag „Video importieren“ aus der
  deaktivierten Liste raus), README/CHANGELOG „Unreleased“ (nach
  TASK-WEB-056). Erledigt, wenn `pixi run check` grün ist.

## 3. Abschluss

- [x] TASK-INFRA-019 E2E-Szenario: Playwright-Smoke erweitert um einen
  Video-Import (Datei mit bekannter Dauer), Kachel mit Posterbild und Dauer
  in „Meine Videos“, Bestand nach Neuladen; bestehende Smoke-Szenarien
  (Bild/Audio-Import, Übergang, Export) bleiben unverändert grün (nach
  TASK-WEB-057). Erledigt, wenn `pixi run test-e2e` grün ist.
