## Purpose

Importieren, Speichern und Anzeigen der Bilder, aus denen eine Diashow
gebaut wird: Upload ins Backend, abgeleitete Thumbnails und Vorschaubilder,
Anzeige als Kacheln in der Sammlung.

## ADDED Requirements

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
Das Backend MUST jede Datei anhand ihres tatsächlichen Inhalts als Bild
prüfen (nicht nur anhand von Endung oder Content-Type). Es MUST Dateien über
25 MB, Bilder über 40 Megapixel und mehr als 50 Dateien pro Anfrage
ablehnen, jeweils mit einer verständlichen Fehlermeldung pro Datei.
Hochgeladene Dateinamen MUST NOT als Speicherpfad verwendet werden.

#### Scenario: Zu großes Bild
- **WHEN** eine Datei mit 30 MB hochgeladen wird
- **THEN** antwortet das Backend für diese Datei mit einem Fehler „zu groß“,
  und es wird nichts gespeichert

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
Die Sammlung „Meine Bilder“ MUST alle importierten Bilder als Kacheln in
Importreihenfolge zeigen. Ein Benutzer MUST ein Bild aus der Sammlung
löschen können (Kontextmenü oder Entf bei fokussierter Kachel, mit
Rückfrage). Beim Löschen MUST das Bild auch aus dem Bildstreifen entfernt
werden.

#### Scenario: Bild löschen, das im Bildstreifen verwendet wird
- **WHEN** ein Benutzer ein Bild löscht, das zweimal im Bildstreifen
  vorkommt, und die Rückfrage bestätigt
- **THEN** verschwindet es aus der Sammlung und an beiden Stellen aus dem
  Bildstreifen, und die eingehenden Übergänge dieser Elemente entfallen
