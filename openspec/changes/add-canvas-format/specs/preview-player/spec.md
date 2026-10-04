## MODIFIED Requirements

### Requirement: Darstellung im Monitor
Der Monitor MUST ein Bild im Seitenverhältnis des Canvas des Projekts (Spec
canvas) zeigen, nicht in einem festen Seitenverhältnis. Die Fläche MUST die
Hintergrundfarbe des Canvas tragen. Bild- und Videoclip-Inhalte MUST
vollständig sichtbar und seitenverhältnistreu in diese Fläche eingepasst
werden (Spec canvas, Requirement „Inhalt in das Canvas einpassen“); die
freien Flächen tragen die Hintergrundfarbe. Wechselt das Canvas des Projekts,
MUST der Monitor sofort das neue Seitenverhältnis und die neue
Hintergrundfarbe zeigen, ohne die Wiedergabeposition oder die Auswahl zu
verlieren. Die Wiedergabe MUST flüssig mit der Bildwiederholrate des Browsers
laufen; bei vier Bildern mit 1920 Pixeln Kante darf es auf einem üblichen
Laptop keine sichtbaren Ruckler bei Übergängen geben.

#### Scenario: Hochkant-Bild
- **WHEN** ein Hochkant-Foto in einem Projekt mit Querformat 16:9 und
  schwarzem Hintergrund wiedergegeben wird
- **THEN** ist es vollständig sichtbar, mittig, mit schwarzen Balken links und
  rechts

#### Scenario: Querformat-Bild im Hochformat
- **WHEN** ein Querformat-Foto in einem Projekt mit Hochformat 9:16
  wiedergegeben wird
- **THEN** ist es vollständig sichtbar, mittig, mit Balken oben und unten, und
  der Monitor ist hochkant

#### Scenario: Weißer Hintergrund
- **WHEN** das Canvas auf weißen Hintergrund gestellt ist und ein Hochkant-Foto
  im Querformat wiedergegeben wird
- **THEN** sind die Balken links und rechts weiß, nicht schwarz

#### Scenario: Format wechseln bei gestoppter Wiedergabe
- **WHEN** ein Benutzer die Wiedergabe bei 0:00:04,00 pausiert und das Canvas
  von Querformat auf Hochformat umstellt
- **THEN** zeigt der Monitor sofort denselben Zeitpunkt im neuen Format, und
  die Suchleiste steht unverändert bei 0:00:04,00
