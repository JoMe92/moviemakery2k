## Context

Stand: `develop` mit Export und zweisprachiger Oberfläche; geplant, aber noch
nicht umgesetzt ist `harden-export-and-ui`. Dieser Change setzt auf dessen
Spec-Stand auf (u. a. BT.709 und blockiertes Löschen während eines Exports) und
MUST nach ihm archiviert werden; die MODIFIED-Texte enthalten dessen Fassung.

Vorgaben des Product Owners (2026-10-02): Musikspur mit mehreren Stücken
nacheinander; Lautstärke, Ein-/Ausblenden, Anfang/Ende kürzen und „Film an
Musik anpassen“; Musikleiste unter dem Bildstreifen; Formate MP3, WAV,
M4A/AAC, OGG, FLAC mit einheitlicher Vorschaufassung.

Technische Vorklärung durch den `architect` (2026-10-02), mit dem
FFmpeg 9.0.2 der Pixi-Umgebung geprüft: Filter `amix`, `afade`, `adelay`,
`apad`, `atrim`, `asetpts`, `aresample`, `aformat`, `volume`, `astats`
vorhanden; Decoder mp3, aac, alac, flac, vorbis, opus, pcm; Demuxer mp3, wav,
mov/m4a, ogg, flac. Ein Prototyp mischte eine Mono-MP3 (44,1 kHz) und eine
Stereo-WAV (48 kHz) mit Trim, Lautstärke, Blende und Versatz zu exakt 7,000 s
AAC 48 kHz Stereo. Nicht geprüft: Audiowiedergabe in Headless-Chromium.

Standardwerte, vom Planning Agent festgelegt (im PR änderbar): 100 MB und
15 Minuten je Audiodatei; Blenden als Schalter mit fester Dauer 1 s;
automatisches Ausblenden (1 s) am Filmende ist immer aktiv; Vorschau-Audio ist
Teil dieses Changes.

## Goals / Non-Goals

**Goals:** Vorschau und Export spielen dieselbe Musik zur selben Zeit; die
Planung der Musik ist eine reine, gemeinsam getestete Funktion; bestehende
Projekte laden weiter.

**Non-Goals:** Zeitachse, Clip-Ton, Normalisierung (siehe proposal.md).

## Decisions

### D1 – Medienarten
`MediaItem` wird eine Union mit `kind`: `image` (wie bisher) und `audio`
(`duration`, `sampleRate`, `channels`, `codec`, `audioUrl`, `peaksUrl`).
Bestehende Einträge in `media.json` ohne `kind` gelten als `image`. Erkennung:
erst Pillow, dann ffprobe (ffprobe erkennt auch PNG/JPEG). Grenzen je Art:
Bilder wie bisher 25 MB, Audio 100 MB und 15 Minuten. Neue Fehlercodes u. a.
`media.audioTooLong`, `media.noAudioStream`, `media.probeUnavailable`.

### D2 – Ableitungen für Audio
Original bleibt erhalten. Ein FFmpeg-Lauf erzeugt `preview.m4a` (AAC, 48 kHz,
Stereo, 128 kbit/s) und Rohdaten, aus denen Python `peaks.json` berechnet
(50 Spitzenwerte pro Sekunde, Mono). Die Dauer ist die dekodierte Länge, nicht
die Schätzung aus dem Container. Neue Endpunkte `GET /api/media/{id}/audio` und
`/peaks` mit `Cache-Control: immutable`.

### D3 – Projektmodell Version 2
`music: list[MusicClip]` (höchstens 100) mit `id`, `mediaId`, `trimStart`
(s, Standard 0), `trimEnd` (s oder `null` = Ende), `volume` (0–2, Standard 1),
`fadeIn`, `fadeOut` (bool). Kein Startzeitpunkt: Stücke laufen nacheinander
ab 0. Version-1-Projekte werden beim Laden zu `music: []` migriert; gespeichert
wird immer Version 2. Prüfungen mit Mediendauer (`trimStart < trimEnd ≤
duration`) und Art (`mediaId` ist Audio bzw. Bild) im Referenz-Check.
Löschen eines Mediums entfernt auch Musikstücke, die es verwenden.

### D4 – Gemeinsamer Musikplan
`musicSchedule(clips, mediaDurations, movieDuration)` liefert Segmente
`{mediaId, at, sourceIn, length, gain, fadeIn, fadeOut}` inklusive
Abschneiden am Filmende mit 1-s-Ausblendung. Je eine Implementierung in
TypeScript und Python, geprüft gegen dieselbe Datei
`packages/fixtures/music-vectors.json` (Muster wie `timeline-vectors.json`).

### D5 – Vorschau
`AudioEngine` auf Web Audio: je Segment `AudioBufferSourceNode` → `GainNode`,
Puffer je Medium dekodiert beim Hinzufügen zur Musikspur und zwischengespeichert.
Solange Musik geplant ist, ist `AudioContext.currentTime` der Taktgeber der
Wiedergabe (keine Drift). Play/Pause/Stopp/Suchen/Projektänderung: alle
Quellen stoppen und ab der aktuellen Zeit neu planen. Der AudioContext wird
in der Benutzeraktion (Klick, Leertaste) erzeugt bzw. fortgesetzt. Während
einer Übergangs-Demo ist die Musik stumm.

### D6 – Export
Vor dem Video-Rendern mischt ein eigener FFmpeg-Lauf die Musik aus den
Originalen nach dem Musikplan zu `music.wav` mit exakt der Filmdauer
(`aresample`, `aformat`, `atrim`, `volume`, `afade`, `adelay`, `amix` mit
`normalize=0`, `apad`, `atrim`). Der Export übergibt sie als `audio_input`;
die Videoseite bleibt unverändert. Ohne Musik bleibt die stumme Tonspur.
Fehler beim Mischen: `export.audioFailed`; Abbrechen wird auch während des
Mischens geprüft.

### D7 – Musikleiste und Bearbeitung
Audio erscheint in einer eigenen Sammlung „Meine Musik“ / „My Music“ in der
Sammlungsauswahl; der Import ordnet jede Datei nach ihrer Art zu.
Schmale Leiste „Audio/Musik“ bzw. „Audio/Music“ unter dem Bildstreifen im
Storyboard-Bereich: Blöcke mit Name, gekürzter Dauer und Mini-Wellenform,
Breite proportional zur Dauer; Hinweis „Musik 3:12 / Film 2:40 – wird am Ende
gekürzt“. Hinzufügen per Drag & Drop aus der Sammlung (dnd-kit wie im
Bildstreifen) oder Doppelklick; der Bildstreifen lehnt Audio ab, die
Musikleiste Bilder (mit Hinweis). Kontextmenü: Entfernen, Lautstärke…,
Einblenden, Ausblenden (Schalter), Kürzen… (Dialog mit Anfang und Ende).

### D8 – „Film an Musik anpassen“
Menü Clip → „Film an Musik anpassen“ (deaktiviert ohne Musik oder ohne Bilder):
verteilt die Gesamtdauer der Musik gleichmäßig auf die Bilder unter
Berücksichtigung der Übergänge, gerundet auf 0,25 s und begrenzt auf
0,5–60 s; die Restabweichung landet beim letzten Bild. Ist das Ziel nicht
erreichbar (zu viele oder zu wenige Bilder), meldet ein Dialog die
erreichbare Dauer und ändert nichts.

## Risks / Trade-offs

- **Speicher beim Dekodieren** (≈ 11 MB pro Stereominute) → 15-Minuten-Grenze.
- **AAC-Vorlauf** in `preview.m4a` (20–45 ms) → Vorschau nicht samplegenau,
  Export nutzt die Originale.
- **Headless-Audio in E2E** ungeprüft → Test prüft AudioContext-Zustand und
  Pegel über einen Testhook; scheitert das, nur Komponententests mit Fake.
- **Union der Medien** ändert generierte TS-Typen → betrifft viele Stellen im
  Web; ein früher Task stellt die Typen um.
- **Reihenfolge der Changes** → dieser Change wird nach `harden-export-and-ui`
  archiviert.

## Migration Plan

Projekte mit `schemaVersion` 1 werden beim Laden migriert und beim nächsten
Speichern als Version 2 geschrieben. Bestehende Medien gelten als Bilder.
Rollback: Version-2-Projekte mit leerer Musikspur sind inhaltlich gleich.

## Open Questions

Keine.
