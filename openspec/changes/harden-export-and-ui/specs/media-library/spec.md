## MODIFIED Requirements

### Requirement: Sammlung anzeigen und Medien löschen
Die Sammlung „Meine Bilder“ MUST alle importierten Bilder als Kacheln in
Importreihenfolge zeigen. Ein Benutzer MUST ein Bild aus der Sammlung
löschen können (Kontextmenü oder Entf bei fokussierter Kachel, mit
Rückfrage). Beim Löschen MUST das Bild auch aus dem Bildstreifen entfernt
werden. Solange ein wartender oder laufender Export das Bild verwendet, MUST
das Löschen abgelehnt werden (Code `media.inUseByExport`); Sammlung und
Bildstreifen MUST dann unverändert bleiben.

#### Scenario: Bild löschen, das im Bildstreifen verwendet wird
- **WHEN** ein Benutzer ein Bild löscht, das zweimal im Bildstreifen
  vorkommt, und die Rückfrage bestätigt
- **THEN** verschwindet es aus der Sammlung und an beiden Stellen aus dem
  Bildstreifen, und die eingehenden Übergänge dieser Elemente entfallen

#### Scenario: Bild löschen, das ein laufender Export verwendet
- **WHEN** ein Benutzer während eines laufenden Exports ein Bild löschen will,
  das im exportierten Projekt vorkommt, und die Rückfrage bestätigt
- **THEN** bleibt das Bild in Sammlung und Bildstreifen, die Oberfläche
  meldet in der gewählten Sprache, dass es gerade exportiert wird, und der
  Export läuft unverändert weiter
