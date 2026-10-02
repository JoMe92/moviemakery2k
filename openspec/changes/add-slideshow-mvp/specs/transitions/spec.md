## Purpose

Der Katalog der Videoübergänge und das sichtbare Verhalten jedes Übergangs.
Die Parameter stammen aus den dokumentierten Movie-Maker-2.x-Definitionen.
Im MVP umfasst der Katalog sechs klassische 2D-Übergänge.

## ADDED Requirements

### Requirement: Übergangskatalog
Das System MUST einen Katalog von Übergängen bereitstellen, den Frontend und
Backend gemeinsam nutzen. Jeder Eintrag MUST eine stabile ID, einen deutschen
Anzeigenamen, eine Standarddauer, seine Parameter mit Werten und die Quelle
der Parameter (Movie-Maker-XML-Definition oder SMPTE-Wipe-Nummer) enthalten.
Das Backend MUST den Katalog über die API ausliefern und MUST beim Start
abbrechen, wenn der Katalog ungültig ist. Der MVP-Katalog MUST genau diese
Übergänge enthalten: `fade` (Überblenden), `dissolve` (Auflösen),
`wipe-right` (Wischen, rechts), `circle` (Kreis), `pixelate` (Verpixeln),
`checkerboard` (Schachbrett).

#### Scenario: Katalog abrufen
- **WHEN** ein Client den Übergangskatalog abruft
- **THEN** erhält er sechs Einträge mit ID, Name, Standarddauer, Parametern und
  Quelle

#### Scenario: Ungültiger Katalog
- **WHEN** ein Katalogeintrag ohne Standarddauer ausgeliefert werden soll
- **THEN** startet das Backend nicht und nennt den fehlerhaften Eintrag

### Requirement: Übergänge in der Sammlung
Die Sammlung „Videoübergänge“ MUST alle Katalogeinträge als Kacheln mit Namen
und einem eigenen Vorschausymbol zeigen. Wählt ein Benutzer eine Kachel aus,
MUST der Vorschaumonitor den Übergang zwischen zwei eingebauten,
selbst erzeugten Beispielbildern abspielen.

#### Scenario: Übergang ansehen
- **WHEN** ein Benutzer in der Sammlung „Videoübergänge“ auf „Schachbrett“
  klickt
- **THEN** spielt der Monitor den Schachbrett-Übergang zwischen den
  Beispielbildern einmal ab

### Requirement: Gemeinsames Verhalten aller Übergänge
Für jeden Übergang MUST gelten: Bei Fortschritt 0 zeigt der Frame exakt das
Ausgangsbild, bei Fortschritt 1 exakt das Zielbild, und dazwischen verläuft
der Übergang stetig in der Zeit. Gleiche Eingaben (Bilder, Fortschritt,
Parameter, Ausgabegröße) MUST stets dasselbe Bild ergeben, auch bei Übergängen
mit Zufallsanteil.

#### Scenario: Randwerte
- **WHEN** ein beliebiger Katalog-Übergang zwischen einem komplett roten und
  einem komplett blauen Bild bei Fortschritt 0 und 1 gerendert wird
- **THEN** ist der Frame bei 0 vollständig rot und bei 1 vollständig blau

#### Scenario: Determinismus
- **WHEN** „Auflösen“ zweimal mit identischen Eingaben bei Fortschritt 0,5
  gerendert wird
- **THEN** sind beide Frames pixelgleich

### Requirement: Verhalten der sechs MVP-Übergänge
Die Übergänge MUST sich wie folgt verhalten:
- **Überblenden:** lineare Mischung von Ausgangs- und Zielbild ohne
  Zwischenschwarz.
- **Auflösen:** Pixel des Zielbilds erscheinen in zufälliger, aber fester
  Reihenfolge, bis das ganze Bild ersetzt ist.
- **Wischen, rechts:** Eine senkrechte Kante wandert von links nach rechts und
  deckt das Zielbild auf; die Kante ist weich mit `GradientSize` 0,5.
- **Kreis:** Ein Kreis wächst aus der Bildmitte und zeigt das Zielbild, bis
  das ganze Bild bedeckt ist; der Rand ist weich mit `BorderSoftness` 20.
- **Verpixeln:** Das Ausgangsbild wird bis zur Mitte des Übergangs zu immer
  gröberen Blöcken (höchstens `MaxSquare`), wechselt dort zum Zielbild und
  wird wieder scharf.
- **Schachbrett:** Felder eines 12×10-Rasters decken das Zielbild in
  versetzten Reihen von links nach rechts auf.

#### Scenario: Wischen in der Mitte
- **WHEN** „Wischen, rechts“ zwischen Rot und Blau bei Fortschritt 0,5
  gerendert wird
- **THEN** ist der linke Bildrand blau, der rechte Bildrand rot, und dazwischen
  verläuft eine weiche senkrechte Kante

#### Scenario: Verpixeln in der Mitte
- **WHEN** „Verpixeln“ bei Fortschritt 0,5 gerendert wird
- **THEN** besteht der Frame aus gleichfarbigen Blöcken mit der größten
  Blockgröße
