## Why

Mit 0.1.0 lässt sich eine Diashow bauen und im Browser abspielen, aber es
entsteht **kein Film**. Schritt „3. Film fertig stellen“ im Aufgabenbereich
ist deaktiviert. Ohne Export ist moviemakerY2K ein Prototyp, kein Werkzeug.

Der Export ist außerdem der architektonische Kern aus ADR 0001: Dieselben
GLSL-Shader, die die Vorschau im Browser nutzt, rendern den Film im Backend
über headless GL, und FFmpeg kodiert das Ergebnis. Je früher diese Pipeline
steht und per Golden Frames gegen die Vorschau geprüft wird, desto billiger
bleibt jeder weitere Übergang und Effekt.

Eine Lückenanalyse gegenüber Movie Maker 2.1 (siehe design.md, Kontext) hat
den Export als wichtigste fehlende Funktion ergeben, gefolgt von der Musikspur.
Der Export wird deshalb so gebaut, dass die Musik im nächsten Change ohne Umbau
der Videoseite dazukommt.

## What Changes

- **Assistent „Film speichern“ im Y2K-Stil:** erreichbar über Aufgabenbereich →
  „3. Film fertig stellen“ → „Auf dem Computer speichern“ und über Datei →
  „Film speichern…“. Schritte: Dateiname → Qualität → Fortschritt (mit
  Abbrechen) → Fertig (Download). Angelehnt an den „Film speichern“-Assistenten
  des Originals; Ziel ist hier eine heruntergeladene Datei.
- **Zwei Qualitätsprofile im Format 4:3:** „Hohe Qualität“ 960×720 (Standard)
  und „Kleine Datei“ 640×480, jeweils 30 fps, MP4 mit H.264 (yuv420p) und
  einer AAC-Tonspur (48 kHz, Stereo; vorerst stumm).
- **Render-Pipeline im Backend:** Vorschaubilder → headless GL (moderngl über
  EGL, Mesa llvmpipe) mit den unveränderten Shadern aus `packages/shaders` →
  Rohbilder per Pipe an FFmpeg → MP4. Das Zeitmodell der Vorschau wird nach
  Python portiert und über gemeinsame Testvektoren mit der TypeScript-Version
  abgeglichen.
- **Export-Jobs im Backend:** Starten, Fortschritt abfragen, Ergebnis
  herunterladen, Abbrechen. Ein Export läuft auf einem Schnappschuss des
  Projekts; es läuft höchstens ein Export gleichzeitig.
- **Golden Frames Vorschau ↔ Export:** Für jeden der sechs Übergänge wird ein
  Bild mitten im Übergang aus dem Browser und aus dem Backend verglichen.

## Capabilities

### New Capabilities

- `movie-export`: Film als MP4-Datei exportieren (Assistent, Profile,
  Fortschritt, Abbrechen, Download) und die Treue des Exports zur Vorschau

### Modified Capabilities

- `app-shell`: „Auf dem Computer speichern“ im Aufgabenbereich und Datei →
  „Film speichern…“ werden funktional

## Nicht-Ziele

- Musik, Ton, Erzählung und Lautstärkeregler. Folgt im nächsten Change; die
  Tonspur ist vorbereitet, aber stumm.
- Videoclips, Zeitachse, Videoeffekte, Titel und Abspann.
- Weitere Übergänge, 16:9 oder frei wählbare Auflösungen, andere Container oder
  Codecs (WebM, GIF), Hardware-Encoder.
- Ziele des Original-Assistenten außer „Arbeitsplatz“ (CD, E-Mail, Web,
  DV-Kamera). „Im Web veröffentlichen“ bleibt deaktiviert.
- Export im Browser (WebCodecs). ADR 0001 legt den Backend-Export fest.
- Offizielle Unterstützung des Exports unter macOS und Windows (siehe
  design.md D1; dort nur ohne Gewähr).
- Neue Übergangsparameter. Die sechs Übergänge behalten ihre Quellen aus
  `add-slideshow-mvp` (WMM-2.x-XML bzw. SMIL-Wipe-Nr.).
