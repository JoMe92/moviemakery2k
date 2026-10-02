## Why

Bilder plus Musik ist der klassische Movie-Maker-Anwendungsfall. Bisher kann
moviemakerY2K nur Bilder importieren; der exportierte Film hat eine stumme
Tonspur, und „Audio oder Musik importieren“ im Aufgabenbereich ist
deaktiviert. Die Lückenanalyse aus `add-movie-export` hat Musik als nächste
Priorität nach dem Export festgelegt; der Export ist dafür vorbereitet (die
Tonspur ist ein eigener, austauschbarer FFmpeg-Eingang).

## What Changes

- **Audio importieren:** MP3, WAV, M4A/AAC, OGG (Vorbis/Opus) und FLAC über
  denselben Import wie Bilder (Dialog, Drag & Drop, Aufgabenbereich „Audio
  oder Musik importieren“). Das Backend prüft den Inhalt mit ffprobe, legt eine
  einheitliche Vorschaufassung (AAC/M4A) und Wellenform-Daten an. Audio
  erscheint in der Sammlung mit eigenem Symbol, Name und Dauer.
- **Musikspur im Projekt:** eine Liste von Musikstücken, die nacheinander ab
  0:00 laufen. Je Stück: Anfang und Ende kürzen, Lautstärke (0–200 %),
  Einblenden und Ausblenden (je 1 s). Ist die Musik länger als der Film, wird
  sie am Filmende abgeschnitten und ausgeblendet; ist sie kürzer, folgt Stille.
  **Schema-Version 2** des Projekts mit Migration von Version 1.
- **Musikleiste unter dem Bildstreifen:** Stücke als Blöcke mit Name, Dauer und
  Wellenform; Audio per Drag & Drop oder Doppelklick hinzufügen, umsortieren,
  entfernen; Kontextmenü mit Lautstärke, Einblenden, Ausblenden, Kürzen.
- **„Film an Musik anpassen“:** verteilt die Bilddauern so, dass der Film so
  lang ist wie die Musik.
- **Musik in der Vorschau:** Der Player spielt die Musik synchron zu Bildern
  und Übergängen (Web Audio als Taktgeber).
- **Musik im Export:** Der Film enthält die gemischte Musik statt Stille, in
  derselben Länge wie das Video.

## Capabilities

### New Capabilities

- `music-track`: Musikspur des Projekts (Stücke, Reihenfolge, Kürzen,
  Lautstärke, Blenden, Abschneiden am Filmende), Musikleiste und „Film an Musik
  anpassen“

### Modified Capabilities

- `media-library`: Audio importieren, prüfen und anzeigen; Löschen entfernt
  auch Musikstücke
- `slideshow-project`: Projektmodell Version 2 mit Musikspur
- `preview-player`: Musik in der Wiedergabe
- `movie-export`: Tonspur aus der Musikspur statt Stille
- `app-shell`: „Audio oder Musik importieren“ wird funktional

## Nicht-Ziele

- Zeitachsen-Ansicht und frei platzierbare Audio-Clips (Startzeit, Überlappung).
- Ton von Videoclips, Erzählung (Mikrofon), Pegelregler Ton ↔ Musik (es gibt
  noch keinen Clip-Ton).
- Einstellbare Blenddauern, Überblenden zwischen Musikstücken, Effekte auf Audio.
- Audioformate außerhalb der genannten, DRM-geschützte Dateien.
- Lautheitsnormalisierung.
