# transitions Specification

## Purpose
Der Katalog der Videoübergänge und das sichtbare Verhalten jedes Übergangs.
Die Parameter stammen aus den dokumentierten Movie-Maker-2.x-Definitionen.
Der Katalog umfasst die sechs klassischen 2D-Übergänge des MVP sowie die
Basis- und SMPTE-Wisch-Übergänge der Referenz; 3D- und Partikel-Übergänge
gehören nicht dazu.

## Requirements

### Requirement: Übergangskatalog
Das System MUST einen Katalog von Übergängen bereitstellen, den Frontend und
Backend gemeinsam nutzen. Jeder Eintrag MUST eine stabile ID, einen deutschen
und einen englischen Anzeigenamen, eine Standarddauer, seine Parameter mit
Werten und die Quelle der Parameter (Movie-Maker-XML-Definition oder
SMPTE-Wipe-Nummer) enthalten. Die Oberfläche MUST den Namen in der gewählten
Sprache zeigen. Das Backend MUST den Katalog über die API ausliefern und MUST
beim Start abbrechen, wenn der Katalog ungültig ist. Der Katalog MUST
weiterhin genau die sechs MVP-Übergänge enthalten: `fade`, `dissolve`,
`wipe-right`, `circle`, `pixelate`, `checkerboard`. Zusätzlich MUST der
Katalog alle Basis- und SMPTE-Wisch-Übergänge aus
`docs/research/movie-maker-reference.md` §3 enthalten (Bars, Iris, Wheel,
die fünf fehlenden Wipe-Richtungsvarianten, sowie die 34 SMPTE-Wipes). Der
Katalog MUST NOT die 13 3D- oder Partikel-Übergänge (WMTFX: Flip, Slide Up,
Slide Up Center, Roll, Spin Out, Page Curl, Shatter, Whirlwind, Shrink)
enthalten.

#### Scenario: Katalog abrufen
- **WHEN** ein Client den Übergangskatalog abruft
- **THEN** erhält er mehr als 40 Einträge, darunter unverändert `fade`,
  `dissolve`, `wipe-right`, `circle`, `pixelate` und `checkerboard`, jeder
  mit ID, deutschem und englischem Namen, Standarddauer, Parametern und
  Quelle

#### Scenario: Ungültiger Katalog
- **WHEN** ein Katalogeintrag ohne Standarddauer oder ohne englischen Namen
  ausgeliefert werden soll
- **THEN** startet das Backend nicht und nennt den fehlerhaften Eintrag

#### Scenario: Name in der Sammlung
- **WHEN** die Sprache Englisch ist und ein Benutzer die Videoübergänge
  anzeigt
- **THEN** heißt die Kachel des Übergangs `circle` „Circle“

#### Scenario: Kein 3D- oder Partikel-Übergang
- **WHEN** der Katalog validiert wird
- **THEN** enthält er keinen Eintrag aus der WMTFX-3D/Partikel-Liste (Flip,
  Slide Up, Slide Up Center, Roll, Spin Out, Page Curl, Shatter, Whirlwind,
  Shrink)

### Requirement: Übergänge in der Sammlung
Die Sammlung „Videoübergänge“ MUST alle Katalogeinträge als Kacheln mit Namen
und einem eigenen Vorschausymbol zeigen, auch wenn deren Anzahl den
sichtbaren Bereich übersteigt (dann MUST die Sammlung scrollbar sein). Beim
Öffnen der Sammlung MUST keine Kachel ausgewählt sein, und der
Vorschaumonitor MUST weiter das Projekt zeigen. Wählt ein Benutzer eine
Kachel aus, MUST der Vorschaumonitor den Übergang zwischen zwei eingebauten,
selbst erzeugten Beispielbildern abspielen und dabei als Beispiel mit dem
Namen des Übergangs gekennzeichnet sein. Wiedergabe, Suchen oder die Auswahl
eines Elements im Bildstreifen MUST den Monitor zum Projekt zurückbringen.

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

#### Scenario: Scrollen bei vielen Übergängen
- **WHEN** die Sammlung „Videoübergänge“ mehr Kacheln enthält, als auf
  einmal sichtbar sind
- **THEN** lässt sich die Sammlung scrollen, und Drag & Drop funktioniert
  für jede sichtbare Kachel unverändert

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

### Requirement: Verhalten der Basis- und SMPTE-Wisch-Übergänge
Jeder Basis- oder SMPTE-Wisch-Übergang MUST das Zielbild entlang einer
Kantenform aufdecken (gerade, diagonal, polygonal, kreisförmig oder eine
andere Kurve je Eintrag, Geometrie nach `docs/research/movie-maker-reference.md`
§3), mit einem weichen Rand (`borderSoftness` bzw. `gradientSize`) und —
sofern der Eintrag das vorsieht — einer gekachelten Wiederholung
(`replicateX`/`replicateY`). Das gemeinsame Verhalten aus der Requirement
„Gemeinsames Verhalten aller Übergänge“ (Randwerte bei Fortschritt 0/1,
Determinismus) MUST für jeden dieser Einträge gelten.

#### Scenario: Weicher Rand
- **WHEN** ein Wisch-Übergang dieser Familie zwischen einem roten und einem
  blauen Bild bei einem mittleren Fortschritt gerendert wird
- **THEN** liegt zwischen den beiden Farben ein weicher Übergangsbereich
  entsprechend seinem `borderSoftness`-Wert, keine harte Kante

#### Scenario: Wiederholung
- **WHEN** „Circles (Replicate 8×6)“ bei Fortschritt 0,5 gerendert wird
- **THEN** zeigt der Frame wachsende Kreise in einem 8×6-Raster statt eines
  einzelnen zentrierten Kreises

#### Scenario: Randwerte einer neuen Form
- **WHEN** „Stern“ zwischen einem komplett roten und einem komplett blauen
  Bild bei Fortschritt 0 und 1 gerendert wird
- **THEN** ist der Frame bei 0 vollständig rot und bei 1 vollständig blau
