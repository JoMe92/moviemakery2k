## ADDED Requirements

### Requirement: Musikspur
Ein Projekt MUST eine Musikspur mit höchstens 100 Musikstücken haben. Die
Stücke MUST in ihrer Reihenfolge lückenlos nacheinander ab 0:00 spielen; ein
Stück MAY mehrfach vorkommen. Jedes Stück verweist auf ein Audio-Medium und
hat einen Anfang und ein Ende innerhalb der Datei (Standard: ganze Datei),
eine Lautstärke von 0–200 % (Standard 100 %) sowie die Schalter
„Einblenden“ und „Ausblenden“ (je 1 s, Standard aus). Die gespielte Länge
eines Stücks ist Ende minus Anfang.

#### Scenario: Zwei Stücke nacheinander
- **WHEN** die Musikspur ein Stück mit 30 s und danach eines mit 20 s enthält
- **THEN** beginnt das zweite Stück bei 0:00:30,00, und die Musik dauert 50 s

#### Scenario: Gekürztes Stück
- **WHEN** ein Stück einer 3-Minuten-Datei mit Anfang 0:10 und Ende 1:10 vor
  einem zweiten Stück liegt
- **THEN** spielt das erste Stück die Sekunden 10 bis 70 der Datei, und das
  zweite beginnt bei 0:01:00,00

### Requirement: Musik am Filmende
Die Musik MUST nur so lange spielen wie der Film (Gesamtdauer nach Spec
preview-player „Zeitmodell der Diashow“). Ist die Musik länger, MUST sie am
Filmende abgeschnitten und in der letzten Sekunde ausgeblendet werden; ist
der Film kürzer als 1 s, MUST die Ausblendung über die ganze Filmdauer gehen.
Ist die Musik kürzer, MUST danach Stille folgen. Vorschau und Export MUST
dieselbe Planung der Musik verwenden, geprüft gegen gemeinsame Testvektoren.

#### Scenario: Musik länger als der Film
- **WHEN** die Musik 3:12 und der Film 2:40 dauert
- **THEN** endet die Musik bei 2:40 und wird von 2:39 bis 2:40 ausgeblendet,
  und die Musikleiste meldet, dass die Musik am Ende gekürzt wird

#### Scenario: Musik kürzer als der Film
- **WHEN** die Musik 30 s und der Film 45 s dauert
- **THEN** ist der Film von 0:30 bis 0:45 still

### Requirement: Musikleiste
Unter dem Bildstreifen MUST eine Leiste „Audio/Musik“ die Musikstücke als
Blöcke in ihrer Reihenfolge zeigen, jeweils mit Name, gespielter Länge und
einer Wellenform; die Breite eines Blocks MUST proportional zu seiner Länge
sein. Ein Benutzer MUST Audio aus der Sammlung per Drag & Drop an eine
Position der Musikleiste ziehen oder per Doppelklick ans Ende anhängen
können, Stücke per Drag & Drop umsortieren und ein ausgewähltes Stück mit
Entf oder über das Kontextmenü entfernen können; dasselbe MUST per Tastatur
möglich sein. Der Bildstreifen MUST Audio ablehnen und die Musikleiste
Bilder, jeweils mit einem Hinweis. Bei leerer Musikleiste MUST ein Hinweis
erklären, dass man Musik hierher ziehen kann.

#### Scenario: Musik hinzufügen
- **WHEN** ein Benutzer eine MP3-Datei aus der Sammlung auf die leere
  Musikleiste zieht
- **THEN** zeigt die Leiste einen Block mit Dateiname, Dauer und Wellenform,
  und nach einem Neuladen ist das Stück noch da

#### Scenario: Bild auf die Musikleiste
- **WHEN** ein Benutzer ein Bild auf die Musikleiste zieht
- **THEN** bleibt die Musikspur unverändert, und ein Hinweis erklärt, dass
  hier nur Audio abgelegt werden kann

#### Scenario: Umsortieren
- **WHEN** ein Benutzer das zweite Stück vor das erste zieht
- **THEN** spielt es zuerst, und die Startzeiten beider Stücke ändern sich
  entsprechend

### Requirement: Musikstücke bearbeiten
Das Kontextmenü eines Musikstücks MUST die Einträge „Entfernen“,
„Lautstärke…“, „Einblenden“, „Ausblenden“ (Schalter mit Häkchen) und
„Kürzen…“ bieten. „Lautstärke…“ MUST einen Dialog mit Schieberegler und
Zahlenfeld (0–200 %) öffnen. „Kürzen…“ MUST einen Dialog mit Anfang und Ende
öffnen; er MUST nur Werte mit `0 ≤ Anfang < Ende ≤ Dateidauer` und einer
Länge von mindestens 0,5 s übernehmen und sonst den erlaubten Bereich nennen.
Dieselben Prüfungen MUST das Backend beim Speichern durchführen.

#### Scenario: Lautstärke senken
- **WHEN** ein Benutzer für ein Stück die Lautstärke 50 % einstellt
- **THEN** spielen Vorschau und Export dieses Stück mit halber Amplitude

#### Scenario: Ungültiges Ende
- **WHEN** ein Benutzer im Dialog „Kürzen…“ ein Ende hinter der Dateidauer
  einträgt
- **THEN** wird der Wert nicht übernommen, und der Dialog nennt den erlaubten
  Bereich

#### Scenario: Einblenden
- **WHEN** ein Benutzer für das erste Stück „Einblenden“ einschaltet
- **THEN** steigt die Lautstärke in Vorschau und Export von 0:00 bis 0:01 von
  Stille auf den eingestellten Wert

### Requirement: Film an Musik anpassen
Der Menüeintrag Clip → „Film an Musik anpassen“ MUST die Anzeigedauern der
Bilder so setzen, dass die Gesamtdauer des Films der Länge der Musik
entspricht: gleichmäßig verteilt unter Berücksichtigung der Übergänge,
gerundet auf 0,25 s und begrenzt auf 0,5–60 s, eine verbleibende Abweichung
beim letzten Bild. Übergänge MUST unverändert bleiben. Ist die Länge der
Musik mit den vorhandenen Bildern nicht erreichbar, MUST ein Dialog die
erreichbare Dauer nennen und nichts ändern. Ohne Bilder oder ohne Musik MUST
der Eintrag deaktiviert sein.

#### Scenario: Film anpassen
- **WHEN** die Musik 60 s dauert, der Bildstreifen zehn Bilder ohne Übergänge
  enthält und ein Benutzer „Film an Musik anpassen“ wählt
- **THEN** dauert jedes Bild 6 s, und die Gesamtdauer ist 0:01:00,00

#### Scenario: Mit Übergängen
- **WHEN** die Musik 20 s dauert und der Bildstreifen vier Bilder mit drei
  Übergängen zu je 1 s enthält
- **THEN** dauert jedes Bild 5,75 s, und die Gesamtdauer ist 0:00:20,00

#### Scenario: Nicht erreichbar
- **WHEN** die Musik 10 Minuten dauert und der Bildstreifen fünf Bilder
  enthält
- **THEN** meldet ein Dialog, dass höchstens 5 Minuten erreichbar sind, und
  die Bilddauern bleiben unverändert
