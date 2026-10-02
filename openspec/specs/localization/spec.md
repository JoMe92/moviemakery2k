# localization Specification

## Purpose
Zweisprachige Oberfläche (Deutsch, Englisch): Sprachwahl, Sprachkataloge, sprachabhängige Formate, übersetzte Fehlermeldungen und englische Code-Kommentare.

## Requirements

### Requirement: Sprachen der Oberfläche
Die Oberfläche MUST auf Deutsch und auf Englisch verfügbar sein. Jeder
sichtbare Text (Menüs, Aufgabenbereich, Symbolleiste, Statusleiste, Dialoge,
Assistenten, Hinweise, Fehlermeldungen, Bedienelemente für Hilfstechnologien)
MUST in der gewählten Sprache erscheinen. Für jeden Text MUST es eine deutsche
und eine englische Fassung geben.

#### Scenario: Englische Oberfläche
- **WHEN** die Sprache Englisch gewählt ist
- **THEN** heißt das Menü „File“ statt „Datei“, und der Aufgabenbereich zeigt
  „Save to my computer“ statt „Auf dem Computer speichern“

#### Scenario: Vollständige Kataloge
- **WHEN** ein Text nur in einer der beiden Sprachen existiert
- **THEN** schlägt die Prüfung (`pixi run check`) fehl

### Requirement: Wahl der Sprache
Beim ersten Start MUST die Anwendung die Browsersprache verwenden, wenn sie
Deutsch oder Englisch ist, sonst Englisch. Eine im Dialog „Optionen“ gewählte
Sprache MUST gespeichert werden und Vorrang vor der Browsersprache haben. Ein
Sprachwechsel MUST sofort ohne Neuladen wirken, und das Projekt MUST dabei
unverändert bleiben.

#### Scenario: Browser auf Deutsch
- **WHEN** die Browsersprache `de-AT` ist und keine Sprache gespeichert ist
- **THEN** erscheint die Oberfläche auf Deutsch

#### Scenario: Browser auf Französisch
- **WHEN** die Browsersprache `fr-FR` ist und keine Sprache gespeichert ist
- **THEN** erscheint die Oberfläche auf Englisch

#### Scenario: Sprache wechseln
- **WHEN** ein Benutzer in Extras → „Optionen…“ Englisch wählt und bestätigt
- **THEN** erscheint die Oberfläche sofort auf Englisch, der Bildstreifen ist
  unverändert, und nach einem Neuladen bleibt Englisch gewählt

### Requirement: Sprachabhängige Formate
Dezimalzahlen, Dauern, Dateigrößen und die Zeitanzeige MUST dem Format der
gewählten Sprache folgen. Eingaben von Dauern MUST in beiden Sprachen Komma und
Punkt als Dezimaltrennzeichen akzeptieren.

#### Scenario: Dauer auf Englisch
- **WHEN** die Sprache Englisch ist und ein Bild 2,5 s dauert
- **THEN** zeigt die Kachel „2.50 s“, und die Eingabe „2,5“ im Dauer-Dialog
  wird als 2,5 Sekunden angenommen

### Requirement: Übersetzte Fehlermeldungen
Fehler des Backends MUST einen stabilen Code, Parameter und eine englische
Meldung liefern. Die Oberfläche MUST bekannte Codes in der gewählten Sprache
anzeigen und für unbekannte Codes die englische Meldung zeigen.

#### Scenario: Leeres Projekt exportieren
- **WHEN** der Export eines leeren Projekts abgelehnt wird und die Sprache
  Deutsch ist
- **THEN** zeigt der Assistent die deutsche Meldung zum leeren Bildstreifen

#### Scenario: Unbekannter Fehlercode
- **WHEN** das Backend einen Code liefert, den die Oberfläche nicht kennt
- **THEN** zeigt die Oberfläche die englische Meldung des Backends

### Requirement: Englische Kommentare im Code
Kommentare und Docstrings im Quellcode, Beschreibungen der Pixi-Tasks und die
Namen der CI-Schritte MUST englisch sein. Deutsche Texte MUST nur noch in den
deutschen Sprachkatalogen, in Testdaten für die deutsche Oberfläche und in den
OpenSpec-Artefakten vorkommen.

#### Scenario: Pixi-Tasks
- **WHEN** ein Entwickler `pixi task list` ausführt
- **THEN** sind alle Beschreibungen englisch
