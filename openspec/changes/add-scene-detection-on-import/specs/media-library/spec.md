## MODIFIED Requirements

### Requirement: Video importieren
Benutzer MUST Videodateien über denselben Dateiauswahldialog und dasselbe
Drag & Drop wie Bilder und Audio importieren können, zusätzlich über einen
eigenen, auf Videoformate gefilterten Dateiauswahldialog („Video
importieren“ im Aufgabenbereich, Spec app-shell). Ein Import MAY Bilder,
Audio und Video mischen. Importierte Videos MUST dauerhaft im Backend
gespeichert werden und in der Sammlung „Meine Videos“ mit Posterbild,
Dateiname und Dauer erscheinen. Eine importierte Videodatei MUST dabei in
ihre Szenen zerlegt werden und je Szene ein eigenes Medium liefern (Spec
scene-detection); je nach Material und Einstellung ist das genau eines oder
mehrere. Jedes Video-Medium MUST die Kennung seines Fensters auf der
gespeicherten Datei tragen (`sourceIn` in Sekunden) und MUST einen Zustand
(`detecting`, `ready`) haben.

#### Scenario: Video importieren
- **WHEN** ein Benutzer „Video importieren“ wählt und eine MP4-Datei mit
  1:45 ohne erkennbaren Szenenwechsel auswählt
- **THEN** erscheint in der Sammlung „Meine Videos“ eine Kachel mit
  Posterbild, Dateiname und „1:45“, und sie ist nach einem Neuladen
  weiterhin da

#### Scenario: Gemischter Import aller drei Arten
- **WHEN** ein Benutzer zwei JPEG-Dateien, eine FLAC-Datei und eine
  MP4-Datei gleichzeitig auf den Sammlungsbereich zieht
- **THEN** stehen die Bilder in „Meine Bilder“, die FLAC-Datei in „Meine
  Musik“ und die Szenen der MP4-Datei in „Meine Videos“

#### Scenario: Video mit Szenenwechseln importieren
- **WHEN** ein Benutzer eine MP4-Datei mit drei Szenen importiert
- **THEN** stehen nach der Erkennung drei Kacheln in „Meine Videos“, jede mit
  eigenem Posterbild und eigener Dauer

### Requirement: Abgeleitetes Video
Für jedes Video-Medium MUST das Backend ein einzelnes Posterbild (JPEG,
Qualität 90) als Vorschau bereitstellen, abgeleitet aus dem **Fenster** dieses
Mediums auf der gespeicherten Datei: ein Frame bei `sourceIn + 1 Sekunde`,
oder bei `sourceIn + duration / 2`, wenn das Fenster kürzer als 2 Sekunden
ist. Eine vorhandene Dreh-Metadatung MUST dabei berücksichtigt werden, wie die
EXIF-Rotation bei Bildern. Das Original bleibt unverändert erhalten; es gibt
keine normalisierte Video-Zwischenfassung und keine je Szene geschnittene
Datei. Jedes Video-Medium MUST eine Kennung, die Art `video`, den
Anzeigenamen, die Dauer seines Fensters, `sourceIn`, seinen Zustand, Breite und
Höhe (nach Rotation) und die URL des Posterbilds haben. Für ein Medium im
Zustand `detecting` MUST noch kein Posterbild verlangt werden.

#### Scenario: Gedrehtes Hochformat-Video
- **WHEN** ein im Querformat gespeichertes Video importiert wird, das laut
  Dreh-Metadatung um 90° gedreht angezeigt werden soll
- **THEN** wird das Posterbild hochkant geliefert, und die gemeldete Breite
  ist kleiner als die Höhe

#### Scenario: Kurzes Video
- **WHEN** ein 1,2 Sekunden langes Video importiert wird
- **THEN** stammt das Posterbild aus der Hälfte der Laufzeit (0,6 s), nicht
  aus Sekunde 1

#### Scenario: Posterbild einer Szene
- **WHEN** ein Video in drei Szenen zerlegt wurde und die zweite bei 12 s
  beginnt
- **THEN** zeigt die Kachel der zweiten Szene ein Posterbild aus dieser Szene
  (Frame bei 13 s der Datei), nicht aus der ersten

### Requirement: Sammlung anzeigen und Medien löschen
Die Sammlung „Meine Bilder“ MUST alle importierten Bilder, „Meine Musik“
MUST alles importierte Audio und „Meine Videos“ MUST alle Video-Medien als
Kacheln in Importreihenfolge zeigen. Ein Benutzer MUST ein Medium aus der
Sammlung löschen können (Kontextmenü oder Entf bei fokussierter Kachel, mit
Rückfrage). Beim Löschen MUST ein Bild auch aus dem Bildstreifen und ein
Audio-Medium auch aus der Musikspur entfernt werden; ein Video kann in keinem
Projekt-Bestandteil außerhalb des Bildstreifens vorkommen und wird daher
immer sofort gelöscht. Solange ein wartender oder laufender Export ein Bild
oder Audio-Medium verwendet, MUST das Löschen abgelehnt werden (Code
`media.inUseByExport`); diese Prüfung MUST NOT für Video laufen.

Teilen mehrere Video-Medien eine gespeicherte Quelldatei (Spec
scene-detection), MUST das Löschen eines dieser Medien nur dieses Medium
entfernen; die gespeicherte Quelldatei MUST erst entfernt werden, wenn kein
Medium mehr auf sie verweist.

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

#### Scenario: Eine Szene von mehreren löschen
- **WHEN** ein Benutzer von drei Szenen desselben Imports die zweite löscht
  und die Rückfrage bestätigt
- **THEN** verschwindet nur diese Kachel, die erste und die dritte bleiben
  benutzbar, und ihre Posterbilder und Frames sind weiterhin abrufbar
