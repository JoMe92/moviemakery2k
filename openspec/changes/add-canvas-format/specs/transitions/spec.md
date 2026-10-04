## MODIFIED Requirements

### Requirement: Gemeinsames Verhalten aller Übergänge
Für jeden Übergang MUST gelten: Bei Fortschritt 0 zeigt der Frame exakt das
Ausgangsbild, bei Fortschritt 1 exakt das Zielbild, und dazwischen verläuft
der Übergang stetig in der Zeit. Gleiche Eingaben (Bilder, Fortschritt,
Parameter, Ausgabegröße) MUST stets dasselbe Bild ergeben, auch bei Übergängen
mit Zufallsanteil.

Die Geometrie eines Übergangs — wo seine Kante, sein Mittelpunkt oder sein
Raster liegt — MUST auf das **Inhaltsrechteck** bezogen sein (Spec canvas,
Requirement „Inhalt in das Canvas einpassen“), nicht auf die gesamte
Canvas-Fläche. Haben die beiden beteiligten Elemente verschiedene
Inhaltsrechtecke, MUST das kleinste Rechteck verwendet werden, das beide
enthält. Außerhalb dieses Rechtecks MUST die Geometrie auf den nächsten Rand
begrenzt werden, damit die Randwerte bei Fortschritt 0 und 1 auch dort exakt
gelten. Parameter, die in Pixeln oder als Anteil angegeben sind (u. a.
`GradientSize`, `BorderSoftness`), MUST sich auf die Breite dieses Rechtecks
beziehen, nicht auf die Breite des Canvas.

#### Scenario: Randwerte
- **WHEN** ein beliebiger Katalog-Übergang zwischen einem komplett roten und
  einem komplett blauen Bild bei Fortschritt 0 und 1 gerendert wird
- **THEN** ist der Frame bei 0 vollständig rot und bei 1 vollständig blau

#### Scenario: Determinismus
- **WHEN** „Auflösen“ zweimal mit identischen Eingaben bei Fortschritt 0,5
  gerendert wird
- **THEN** sind beide Frames pixelgleich

#### Scenario: Wisch über ein Hochkant-Bild
- **WHEN** „Wischen, rechts“ zwischen zwei Hochkant-Fotos in einem Projekt
  mit Querformat 16:9 bei Fortschritt 0,5 gerendert wird
- **THEN** liegt die Kante in der Mitte des sichtbaren Fotos, nicht in der
  Mitte der Canvas-Fläche, und über die ganze Dauer des Übergangs gibt es
  keinen Abschnitt, in dem sich im sichtbaren Foto nichts ändert

#### Scenario: Randwerte bei Hintergrundfläche
- **WHEN** ein Richtungsübergang zwischen zwei Hochkant-Fotos in einem
  Querformat-Canvas mit weißem Hintergrund bei Fortschritt 0 und 1 gerendert
  wird
- **THEN** ist der Frame bei 0 exakt das Ausgangsbild und bei 1 exakt das
  Zielbild, einschließlich der weißen Flächen links und rechts

#### Scenario: Zwei verschiedene Inhaltsrechtecke
- **WHEN** ein Richtungsübergang von einem Querformat-Foto zu einem
  Hochkant-Foto in einem Querformat-Canvas läuft
- **THEN** rechnet die Geometrie über dem kleinsten Rechteck, das beide
  sichtbaren Fotos enthält, und der Übergang erreicht bei Fortschritt 1
  vollständig das Zielbild

### Requirement: Verhalten der sechs MVP-Übergänge
Die Übergänge MUST sich wie folgt verhalten; „Bild“ meint dabei das
Inhaltsrechteck des Übergangs (Requirement „Gemeinsames Verhalten aller
Übergänge“), nicht die Canvas-Fläche:
- **Überblenden:** lineare Mischung von Ausgangs- und Zielbild ohne
  Zwischenschwarz.
- **Auflösen:** Pixel des Zielbilds erscheinen in zufälliger, aber fester
  Reihenfolge, bis das ganze Bild ersetzt ist.
- **Wischen, rechts:** Eine senkrechte Kante wandert vom linken zum rechten
  Rand des Bilds und deckt das Zielbild auf; die Kante ist weich mit
  `GradientSize` 0,5 der Bildbreite.
- **Kreis:** Ein Kreis wächst aus der Mitte des Bilds und zeigt das Zielbild,
  bis das ganze Bild bedeckt ist; der Rand ist weich mit `BorderSoftness` 20.
- **Verpixeln:** Das Ausgangsbild wird bis zur Mitte des Übergangs zu immer
  gröberen Blöcken (höchstens `MaxSquare`), wechselt dort zum Zielbild und
  wird wieder scharf.
- **Schachbrett:** Felder eines 12×10-Rasters über dem Bild decken das
  Zielbild in versetzten Reihen von links nach rechts auf.

#### Scenario: Wischen in der Mitte
- **WHEN** „Wischen, rechts“ zwischen Rot und Blau bei Fortschritt 0,5
  gerendert wird
- **THEN** ist der linke Bildrand blau, der rechte Bildrand rot, und dazwischen
  verläuft eine weiche senkrechte Kante

#### Scenario: Verpixeln in der Mitte
- **WHEN** „Verpixeln“ bei Fortschritt 0,5 gerendert wird
- **THEN** besteht der Frame aus gleichfarbigen Blöcken mit der größten
  Blockgröße

#### Scenario: Kreis im Hochformat
- **WHEN** „Kreis“ zwischen zwei Querformat-Fotos in einem Projekt mit
  Hochformat 9:16 gerendert wird
- **THEN** wächst der Kreis aus der Mitte des sichtbaren Fotos und bedeckt es
  erst bei Fortschritt 1 vollständig, nicht schon deutlich davor

#### Scenario: Schachbrett im Hochformat
- **WHEN** „Schachbrett“ zwischen zwei Querformat-Fotos in einem Projekt mit
  Hochformat 9:16 bei Fortschritt 0,5 gerendert wird
- **THEN** liegen alle 12×10 Felder auf dem sichtbaren Foto, und keine Spalte
  des Rasters fällt vollständig auf die Hintergrundfläche
