Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man sieht,
dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Dieser Change
setzt auf `harden-export-and-ui` auf (Fehlervertrag, Job-Index, BT.709) und
wird nach ihm umgesetzt und archiviert.

## 1. Medien und Projekt (Backend)

- [ ] TASK-API-012 Medienarten: `MediaItem` als Union `image`/`audio` mit `kind` (Altbestand gilt als `image`), Erkennung Pillow → ffprobe, Grenzen je Art (100 MB, 15 min), Codes `media.audioTooLong`, `media.noAudioStream`, `media.probeUnavailable`, `gen-api` (design.md D1). Erledigt, wenn pytest je Format (MP3, WAV, M4A, OGG, FLAC) den Import, eine zu lange Datei, eine Datei ohne Tonspur und alte `media.json` ohne `kind` abdeckt.
- [ ] TASK-API-013 Audio-Ableitungen: `preview.m4a` (AAC 48 kHz Stereo) und `peaks.json` (50/s) aus einem FFmpeg-Lauf, Dauer aus der Dekodierung, Endpunkte `GET /api/media/{id}/audio` und `/peaks` mit `immutable` (nach TASK-API-012; design.md D2). Erledigt, wenn pytest Format, Abtastrate, Kanäle und Dauer der Vorschaufassung per ffprobe und die Länge der Spitzenwerte prüft.
- [ ] TASK-API-014 Projekt Version 2: `music: list[MusicClip]` mit Grenzen und Referenz-Check (Art, Dauer), Migration von Version 1, Löschen eines Mediums entfernt Musikstücke, `media.inUseByExport` auch für Audio, `gen-api` (nach TASK-API-012; design.md D3). Erledigt, wenn pytest Migration, alle Ablehnungsfälle der Spec und das kaskadierende Löschen abdeckt.
- [ ] TASK-CAT-004 Musikplan: `musicSchedule` in Python und TypeScript, Testvektoren `packages/fixtures/music-vectors.json` (nacheinander, Kürzen, Abschneiden mit Ausblendung, Film unter 1 s, Stille) (design.md D4). Erledigt, wenn pytest und Vitest dieselben Vektoren grün prüfen.

## 2. Export

- [ ] TASK-RENDER-006 Musik im Export: Vor-Mischung `music.wav` aus den Originalen nach dem Musikplan (FFmpeg-Filterkette aus design.md D6), Übergabe als `audio_input`, Abbrechen während des Mischens, Fehlercode `export.audioFailed` (nach TASK-API-014, TASK-CAT-004). Erledigt, wenn pytest Länge der Tonspur gleich Videolänge, hörbaren Pegel, Ausblendung am Ende, Lautstärke 50 % und den stummen Fall ohne Musik prüft.

## 3. Oberfläche

- [ ] TASK-WEB-027 Store und Sammlung: Medien-Union im Web, Sammlung „Meine Musik“ mit Audiosymbol, Name und Dauer, Import ordnet nach Art zu, Aufgabenbereich „Audio oder Musik importieren“ aktiv, Texte in `de`/`en` (nach TASK-API-013, TASK-API-014). Erledigt, wenn Komponententests gemischten Import, Kachel und Aufgabeneintrag in beiden Sprachen abdecken.
- [ ] TASK-WEB-028 Musikleiste: Leiste unter dem Bildstreifen mit Blöcken (Name, Länge, Wellenform, proportionale Breite), Hinzufügen per Drag & Drop und Doppelklick, Umsortieren, Entfernen, Tastaturbedienung, Ablehnen falscher Arten mit Hinweis, Hinweis bei Kürzung am Filmende (nach TASK-WEB-027; design.md D7). Erledigt, wenn Komponententests alle Szenarien von „Musikleiste“ abdecken.
- [ ] TASK-WEB-029 Musikstücke bearbeiten: Kontextmenü, Dialoge „Lautstärke…“ und „Kürzen…“ mit Prüfung, Schalter Ein-/Ausblenden (nach TASK-WEB-028). Erledigt, wenn Komponententests gültige und ungültige Eingaben beider Dialoge in beiden Sprachen abdecken.
- [ ] TASK-WEB-030 „Film an Musik anpassen“ im Menü Clip: Verteilung nach design.md D8, Dialog bei nicht erreichbarer Dauer, Deaktivierung (nach TASK-WEB-027, TASK-CAT-004). Erledigt, wenn Vitest die drei Spec-Szenarien und Rundung auf 0,25 s abdeckt.
- [ ] TASK-WEB-031 Musik in der Vorschau: `AudioEngine` auf Web Audio, Audiouhr als Taktgeber, neu planen bei Pause/Stopp/Suchen/Änderung, Start nach Benutzeraktion, stumm während der Übergangs-Demo (nach TASK-WEB-027, TASK-CAT-004; design.md D5). Erledigt, wenn Komponententests mit einem Fake-AudioContext Startzeit, Versatz nach Suchen, Pause und Stummschaltung prüfen.

## 4. Abschluss

- [ ] TASK-INFRA-013 E2E und Doku: Playwright-Test importiert Bilder und eine erzeugte Testmelodie, legt sie auf die Musikleiste, exportiert und prüft per ffprobe/astats eine hörbare Tonspur in Filmlänge; README, `docs/architecture.md` (Musikplan, Vor-Mischung, Audiouhr), CHANGELOG „Unreleased“ (nach allen anderen Tasks). Erledigt, wenn `pixi run test-e2e` und `pixi run check` grün sind.
