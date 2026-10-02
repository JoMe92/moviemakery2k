## MODIFIED Requirements

### Requirement: Übergangskatalog
Das System MUST einen Katalog von Übergängen bereitstellen, den Frontend und
Backend gemeinsam nutzen. Jeder Eintrag MUST eine stabile ID, einen deutschen
und einen englischen Anzeigenamen, eine Standarddauer, seine Parameter mit
Werten und die Quelle der Parameter (Movie-Maker-XML-Definition oder
SMPTE-Wipe-Nummer) enthalten. Die Oberfläche MUST den Namen in der gewählten
Sprache zeigen. Das Backend MUST den Katalog über die API ausliefern und MUST
beim Start abbrechen, wenn der Katalog ungültig ist. Der MVP-Katalog MUST
genau diese Übergänge enthalten: `fade` (Überblenden / Fade), `dissolve`
(Auflösen / Dissolve), `wipe-right` (Wischen, rechts / Wipe right), `circle`
(Kreis / Circle), `pixelate` (Verpixeln / Pixelate), `checkerboard`
(Schachbrett / Checkerboard).

#### Scenario: Katalog abrufen
- **WHEN** ein Client den Übergangskatalog abruft
- **THEN** erhält er sechs Einträge mit ID, deutschem und englischem Namen,
  Standarddauer, Parametern und Quelle

#### Scenario: Ungültiger Katalog
- **WHEN** ein Katalogeintrag ohne Standarddauer oder ohne englischen Namen
  ausgeliefert werden soll
- **THEN** startet das Backend nicht und nennt den fehlerhaften Eintrag

#### Scenario: Name in der Sammlung
- **WHEN** die Sprache Englisch ist und ein Benutzer die Videoübergänge
  anzeigt
- **THEN** heißt die Kachel des Übergangs `circle` „Circle“
