## MODIFIED Requirements

### Requirement: Assistent „Film speichern“
Die Anwendung MUST einen modalen Assistenten im Y2K-Dialogstil mit den
Schritten „Dateiname“, „Qualität“, „Film wird gespeichert“ und „Fertig“
anbieten. Er MUST die Schaltflächen „Zurück“, „Weiter“ und „Abbrechen“ haben
und sich vollständig per Tastatur bedienen lassen. Der Dateiname MUST mit
„Mein Film“ vorbelegt sein, MUST die Zeichen `/ \ : * ? " < > |` ablehnen und
MUST beim Herunterladen die Endung `.mp4` tragen. Im Schritt „Fertig“ MUST
neben „Herunterladen“ die Schaltfläche „Teilen…“ erscheinen, wenn der Kontext
sicher ist, das Gerät das Teilen von Dateien unterstützt und die Datei
höchstens 200 MB groß ist. „Teilen…“ MUST bis zum vollständigen Laden der
Datei deaktiviert sein und dann den Teilen-Dialog des Geräts mit der Datei
`<Dateiname>.mp4` öffnen. Bricht der Benutzer das Teilen ab, MUST das ohne
Fehlermeldung bleiben; „Herunterladen“ MUST immer verfügbar bleiben.

#### Scenario: Film mit Standardwerten speichern
- **WHEN** ein Benutzer mit mindestens einem Bild im Bildstreifen den
  Assistenten öffnet und auf jedem Schritt „Weiter“ wählt
- **THEN** startet der Export mit dem Profil „Hohe Qualität (960×720)“, und
  nach Abschluss bietet der Schritt „Fertig“ die Datei „Mein Film.mp4“ zum
  Herunterladen an

#### Scenario: Ungültiger Dateiname
- **WHEN** ein Benutzer „Urlaub/2003“ als Dateinamen eingibt
- **THEN** ist „Weiter“ deaktiviert, und der Assistent nennt die unerlaubten
  Zeichen

#### Scenario: Assistent vor dem Start abbrechen
- **WHEN** ein Benutzer im Schritt „Qualität“ „Abbrechen“ wählt
- **THEN** schließt sich der Assistent, und es wird kein Export gestartet

#### Scenario: Film am Handy teilen
- **WHEN** ein Export von 40 MB über HTTPS auf einem Handy mit Web Share API
  fertig ist und der Benutzer nach dem Laden „Teilen…“ wählt
- **THEN** öffnet sich der Teilen-Dialog des Geräts mit der Datei
  „Mein Film.mp4“

#### Scenario: Teilen nicht verfügbar
- **WHEN** der Export über HTTP oder in einem Browser ohne Teilen von Dateien
  fertig ist
- **THEN** zeigt der Schritt „Fertig“ nur „Herunterladen“

#### Scenario: Datei zu groß zum Teilen
- **WHEN** ein fertiger Export größer als 200 MB ist
- **THEN** zeigt der Schritt „Fertig“ nur „Herunterladen“
