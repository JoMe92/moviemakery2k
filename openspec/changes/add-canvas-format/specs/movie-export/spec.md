## MODIFIED Requirements

### Requirement: Qualitätsprofile
Der Export MUST die Profile „Hohe Qualität“, „Kleine Datei“ und „Für
E-Mail/Web“ anbieten, alle mit 30 Bildern pro Sekunde. Jedes Profil MUST die
**längere Kante** des Bildes festlegen: 960 px für „Hohe Qualität“, 640 px für
„Kleine Datei“, 320 px für „Für E-Mail/Web“. Die Pixelgröße MUST sich daraus
und aus dem Canvas-Format des Projekts (Spec canvas) ergeben — Querformat
16:9: 960×540, 640×360, 320×180; Hochformat 9:16: 540×960, 360×640, 180×320 —
und MUST genau dem Seitenverhältnis des Canvas entsprechen, mit zwei geraden
Kantenlängen. Die Datei MUST ein MP4 mit einer H.264-Videospur (yuv420p) und
einer AAC-Tonspur (48 kHz, Stereo) sein. Die Videospur MUST nach BT.709
umgerechnet und als BT.709 (Matrix, Primärfarben, Übertragungsfunktion,
begrenzter Wertebereich) gekennzeichnet sein. Die Tonspur MUST die Musikspur
(Spec music-track) und die Erzählungsspur (Spec narration-track) sowie, soweit
vorhanden, den Ton der Videoclips enthalten, im Verhältnis des globalen Pegels
`clipAudioBalance`, aus den Originaldateien gemischt und so lang wie die
Videospur; ohne jede dieser Tonquellen MUST sie stumm sein. Der Schritt
„Qualität“ MUST für jedes Profil, in der Reihenfolge groß zu klein, die
Pixelgröße für das aktuelle Canvas-Format, eine geschätzte Dateigröße und
einen kurzen Empfehlungstext anzeigen: „Hohe Qualität“ — zum Ansehen auf einem
großen Bildschirm; „Kleine Datei“ — zum Weitergeben, etwa per USB-Stick; „Für
E-Mail/Web“ — kleinste Datei, zum Versenden oder Hochladen.

#### Scenario: Kleine Datei
- **WHEN** ein Benutzer in einem Projekt mit Querformat 16:9 ohne Musik,
  Erzählung oder Videoclip-Ton das Profil „Kleine Datei“ wählt und den Export
  abschließt
- **THEN** hat die Datei eine H.264-Videospur mit 640×360 Pixeln und 30 fps
  sowie eine stumme AAC-Tonspur

#### Scenario: Kleine Datei im Hochformat
- **WHEN** ein Benutzer in einem Projekt mit Hochformat 9:16 das Profil
  „Kleine Datei“ wählt und den Export abschließt
- **THEN** hat die Datei eine H.264-Videospur mit 360×640 Pixeln und 30 fps

#### Scenario: Film mit Musik
- **WHEN** ein Projekt mit 12,5 s Film und einem 30-s-Musikstück exportiert
  wird
- **THEN** enthält die Datei eine hörbare AAC-Tonspur von 12,5 s Länge, deren
  letzte Sekunde ausgeblendet ist

#### Scenario: Musik lässt sich nicht mischen
- **WHEN** das Mischen der Musik im Backend fehlschlägt
- **THEN** endet der Export mit Status `failed` und dem Code
  `export.audioFailed`, und es bleibt keine Teildatei zurück

#### Scenario: Farbraum gekennzeichnet
- **WHEN** ein exportierter Film mit ffprobe untersucht wird
- **THEN** meldet die Videospur `color_space`, `color_primaries` und
  `color_transfer` als `bt709` und `color_range` als `tv`, und ein reines Rot
  aus der Vorschau ist im dekodierten Film innerhalb der Toleranz rot

#### Scenario: Für E-Mail/Web exportieren
- **WHEN** ein Benutzer in einem Querformat-Projekt das Profil „Für
  E-Mail/Web“ wählt und den Export abschließt
- **THEN** hat die Datei eine H.264-Videospur mit 320×180 Pixeln und 30 fps,
  kleiner als bei den beiden anderen Profilen bei gleichem Projekt

#### Scenario: Empfehlungstext je Profil
- **WHEN** ein Benutzer in einem Projekt mit Hochformat 9:16 den Schritt
  „Qualität“ öffnet
- **THEN** zeigt jedes der drei Profile seine Pixelgröße für das Hochformat
  (540×960, 360×640, 180×320) neben der geschätzten Dateigröße und seinem
  Empfehlungstext in der gewählten Sprache

#### Scenario: Clip-Ton und Erzählung im Export
- **WHEN** ein Projekt mit einem Videoclip mit Tonspur, einem
  Erzählungs-Clip und `clipAudioBalance` 50 exportiert wird
- **THEN** enthält die Tonspur der Datei beide Quellen gemischt, hörbar
  etwa gleich laut

#### Scenario: Reiner Clip-Ton
- **WHEN** `clipAudioBalance` auf 100 steht und das Projekt Musik, aber
  keine Videoclips mit Tonspur enthält
- **THEN** ist die Tonspur der exportierten Datei stumm (Musik ist bei
  diesem Pegel nicht hörbar, und es gibt keinen Clip-Ton)

### Requirement: Export entspricht der Vorschau
Der Export MUST dasselbe Zeitmodell wie die Vorschau verwenden (Spec
preview-player, „Zeitmodell der Diashow“) und die Übergänge mit denselben
Shader-Dateien und Katalogparametern rendern. Die Dauer des Films MUST der
Gesamtdauer der Vorschau auf ein Bild (1/30 s) genau entsprechen. Der Inhalt
MUST wie im Monitor in das Canvas-Format des Projekts eingepasst und mit der
Hintergrundfarbe des Projekts ergänzt werden (Spec canvas). Ein Bild mitten in
einem Übergang MUST dem Bild der Vorschau beim selben Fortschritt
entsprechen: Abweichung je Farbkanal höchstens 2 bei mindestens 99,5 % der
Pixel. Diese Gleichheit MUST für beide Canvas-Formate und beide
Hintergrundfarben geprüft sein, jeweils mit einem Inhalt, dessen
Seitenverhältnis nicht dem Canvas entspricht.

#### Scenario: Dauer des Films
- **WHEN** ein Projekt mit drei Bildern zu je 5 s und zwei Übergängen zu je
  1,25 s exportiert wird
- **THEN** ist der Film 12,50 s lang, mit einer Abweichung von höchstens einem
  Bild

#### Scenario: Hochkant-Bild
- **WHEN** ein Hochkant-Foto in einem Projekt mit Querformat 16:9 exportiert
  wird
- **THEN** ist es vollständig sichtbar und links und rechts mit der
  Hintergrundfarbe des Projekts ergänzt, wie im Vorschaumonitor

#### Scenario: Querformat-Bild im Hochformat
- **WHEN** ein Querformat-Foto in einem Projekt mit Hochformat 9:16 und
  weißem Hintergrund exportiert wird
- **THEN** ist es vollständig sichtbar und oben und unten mit weißer Fläche
  ergänzt, an derselben Stelle wie im Vorschaumonitor

#### Scenario: Übergang wie in der Vorschau
- **WHEN** für einen der sechs Übergänge das Bild bei Fortschritt 0,5 aus der
  Vorschau und aus dem Export verglichen wird
- **THEN** liegen die Abweichungen innerhalb der Toleranz
