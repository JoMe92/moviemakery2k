## MODIFIED Requirements

### Requirement: Film an Musik anpassen
Der Menüeintrag Clip → „Film an Musik anpassen“ MUST die Anzeigedauern der
dehnbaren Elemente des Bildstreifens so setzen, dass die Gesamtdauer des
Films der Länge der Musik entspricht. Dehnbar MUST jedes Element mit einer
eigenen Anzeigedauer sein (Bild- und Titel-Elemente); ein Videoclip MUST
unverändert bleiben, weil seine Länge sein Trimmfenster ist. Die Dauer MUST
gleichmäßig auf die dehnbaren Elemente verteilt werden, unter
Berücksichtigung der Übergänge über den ganzen Bildstreifen, gerundet auf
0,25 s und begrenzt auf 0,5–60 s; eine verbleibende Abweichung MUST beim
letzten dehnbaren Element liegen. Übergänge MUST unverändert bleiben. Ist
die Länge der Musik mit den vorhandenen Elementen nicht erreichbar — auch
dann, wenn der Bildstreifen kein dehnbares Element enthält —, MUST ein
Dialog die erreichbare Dauer nennen und nichts ändern. Ohne Elemente oder
ohne Musik MUST der Eintrag deaktiviert sein.

#### Scenario: Film anpassen
- **WHEN** die Musik 60 s dauert, der Bildstreifen zehn Bilder ohne Übergänge
  enthält und ein Benutzer „Film an Musik anpassen“ wählt
- **THEN** dauert jedes Bild 6 s, und die Gesamtdauer ist 0:01:00,00

#### Scenario: Mit Übergängen
- **WHEN** die Musik 20 s dauert und der Bildstreifen vier Bilder mit drei
  Übergängen zu je 1 s enthält
- **THEN** dauert jedes Bild 5,75 s, und die Gesamtdauer ist 0:00:20,00

#### Scenario: Mit einem Videoclip
- **WHEN** die Musik 60 s dauert, der Bildstreifen drei Bilder und einen
  7,5 s langen Videoclip ohne Übergänge enthält und ein Benutzer „Film an
  Musik anpassen“ wählt
- **THEN** behält der Videoclip seine 7,5 s, jedes Bild dauert 17,5 s, und
  die Gesamtdauer ist 0:01:00,00

#### Scenario: Mit einem Titel-Element
- **WHEN** die Musik 30 s dauert und der Bildstreifen ein Titel-Element und
  zwei Bilder ohne Übergänge enthält
- **THEN** dauert jedes der drei Elemente 10 s, und die Gesamtdauer ist
  0:00:30,00

#### Scenario: Nichts zu dehnen
- **WHEN** der Bildstreifen nur zwei Videoclips von zusammen 20 s enthält,
  die Musik 60 s dauert und ein Benutzer „Film an Musik anpassen“ wählt
- **THEN** meldet ein Dialog, dass höchstens 20 s erreichbar sind, und es
  bleibt alles unverändert

#### Scenario: Nicht erreichbar
- **WHEN** die Musik 10 Minuten dauert und der Bildstreifen fünf Bilder
  enthält
- **THEN** meldet ein Dialog, dass höchstens 5 Minuten erreichbar sind, und
  die Bilddauern bleiben unverändert
