## Context

Stand: `develop` nach `add-project-management` (archiviert gemeinsam mit den
übrigen acht geplanten Changes; siehe tasks.md dort für die Reihenfolge).
`add-mobile-layout`/`add-mobile-delivery` laufen noch auf eigenen,
unintegrierten Branches und sind hier nicht Grundlage.

Medien werden heute in `backend/src/mmy_backend/media.py` einheitlich
verwaltet (`media.json`-Index, `media/<id>/original.<ext>` plus
Ableitungen). `MediaItem` ist ein `Literal["image"] | Literal["audio"]`
Discriminated Union; Erkennung geht nach Inhalt, nie nach Dateiname oder
Content-Type: zuerst Pillow (Bild), dann ffprobe (Audio). Grenzen:
Bilder 25 MB/40 Megapixel, Audio 100 MB/15 Minuten, höchstens 50 Dateien pro
Anfrage (kind-unabhängig, bleibt unverändert). Audio bekommt eine
normalisierte Vorschaufassung (AAC/M4A) plus Wellenform aus einem
FFmpeg-Lauf; Bilder bekommen Thumbnail und Vorschaubild mit EXIF-Rotation.
Löschen eines Mediums prüft `media.inUseByExport`, sofern es im Projekt
(Bildstreifen bzw. Musikspur) vorkommt.

Der Vorschau-Player (`apps/web/src/render/Renderer.ts`, `imageCache.ts`,
`Player.tsx`) kennt als Bildquelle nur geladene Standbilder;
`timeline.ts`/`backend/.../render/timeline.py` kennen nur die Segmenttypen
`still` und `transition`; der Export (`render/frames.py`) rendert pro
Still-Segment ein JPEG. Video-Wiedergabe und -Export sind der Umbau, den die
folgende Timeline-Change ohnehin vornimmt (Architektur-Beratung,
2026-10-03).

Vorgaben des Product Owners (2026-10-03):

- Zweite von neun geplanten Changes aus der WMM-2.x-Lückenanalyse.
- Scope bewusst auf Import begrenzt (Empfehlung der Architektur-Beratung
  übernommen): kein Ziehen in den Bildstreifen, keine Wiedergabe, kein
  Export in dieser Change.

Standardwerte, vom Planning Agent festgelegt (im PR änderbar): Video
höchstens 500 MB und 10 Minuten Laufzeit; Posterbild-Zeitpunkt 1 s bzw. die
halbe Laufzeit bei kürzeren Videos; Codec-Allowlist mindestens `h264`,
weitere (`hevc`, `vp9`, `av1`) je nach Dekoder-Verfügbarkeit im
pixi-FFmpeg-Build zu verifizieren (wie bei `_AUDIO_CODECS`).

## Goals / Non-Goals

**Goals:** Videodateien lassen sich zuverlässig erkennen, validieren und
dauerhaft speichern; sie erscheinen mit Posterbild und Dauer in einer
eigenen Sammlung; das bestehende Bild-/Audio-Verhalten bleibt unverändert.

**Non-Goals:** siehe proposal.md.

## Decisions

### D1 – Erkennung und Datenmodell
Die Erkennungsreihenfolge erweitert sich um einen dritten Zweig: Pillow
(Bild) → ffprobe. Liefert ffprobe mindestens einen Videostream in einem
unterstützten Codec, gilt die Datei als `kind: "video"` — unabhängig davon,
ob sie zusätzlich eine Tonspur hat (ein Video mit Ton ist kein Audio-Medium
in dieser Anwendung). Erst wenn kein Videostream vorliegt, gilt die
bisherige Audio-Prüfung. `VideoItem` (neu, analog `AudioItem`): `id`,
`kind: "video"`, `filename`, `duration` (Sekunden, aus der Dekodierung wie
bei Audio), `width`/`height` (nach Rotation), `codec`, `created_at`,
`poster_url`.

### D2 – Validierungsgrenzen
Video MUST höchstens 500 MB groß sein und höchstens 10 Minuten Laufzeit
haben, sonst Fehlercode `media.videoTooLong` (Laufzeit) bzw. die bestehende
`media.tooLarge`-Prüfung (Größe, kind-unabhängig bereits vorhanden). Ein
Video ohne dekodierbaren Videostream in einem unterstützten Codec MUST mit
`media.noVideoStream` abgelehnt werden (neuer Code, analog
`media.noAudioStream`). Die 50-Dateien-Grenze pro Anfrage gilt unverändert
für alle drei Medienarten zusammen.

### D3 – Posterbild
Ein FFmpeg-Lauf extrahiert genau ein Frame als JPEG (Qualität 90, wie das
Bild-Vorschaubild): bei 1 Sekunde Laufzeit, oder bei der Hälfte der Laufzeit,
wenn das Video kürzer als 2 Sekunden ist. Eine vorhandene
Dreh-Metadatung (Rotation-Side-Data) MUST dabei berücksichtigt werden, wie
die EXIF-Rotation bei Bildern — gemeldete Breite/Höhe und das Posterbild
gelten nach Rotation. Das Original bleibt unverändert erhalten; es gibt
keine normalisierte Video-Zwischenfassung (anders als bei Audio) — das
entscheidet die Timeline-Change, die den Player-Umbau vornimmt.

### D4 – Sammlung und Aufgabenbereich
„Meine Videos“ ist eine dritte Kachel-Gruppe neben „Meine Bilder“ und
„Meine Musik“, in Importreihenfolge, mit Posterbild, Dateiname und Dauer
(`mm:ss`, wie bei Audio). Der Aufgabenbereich-Eintrag „Video importieren“
öffnet einen auf Videoformate gefilterten Dateiauswahldialog; Datei → „In
Sammlungen importieren…“ und Drag & Drop auf den Sammlungsbereich
akzeptieren weiterhin alle drei Medienarten gemischt.

### D5 – Löschen
Ein Video lässt sich wie Bilder und Audio löschen (Kontextmenü oder Entf bei
fokussierter Kachel, mit Rückfrage). Da ein Video in dieser Change in keinem
Projekt-Bestandteil (Bildstreifen, Musikspur) vorkommen kann, MUST keine
`media.inUseByExport`-Prüfung für Video laufen — das Löschen entfernt es
immer sofort aus der Sammlung.
