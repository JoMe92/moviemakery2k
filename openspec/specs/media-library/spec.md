# media-library Specification

## Purpose
Importieren, Speichern und Anzeigen der Medien, aus denen ein Film gebaut
wird — Bilder, Videos und Audio: Upload ins Backend, abgeleitete Thumbnails,
Vorschaubilder und Posterbilder, Anzeige als Kacheln in den Sammlungen.

## Requirements

### Requirement: Bilder importieren
Benutzer MUST Bilder im Format JPEG, PNG oder WebP importieren können, sowohl
über einen Dateiauswahldialog (Mehrfachauswahl) als auch per Drag & Drop von
Dateien auf den Sammlungsbereich. Während des Imports MUST ein Fortschritt
sichtbar sein. Importierte Bilder MUST dauerhaft im Backend gespeichert werden
und nach einem Neuladen der Seite weiter in der Sammlung stehen.

#### Scenario: Mehrere Bilder per Dialog
- **WHEN** ein Benutzer „Bilder importieren“ wählt und drei JPEG-Dateien
  auswählt
- **THEN** erscheinen drei neue Kacheln mit Vorschaubild und Dateinamen in der
  Sammlung „Meine Bilder“, und sie sind nach einem Neuladen weiterhin da

#### Scenario: Drag & Drop vom Desktop
- **WHEN** ein Benutzer zwei PNG-Dateien aus dem Dateimanager auf den
  Sammlungsbereich zieht
- **THEN** werden beide importiert und als Kacheln angezeigt

#### Scenario: Ungültige Datei
- **WHEN** ein Benutzer eine Textdatei mit der Endung `.jpg` importiert
- **THEN** lehnt das Backend sie ab, die Anwendung meldet den Dateinamen als
  nicht unterstütztes Bild, und die übrigen Dateien desselben Imports werden
  trotzdem importiert

### Requirement: Validierung und Grenzen im Backend
Das Backend MUST jede Datei anhand ihres tatsächlichen Inhalts als Bild,
Video oder Audio prüfen (nicht nur anhand von Endung oder Content-Type).
Enthält eine Datei mindestens einen dekodierbaren Videostream in einem
unterstützten Codec, MUST sie als Video gelten, unabhängig davon, ob sie
zusätzlich eine Tonspur hat. Nur wenn kein Videostream vorliegt, gilt die
bisherige Audio-Prüfung: Audio MUST mindestens eine dekodierbare Tonspur in
einem der unterstützten Formate haben. Es MUST Bilddateien über 25 MB,
Bilder über 40 Megapixel, Audiodateien über 100 MB, Audio über 15 Minuten
Dauer, Videodateien über 500 MB, Video über 10 Minuten Dauer und mehr als
50 Dateien pro Anfrage ablehnen, jeweils mit einem Fehlercode und einer
verständlichen Fehlermeldung pro Datei. Hochgeladene Dateinamen MUST NOT als
Speicherpfad verwendet werden.

#### Scenario: Zu großes Bild
- **WHEN** eine Bilddatei mit 30 MB hochgeladen wird
- **THEN** antwortet das Backend für diese Datei mit einem Fehler „zu groß“,
  und es wird nichts gespeichert

#### Scenario: Zu lange Musik
- **WHEN** eine MP3-Datei mit 20 Minuten Dauer hochgeladen wird
- **THEN** antwortet das Backend für diese Datei mit dem Fehler
  `media.audioTooLong`, und es wird nichts gespeichert

#### Scenario: Zu langes Video
- **WHEN** eine MP4-Datei mit 15 Minuten Laufzeit hochgeladen wird
- **THEN** antwortet das Backend für diese Datei mit dem Fehler
  `media.videoTooLong`, und es wird nichts gespeichert

#### Scenario: Video statt Audio
- **WHEN** eine MP4-Datei mit einem Videostream, aber ohne Tonspur, mit der
  Endung `.m4a` hochgeladen wird
- **THEN** wird sie anhand des Videostreams als Video erkannt und
  importiert (nicht als Audio abgelehnt); sie erscheint mit Posterbild und
  Dauer in „Meine Videos“

#### Scenario: Weder Video- noch Tonspur
- **WHEN** eine Datei ohne dekodierbaren Video- oder Audiostream mit der
  Endung `.m4a` hochgeladen wird
- **THEN** antwortet das Backend für diese Datei mit `media.noAudioStream`

#### Scenario: Pfad im Dateinamen
- **WHEN** eine Datei mit dem Namen `../../etc/passwd.png` hochgeladen wird
- **THEN** wird außerhalb des Datenverzeichnisses nichts geschrieben, und der
  Name dient nur als Anzeigename

### Requirement: Abgeleitete Bilder
Für jedes importierte Bild MUST das Backend ein Thumbnail (passt in 160×120)
und ein Vorschaubild (längste Kante höchstens 1920 Pixel) bereitstellen. Die
EXIF-Ausrichtung MUST dabei angewendet werden, und das Original bleibt
erhalten. Jedes Medium MUST eine Kennung, den Original-Dateinamen, Breite und
Höhe (nach Ausrichtung) sowie die URLs von Thumbnail und Vorschaubild haben.

#### Scenario: Hochkant-Foto mit EXIF-Rotation
- **WHEN** ein Foto importiert wird, das quer gespeichert ist und laut EXIF
  um 90° gedreht angezeigt werden soll
- **THEN** werden Thumbnail und Vorschaubild hochkant geliefert, und die
  gemeldete Breite ist kleiner als die Höhe

### Requirement: Sammlung anzeigen und Medien löschen
Die Sammlung „Meine Bilder“ MUST alle importierten Bilder, „Meine Musik“
MUST alles importierte Audio und „Meine Videos“ MUST alle importierten
Videos als Kacheln in Importreihenfolge zeigen. Ein Benutzer MUST ein
Medium aus der Sammlung löschen können (Kontextmenü oder Entf bei
fokussierter Kachel, mit Rückfrage). Beim Löschen MUST ein Bild auch aus dem
Bildstreifen und ein Audio-Medium auch aus der Musikspur entfernt werden;
ein Video kann in keinem Projekt-Bestandteil vorkommen und wird daher immer
sofort gelöscht. Solange ein wartender oder laufender Export ein Bild oder
Audio-Medium verwendet, MUST das Löschen abgelehnt werden (Code
`media.inUseByExport`); diese Prüfung MUST NOT für Video laufen.

#### Scenario: Bild löschen, das im Bildstreifen verwendet wird
- **WHEN** ein Benutzer ein Bild löscht, das zweimal im Bildstreifen
  vorkommt, und die Rückfrage bestätigt
- **THEN** verschwindet es aus der Sammlung und an beiden Stellen aus dem
  Bildstreifen, und die eingehenden Übergänge dieser Elemente entfallen

#### Scenario: Musik löschen, die in der Musikspur verwendet wird
- **WHEN** ein Benutzer ein Audio-Medium löscht, das in der Musikspur
  vorkommt, und die Rückfrage bestätigt
- **THEN** verschwindet es aus „Meine Musik“ und aus der Musikspur, und die
  folgenden Stücke rücken nach

#### Scenario: Bild löschen, das ein laufender Export verwendet
- **WHEN** ein Benutzer während eines laufenden Exports ein Bild löschen
  will, das im exportierten Projekt vorkommt, und die Rückfrage bestätigt
- **THEN** bleibt das Bild in Sammlung und Bildstreifen, die Oberfläche
  meldet in der gewählten Sprache, dass es gerade exportiert wird, und der
  Export läuft unverändert weiter

#### Scenario: Video löschen
- **WHEN** ein Benutzer ein Video aus „Meine Videos“ löscht und die
  Rückfrage bestätigt
- **THEN** verschwindet es sofort aus der Sammlung, unabhängig von einem
  laufenden Export

### Requirement: Audio importieren
Benutzer MUST Audiodateien im Format MP3, WAV, M4A/AAC, OGG (Vorbis, Opus)
und FLAC über denselben Dateiauswahldialog und dasselbe Drag & Drop wie Bilder
importieren können; ein Import MAY Bilder und Audio mischen. Importiertes
Audio MUST dauerhaft im Backend gespeichert werden und in der Sammlung
„Meine Musik“ mit eigenem Symbol, Dateinamen und Dauer erscheinen.

#### Scenario: Musik importieren
- **WHEN** ein Benutzer „Audio oder Musik importieren“ wählt und eine
  MP3-Datei mit 3:12 auswählt
- **THEN** erscheint in der Sammlung „Meine Musik“ eine Kachel mit Audiosymbol,
  Dateiname und „3:12“, und sie ist nach einem Neuladen weiterhin da

#### Scenario: Gemischter Import
- **WHEN** ein Benutzer zwei JPEG-Dateien und eine FLAC-Datei gleichzeitig
  auf den Sammlungsbereich zieht
- **THEN** stehen die Bilder in „Meine Bilder“ und die FLAC-Datei in
  „Meine Musik“

### Requirement: Abgeleitetes Audio
Für jede importierte Audiodatei MUST das Backend eine einheitliche
Vorschaufassung (AAC in M4A, 48 kHz, Stereo) und Wellenform-Daten
(50 Spitzenwerte pro Sekunde) bereitstellen; das Original bleibt erhalten und
dient dem Export. Jedes Audio-Medium MUST eine Kennung, die Art `audio`, den
Original-Dateinamen, die dekodierte Dauer, Abtastrate, Kanalzahl und Codec
sowie die URLs von Vorschaufassung und Wellenform haben. Bestehende Medien
ohne Art MUST als Bilder gelten.

#### Scenario: WAV mit 44,1 kHz Mono
- **WHEN** eine Mono-WAV-Datei mit 44,1 kHz importiert wird
- **THEN** meldet das Medium 44100 Hz und einen Kanal, und die
  Vorschaufassung ist AAC mit 48 kHz in Stereo

### Requirement: Video importieren
Benutzer MUST Videodateien über denselben Dateiauswahldialog und dasselbe
Drag & Drop wie Bilder und Audio importieren können, zusätzlich über einen
eigenen, auf Videoformate gefilterten Dateiauswahldialog („Video
importieren“ im Aufgabenbereich, Spec app-shell). Ein Import MAY Bilder,
Audio und Video mischen. Importierte Videos MUST dauerhaft im Backend
gespeichert werden und in der Sammlung „Meine Videos“ mit Posterbild,
Dateiname und Dauer erscheinen.

#### Scenario: Video importieren
- **WHEN** ein Benutzer „Video importieren“ wählt und eine MP4-Datei mit
  1:45 auswählt
- **THEN** erscheint in der Sammlung „Meine Videos“ eine Kachel mit
  Posterbild, Dateiname und „1:45“, und sie ist nach einem Neuladen
  weiterhin da

#### Scenario: Gemischter Import aller drei Arten
- **WHEN** ein Benutzer zwei JPEG-Dateien, eine FLAC-Datei und eine
  MP4-Datei gleichzeitig auf den Sammlungsbereich zieht
- **THEN** stehen die Bilder in „Meine Bilder“, die FLAC-Datei in „Meine
  Musik“ und die MP4-Datei in „Meine Videos“

### Requirement: Abgeleitetes Video
Für jede importierte Videodatei MUST das Backend ein einzelnes Posterbild
(JPEG, Qualität 90) als Vorschau bereitstellen: ein Frame bei 1 Sekunde
Laufzeit, oder bei der Hälfte der Laufzeit, wenn das Video kürzer als
2 Sekunden ist. Eine vorhandene Dreh-Metadatung MUST dabei berücksichtigt
werden, wie die EXIF-Rotation bei Bildern. Das Original bleibt unverändert
erhalten; es gibt keine normalisierte Video-Zwischenfassung. Jedes
Video-Medium MUST eine Kennung, die Art `video`, den Original-Dateinamen,
die dekodierte Dauer, Breite und Höhe (nach Rotation) und die URL des
Posterbilds haben.

#### Scenario: Gedrehtes Hochformat-Video
- **WHEN** ein im Querformat gespeichertes Video importiert wird, das laut
  Dreh-Metadatung um 90° gedreht angezeigt werden soll
- **THEN** wird das Posterbild hochkant geliefert, und die gemeldete Breite
  ist kleiner als die Höhe

#### Scenario: Kurzes Video
- **WHEN** ein 1,2 Sekunden langes Video importiert wird
- **THEN** stammt das Posterbild aus der Hälfte der Laufzeit (0,6 s), nicht
  aus Sekunde 1
