## MODIFIED Requirements

### Requirement: Wiedergabesteuerung
Der Monitor MUST die Schaltflächen Wiedergabe/Pause, Stopp, „Vorheriges
Bild“ und „Nächstes Bild“ bieten, dazu eine Suchleiste und eine Zeitanzeige
im Format `h:mm:ss,cc / h:mm:ss,cc` (Deutsch) bzw. `h:mm:ss.cc / h:mm:ss.cc`
(Englisch). Die Leertaste MUST Wiedergabe/Pause umschalten, solange der Fokus
nicht in einem Eingabefeld liegt. Stopp MUST an den Anfang springen. Am Ende
MUST die Wiedergabe anhalten und das letzte Bild stehen lassen. Ist der
Bildstreifen leer, MUST die Steuerung deaktiviert sein.

#### Scenario: Diashow abspielen
- **WHEN** ein Benutzer vier Bilder mit Übergängen im Bildstreifen hat und
  Wiedergabe drückt
- **THEN** zeigt der Monitor die Bilder nacheinander mit ihren Dauern und
  Übergängen, die Zeitanzeige läuft mit, und am Ende hält die Wiedergabe
  beim letzten Bild an

#### Scenario: Suchen während eines Übergangs
- **WHEN** ein Benutzer die Suchleiste auf einen Zeitpunkt mitten in einem
  Übergang zieht
- **THEN** zeigt der Monitor sofort den passenden Zwischenzustand dieses
  Übergangs

#### Scenario: Nächstes Bild
- **WHEN** ein Benutzer während der Wiedergabe von Bild 2 auf „Nächstes Bild“
  klickt
- **THEN** springt die Wiedergabe an den Anfang von Bild 3, also an das Ende
  des Übergangs dorthin

#### Scenario: Zeitanzeige auf Englisch
- **WHEN** die Sprache Englisch ist und die Wiedergabe bei 12,5 s steht
- **THEN** zeigt die Zeitanzeige „0:00:12.50“
