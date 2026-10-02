# Recherche: Klassischer Movie Maker als Klon (Web-App + FFmpeg-Backend)

Stand: 2026-10-02 (aktualisiert auf Web-App + FFmpeg). Legende: **[V]** belegt durch Quelle · **[E]** Einschätzung/unsicher.
Rohdaten der Original-Definitionen: `docs/research/sources/` (siehe Abschnitt 7).

## 1. Fazit in Kürze

- Vorbild ist **Movie Maker 2.1 (Windows XP SP2)**. 2.6 ist praktisch identisch, 6.0 (Vista) hat die Effekte auf GPU-Shader umgebaut und sieht deshalb anders aus. [V]
- **Ein 1:1-Nachbau ist realistisch:** Die XML-Definitionen aller eingebauten Übergänge und Effekte sind mit Parametern öffentlich dokumentiert (2.x: MSDN-Artikel, 6.0: Vista-SDK). Die Titel-XML von 2.x wurde 2005 aus `moviemk.exe` extrahiert und ist über archive.org erhalten. [V]
- **Stack (entschieden, siehe `docs/adr/0001-architektur.md`):** Web-App (Vite/React/TS, WebGL2-Vorschau) und Python/FastAPI-Backend mit FFmpeg. Die GLSL-ES-Shader werden zwischen Vorschau und Export geteilt. Die frühere KMP/Android-Empfehlung (§5, historisch) ist überholt.
- **Name:** „Windows“ darf nicht im Namen stehen, „Movie Maker“ ist riskant. Ein eigener Name ist besser, etwa mit dem Zusatz „inspiriert vom klassischen Movie Maker“. Original-Icons, -Sounds und -Shader dürfen nicht übernommen werden. [V/E]

## 2. Versionen

| Version | Plattform | Bedeutung |
|---|---|---|
| 1.0 / 1.1 | ME / XP | Wenige Funktionen, noch keine Effekte |
| 2.0 | XP-Update, Nov. 2002 | Bringt Effekte, Übergänge, Titel und AutoMovie |
| **2.1** | **XP SP2** | **Referenz für den Klon** |
| 2.6 | Vista | Wie 2.1, läuft nur auf der CPU |
| 6.0 | Vista | Direct3D 9 + HLSL (`Parity.fx`), neue Pan/Zoom-Effekte, andere Optik |

Quellen: https://en.wikipedia.org/wiki/Windows_Movie_Maker · https://learn.microsoft.com/en-us/previous-versions/ms867186(v=msdn.10)

## 2a. Bedienkonzept des Originals (2.x)

Das gehört zum Look & Feel und soll im Nachbau wiederzuerkennen sein:

- **Hauptfenster:** links der **Aufgabenbereich** („Movie Tasks“) mit drei Schritten: *1. Video aufnehmen* (Import), *2. Film bearbeiten* (Übergänge, Effekte, Titel), *3. Film fertig stellen* (Export). In der Mitte die **Sammlungen** (importierte Clips als Kacheln bzw. den Katalog der Effekte und Übergänge), rechts der **Vorschaumonitor** mit Play, Split und Frame-Schritt. [V]
- **Unten wahlweise:** das **Storyboard** (Kacheln mit Effekt-Slot pro Clip und Übergangs-Slot zwischen Clips) oder die **Zeitachse** (Spuren Video, Übergang, Audio, Audio/Musik, Titel-Overlay; Zoom; Trimmen per Griff). [V]
- **Bedienung:** Effekte und Übergänge zieht man per Drag & Drop aus der Sammlung auf den Slot. Im Katalog zeigt ein Doppelklick eine Vorschau mit Beispielbildern. [V]
- **Clips:** Videos werden beim Import automatisch nach Szenen in Clips geteilt. Fotos bekommen eine Standarddauer, Übergänge eine Standard-Überlappung (beides in den Optionen einstellbar). [V]
- **Titel-Assistent:** Zuerst wählt man den Ort (am Anfang, vor oder auf dem Clip, am Ende), dann Text, Animation, Schrift und Farbe. [V]
- **AutoMovie:** schneidet automatisch mit einem Stil (z. B. „Music Video“, „Old Movie“). [V]
- **Export-Assistent:** Ziel (Arbeitsplatz, CD, E-Mail, Web, DV-Kamera) und Qualitätsprofil. [V] Im Nachbau wird daraus Datei plus Profil.

Quelle: https://en.wikipedia.org/wiki/Windows_Movie_Maker sowie die MSDN-Artikel unten. Die exakten UI-Texte sind ohne Referenzinstallation nicht prüfbar (§8). [E]

## 3. Katalog 2.x (Referenz)

### Übergänge: 60 [V]
- **Einfach (9):** Bars, Checkerboard, Dissolve, Fade, Iris, Pixelate, Wheel (4 Speichen), 6 Wipes (Wide/Normal/Narrow × Down/Right; `GradientSize` 0.6/0.5/0.2)
- **SMPTE-Wipes (34)**, nach `MaskNum`:
  - Reveal Right/Down (1, 2)
  - Inset ×4 (3–6)
  - Split V/H (21, 22)
  - Diagonal Down Right (41)
  - Bow Tie V/H (43, 44)
  - Diagonal Cross/Box Out (47, 48)
  - Filled V ×4 (61–64)
  - Zig Zag V/H (73, 74)
  - Rectangle (101), Diamond (102)
  - Circle / Circles (119, Circles mit Replicate 8×6)
  - Star / Stars (128)
  - Heart (130), Key Hole (131), Eye (122)
  - Sweep Diagonal/Horizontal (226, 228)
  - Fan In (231)
  - Swinging Door (253)
  - Windshield ×2 (262, 263)
- **3D/Partikel, WMTFX (13):** Flip, Slide Up, Slide Up Center, Roll, Spin Out, Page Curl ×2, Shatter ×4, Whirlwind, Shrink

### Videoeffekte: 30 im XML, im UI vermutlich 28 [V]
- Sepia, Negative*, Posterize, Threshold, Hue Cycle, Grayscale
- Brightness ±
- Blur, Pixelate
- Film Age Old/Older/Oldest (`Age` 30/60/90)
- Film Grain, Smudge Stick, Graphic Pen*, Watercolor
- Fade In/Out from/to Black/White
- Ease In/Out, Mirror H/V, Rotate 90/180/270
- Speed Up Double / Slow Down Half

\* Möglicherweise in 2.1 nicht sichtbar. Muss an einer echten Installation geprüft werden. [E]

### Titel und Abspann: 43 [V]
- **Eine Zeile (25):** u. a. Fly In, Typewriter, Ticker Tape, News Banner, Scroll Perspective, Flashing, Zoom In/Out, Spin In/Out, Video In Text, Wow!, Paint Drip, Basic Title, Subtitle
- **Zwei Zeilen (9):** u. a. Fade In and Out, Fly In Fades, Exploding Outline, Sports Scoreboard, Newspaper
- **Abspann (9):** Scroll Up Stacked, Scroll Up Side-by-Side, Zoom In, Fade In and Out, Mirror, Exploding, Fly In L/R, Video Left, Video Top
- **Aufbau einer Animation:** drei Phasen, Entrance → Main → Exit. Jede Phase hat Effect, Position, Zoom und VideoRect. Mögliche Effektwerte: Fade, Blur, OverZoom, Rotate, TypeWriter, FadeEllipse, FadeWipe, BounceWipe, Perspective, SpotLight, Flashing, Inverse, Multi, Mirror, OutlineExplode. Dazu kommen Banner-Typen und -Farben.

### Zusätzlich in 6.0 [V]
- 3 neue Übergänge: Dissolve Rough/Vertical, Whirlwind from top. Der 6.0-Katalog zählt 63 Übergänge.
- 49 Effekte, darunter 17 Pan/Zoom-Effekte, Spin 360, 3D Ripple, Sharpen, Dream, Edge Detection. Smudge Stick, Graphic Pen und Negative fallen weg.

## 4. Original-Technik → Nachbau

| Original (2.x) | Nachbau |
|---|---|
| DirectX Transforms (COM, `IDXEffect`) in DirectShow, eine XML-Datei je Effekt mit GUID und `<Param>` | Je Effekt ein GLSL-ES-3.0-Shader. Parameter werden aus unserem eigenen Katalog (JSON) gelesen, der 1:1 aus den Original-XMLs übernommen wird. |
| SMPTE-Wipes (`MaskNum`, `BorderSoftness`, `ReplicateX/Y`) | Geometrie nach der W3C-SMIL-Tabelle: https://www.w3.org/TR/SMIL3/smil-transitions.html. Soft-Edge und Replicate selbst implementieren. |
| WMTFX `Simple3D` (Move/Rotate/Scale/PageCurl, Kamera) | Kleiner 3D-Quad-Renderer mit Vertex-Shader |
| WMTFX `ParticleSystem` (Shatter, Whirlwind) | Eigenes Partikelsystem. Eine offene Vorlage gibt es nicht. |
| Film Aging (`Age` → 10 Einzelparameter) | Shader mit Rauschen, Kratzern, Flimmern, Jitter, Posterize und Vignette |
| Malfilter (`EffectID` 16 FilmGrain, 40 Watercolor …) | Je Filter ein eigener Shader (Watercolor z. B. als Kuwahara) |
| Titel-Engine (TitleStandard/MultiTitles/CreditStandard) | Eigene Text-Animations-Engine nach dem Phasenmodell Entrance/Main/Exit |

- **Hilfsquelle gl-transitions** (MIT, Lizenz pro Datei prüfen): Fade, Dissolve, Pixelize, Heart, StarWipe, BowTie, Swirl, InvertedPageCurl … liefern einen schnellen Start. Die Geometrie weicht aber ab, für echte Treue müssen die WMM-Parameter selbst umgesetzt werden.
- **Zeitkurven:** `ExponentialProgressDuration/Scale` aus WMTFX übernehmen. Die Standarddauer eines Übergangs ist vermutlich 1,25 s [E, prüfen].

## 5. Tech-Stack

> **Entschieden in [ADR 0001](../adr/0001-architektur.md):** Web-App und FFmpeg-Backend.
> Die frühere Bewertung (KMP/Compose, Flutter, Qt, Rust-Core) galt für das Ziel
> Linux → Android und ist überholt. Sie steht in der Git-Historie dieser Datei.

### Pipeline
```
apps/web (Browser)                         backend/ (Python, FastAPI)
 ├─ Movie-Maker-UI (React, Y2K-Theme)       ├─ Projektmodell (Pydantic) ─► OpenAPI ─► TS-Typen
 ├─ Vorschau: <video>/Frames ─► WebGL2      ├─ Medien-Import: ffprobe, Thumbnails, Proxies
 │            └─ packages/shaders           ├─ Export: ffmpeg decode ─► headless GL (EGL)
 └─ Projekt-JSON ◄──────── REST ──────────► │          └─ packages/shaders ─► ffmpeg encode
                                            └─ Audio-Mix (amix, Pegel Audio ↔ Musik)
packages/catalog: Effekt-/Übergangs-/Titelkatalog, gemeinsam genutzt
```

### FFmpeg als schneller Zwischenschritt
`xfade` (ab FFmpeg 4.3, in 7.x deutlich erweitert) deckt mehrere 2.x-Übergänge
näherungsweise ab [V: https://ffmpeg.org/ffmpeg-filters.html#xfade]:

| WMM 2.x | xfade | Treue [E] |
|---|---|---|
| Fade / Dissolve | `fade` / `dissolve` | gut / mittel |
| Wipe Right/Down | `wiperight`/`wipedown` (ohne weiche Kante) | mittel |
| Iris / Circle | `circleopen` | mittel |
| Pixelate | `pixelize` | mittel |
| Reveal Right/Down | `slideright`/`slidedown` | mittel |
| Split V/H | `vertopen`/`horzopen` | mittel |
| Wheel, Star, Heart, 3D, Partikel | – (nur `custom`-Expression oder GL) | – |

Effekte, die näherungsweise per Filter gehen: Grayscale (`hue=s=0`),
Sepia (`colorchannelmixer`), Brightness (`eq`), Blur (`gblur`), Mirror
(`hflip`/`vflip`), Rotate (`transpose`), Fade from/to Black/White (`fade`),
Speed (`setpts`/`atempo`). Titel: `drawtext` (ohne die Phasen-Animationen).

### Risiken
- WebGL2 und Desktop-GL unterscheiden sich (Präzision, `#version`-Header, Texture-Upload). Golden-Frame-Tests vergleichen Browser und Backend. [E]
- Export ohne GPU braucht Mesa llvmpipe und ist langsam, aber für kleine Projekte reicht es. [E]
- Eine framegenaue Vorschau im Browser ist mit `<video>` schwierig. Später braucht es WebCodecs oder Backend-Proxies. [E]
- Lokal ist nur FFmpeg 4.3 vorhanden. `xfade` gibt es dort, aber mit wenigen Modi. Ziel ist FFmpeg ≥ 7. [V]

## 6. MVP-Umfang (Web)

**Drin:**
- Import von Video, Fotos (mit Standarddauer) und Musik
- Storyboard per Drag & Drop, einfache Timeline mit Trimmen und Teilen
- Movie-Maker-Layout: Aufgabenbereich (Aufnehmen/Bearbeiten/Fertigstellen), Sammlungen, Vorschaumonitor, Storyboard/Timeline umschaltbar
- ~5 Übergänge (Fade, Dissolve, Wipe, Circle, Pixelate)
- ~5 Effekte (Grayscale, Sepia, Film Age Old, Blur, Fade In/Out from Black)
- Titel/Abspann mit 3 Animationen (Basic Title, Fly In, Scroll Up Stacked)
- Musikspur mit dem Pegelregler Audio ↔ Musik
- Export als MP4 (H.264/AAC), Projekt speichern und laden

**Später:**
- Restlicher Katalog: 3D, Partikel, alle Titel
- Narration, AutoMovie
- Geschwindigkeitseffekte, Pan/Zoom (6.0)

## 7. Rechtliches (keine Rechtsberatung)

- **Microsoft-Marken:** Die Richtlinien verbieten Microsoft-Marken im Produktnamen. „Windows“ ist eine Marke, „Movie Maker“ ist schwach, aber verwechslungsgefährlich. [V/E] Quelle: https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks
- **Nicht übernehmen:** Icons, Bitmaps, Sounds, Hilfetexte, `Parity.fx` und Binärdateien von Microsoft.
- **Unkritisch:** Workflow, Bedienkonzept und eigene Effekt-Implementierungen nach den dokumentierten Parametern. [E]
- **Die XMLs in `sources/`** sind Microsoft- bzw. Community-Material und nur Referenz für die Entwicklung. **Nicht mit der App ausliefern.** Unser eigener Katalog wird daraus abgeleitet und neu geschrieben.
- **FFmpeg:** LGPL nur ohne `--enable-gpl`/`nonfree` und mit dynamischem Linken. libx264 macht die App zur GPL. [V] Für die Lizenz der eigenen App entscheiden: GPL (dann ist x264 ok) oder proprietär (dann openh264 oder Hardware-Encoder).
- **gl-transitions:** Lizenzzeile pro Datei prüfen.

## 8. Offene Fragen

1. ~~Name~~ → entschieden: **moviemakerY2K** (2026-10-02). Hinweis: Enthält „Movie Maker“; vor öffentlicher Veröffentlichung Markenlage kurz prüfen.
2. ~~Lizenz~~ → entschieden: **GPL / Open Source**. FFmpeg mit libx264 ist damit zulässig.
3. ~~Optik~~ → entschieden: **eigener Y2K-Look**, an XP/Luna angelehnt, ohne Original-Assets oder pixelgenaue Kopie.
4. ~~Referenzinstallation~~ → **keine vorhanden.** Der Nachbau richtet sich nur nach den dokumentierten Parametern (XML, SMIL). Golden-Frame-Tests prüfen nur die Konsistenz unserer eigenen Engines, nicht die Treue zum Original. Offen bleiben die exakten UI-Namen, die Zahl der Effekte in 2.1 und die Standarddauern (Annahme: 1,25 s).

## Quellen (Auswahl)

- MSDN WMM2 Custom Effects/Transitions: https://learn.microsoft.com/en-us/previous-versions/ms867186(v=msdn.10)
- Vista-SDK: https://learn.microsoft.com/en-us/previous-versions/windows/desktop/wmmdvdm/built-in-transitions · …/built-in-effects · …/changes-to-the-xml-schema
- Titel-XML (Rehan): https://www.rehanfx.org/customtctext.htm (archiviert)
- FX-Archiv: https://archive.org/details/FXArchiveWMM
- SMIL-Wipes: https://www.w3.org/TR/SMIL3/smil-transitions.html
- gl-transitions: https://github.com/gl-transitions/gl-transitions
- libmswmm (liest .MSWMM): https://github.com/Jeinzi/libmswmm
- Media3 1.9: https://android-developers.googleblog.com/2025/12/media3-190-whats-new.html
- ffmpeg-kit eingestellt: https://github.com/arthenica/ffmpeg-kit
- FFmpeg-Lizenz: https://ffmpeg.org/legal.html
