## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Validierung und Grenzen im Backend
Das Backend MUST jede Datei anhand ihres tatsächlichen Inhalts als Bild oder
Audio prüfen (nicht nur anhand von Endung oder Content-Type); Audio MUST
mindestens eine dekodierbare Tonspur in einem der unterstützten Formate
haben. Es MUST Bilddateien über 25 MB, Bilder über 40 Megapixel,
Audiodateien über 100 MB, Audio über 15 Minuten Dauer und mehr als 50
Dateien pro Anfrage ablehnen, jeweils mit einem Fehlercode und einer
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

#### Scenario: Video statt Audio
- **WHEN** eine MP4-Datei ohne Tonspur mit der Endung `.m4a` hochgeladen wird
- **THEN** antwortet das Backend für diese Datei mit `media.noAudioStream`

#### Scenario: Pfad im Dateinamen
- **WHEN** eine Datei mit dem Namen `../../etc/passwd.png` hochgeladen wird
- **THEN** wird außerhalb des Datenverzeichnisses nichts geschrieben, und der
  Name dient nur als Anzeigename

### Requirement: Sammlung anzeigen und Medien löschen
Die Sammlung „Meine Bilder“ MUST alle importierten Bilder und die Sammlung
„Meine Musik“ alles importierte Audio als Kacheln in Importreihenfolge
zeigen. Ein Benutzer MUST ein Medium aus der Sammlung löschen können
(Kontextmenü oder Entf bei fokussierter Kachel, mit Rückfrage). Beim Löschen
MUST ein Bild auch aus dem Bildstreifen und ein Audio-Medium auch aus der
Musikspur entfernt werden. Solange ein wartender oder laufender Export das
Medium verwendet, MUST das Löschen abgelehnt werden (Code
`media.inUseByExport`); Sammlung, Bildstreifen und Musikspur MUST dann
unverändert bleiben.

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
- **WHEN** ein Benutzer während eines laufenden Exports ein Bild löschen will,
  das im exportierten Projekt vorkommt, und die Rückfrage bestätigt
- **THEN** bleibt das Bild in Sammlung und Bildstreifen, die Oberfläche
  meldet in der gewählten Sprache, dass es gerade exportiert wird, und der
  Export läuft unverändert weiter
