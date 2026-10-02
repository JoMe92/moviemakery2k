## MODIFIED Requirements

### Requirement: Sprachen der Oberfläche
Die Oberfläche MUST auf Deutsch und auf Englisch verfügbar sein. Jeder
sichtbare Text (Menüs, Aufgabenbereich, Symbolleiste, Statusleiste, Dialoge,
Assistenten, Hinweise, Fehlermeldungen, Bedienelemente für Hilfstechnologien)
MUST in der gewählten Sprache erscheinen. Für jeden Text MUST es eine deutsche
und eine englische Fassung geben. Die Sprachauszeichnung des Dokuments
(`<html lang>`) MUST schon vor dem Laden der Anwendung der gewählten Sprache
entsprechen.

#### Scenario: Englische Oberfläche
- **WHEN** die Sprache Englisch gewählt ist
- **THEN** heißt das Menü „File“ statt „Datei“, und der Aufgabenbereich zeigt
  „Save to my computer“ statt „Auf dem Computer speichern“

#### Scenario: Vollständige Kataloge
- **WHEN** ein Text nur in einer der beiden Sprachen existiert
- **THEN** schlägt die Prüfung (`pixi run check`) fehl

#### Scenario: Sprachauszeichnung beim Laden
- **WHEN** Englisch gespeichert ist und die Seite geladen wird
- **THEN** trägt das Dokument `lang="en"`, bevor das Skript der Anwendung
  ausgeführt wird

### Requirement: Übersetzte Fehlermeldungen
Fehler des Backends MUST einen stabilen Code, Parameter und eine englische
Meldung liefern. Die Codes MUST als Aufzählung Teil des OpenAPI-Vertrags sein.
Upload-Ergebnisse und Export-Jobs MUST Fehler in denselben Feldern
(`errorCode`, `errorParams`, `message`) melden. Die Oberfläche MUST bekannte
Codes in der gewählten Sprache anzeigen und für unbekannte Codes die englische
Meldung zeigen; fehlt für einen Code der Aufzählung eine Übersetzung, MUST der
Typecheck fehlschlagen. Betrifft ein Eingabefehler ein Bild des Bildstreifens,
MUST die Meldung die Bildnummer nennen.

#### Scenario: Leeres Projekt exportieren
- **WHEN** der Export eines leeren Projekts abgelehnt wird und die Sprache
  Deutsch ist
- **THEN** zeigt der Assistent die deutsche Meldung zum leeren Bildstreifen

#### Scenario: Unbekannter Fehlercode
- **WHEN** das Backend einen Code liefert, den die Oberfläche nicht kennt
- **THEN** zeigt die Oberfläche die englische Meldung des Backends

#### Scenario: Neuer Code ohne Übersetzung
- **WHEN** das Backend einen neuen Fehlercode einführt und die Typen neu
  erzeugt werden, ohne dass die Kataloge ihn enthalten
- **THEN** schlägt `pixi run typecheck` fehl

#### Scenario: Ungültige Dauer an Bild 2
- **WHEN** das Speichern des Projekts wegen einer ungültigen Dauer an Bild 2
  abgelehnt wird
- **THEN** beginnt die Meldung mit „Bild 2:“ (Deutsch) bzw. „Picture 2:“
  (Englisch)
