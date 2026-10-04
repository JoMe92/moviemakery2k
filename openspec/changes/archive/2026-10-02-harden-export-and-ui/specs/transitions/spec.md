## MODIFIED Requirements

### Requirement: Übergänge in der Sammlung
Die Sammlung „Videoübergänge“ MUST alle Katalogeinträge als Kacheln mit Namen
und einem eigenen Vorschausymbol zeigen. Beim Öffnen der Sammlung MUST keine
Kachel ausgewählt sein, und der Vorschaumonitor MUST weiter das Projekt
zeigen. Wählt ein Benutzer eine Kachel aus, MUST der Vorschaumonitor den
Übergang zwischen zwei eingebauten, selbst erzeugten Beispielbildern abspielen
und dabei als Beispiel mit dem Namen des Übergangs gekennzeichnet sein.
Wiedergabe, Suchen oder die Auswahl eines Elements im Bildstreifen MUST den
Monitor zum Projekt zurückbringen.

#### Scenario: Übergang ansehen
- **WHEN** ein Benutzer in der Sammlung „Videoübergänge“ auf „Schachbrett“
  klickt
- **THEN** spielt der Monitor den Schachbrett-Übergang zwischen den
  Beispielbildern einmal ab und zeigt dabei „Beispiel: Schachbrett“

#### Scenario: Sammlung öffnen
- **WHEN** ein Benutzer mit Bildern im Bildstreifen die Sammlung
  „Videoübergänge“ öffnet
- **THEN** ist keine Kachel ausgewählt, und der Monitor zeigt weiter das
  Projekt

#### Scenario: Zurück zum Projekt
- **WHEN** nach einer Demo ein Benutzer Wiedergabe drückt
- **THEN** zeigt der Monitor wieder das Projekt ohne Beispiel-Kennzeichnung
