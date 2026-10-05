## ADDED Requirements

### Requirement: Begrenzter Titeltext
Jedes Eingabefeld für Titeltext MUST die Eingabe auf dieselbe Länge je
Zeile begrenzen, die das Backend für eine Titelzeile erzwingt (200
Zeichen). Das MUST für die Zeilenfelder und die Nachspann-Einträge des
Titel-Assistenten ebenso gelten wie für das Filmtitel-Feld des
AutoMovie-Dialogs (Spec automovie). Am Limit MUST das Feld weitere
Zeichen ablehnen und vorhandenen Text unverändert lassen; eingefügter
längerer Text MUST auf die Grenze beschnitten werden. Die Anwendung MUST
kein Titel-Element und kein Overlay erzeugen können, dessen Zeile länger
als die Grenze ist.

#### Scenario: Zeile am Limit
- **WHEN** ein Benutzer im Schritt „Text“ des Titel-Assistenten 200
  Zeichen eingegeben hat und weitertippt
- **THEN** bleibt der Text bei 200 Zeichen, und „Fertig“ erzeugt ein
  Titel-Element, das das Backend annimmt

#### Scenario: Zu langer Filmtitel
- **WHEN** ein Benutzer einen 500 Zeichen langen Text in das
  Filmtitel-Feld des AutoMovie-Dialogs einfügt und einen Stil erstellt
- **THEN** trägt das Titel-Element am Anfang die ersten 200 Zeichen, und
  das Projekt wird ohne Fehler gespeichert

#### Scenario: Nachspann-Eintrag am Limit
- **WHEN** ein Benutzer einen Nachspann-Eintrag über 200 Zeichen hinaus
  verlängern will
- **THEN** nimmt das Feld keine weiteren Zeichen an, und die übrigen
  Einträge bleiben unverändert
