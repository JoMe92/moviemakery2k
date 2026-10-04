## ADDED Requirements

### Requirement: Canvas eines Projekts
Ein Projekt MUST genau ein Canvas haben, bestehend aus einem Format und einer
Hintergrundfarbe. Das Format MUST entweder **Querformat 16:9** oder
**Hochformat 9:16** sein, die Hintergrundfarbe entweder **schwarz** oder
**weiß**. Andere Werte MUST das Backend ablehnen. Ein neues Projekt MUST
Querformat 16:9 mit schwarzem Hintergrund haben. Das Canvas MUST für das
ganze Projekt gelten — für jedes Bildstreifen-Element, unabhängig von seiner
Art (Bild, Videoclip, Titel) — und es MUST NOT je Element überschreibbar
sein. Das Canvas MUST Teil des gespeicherten Projekts und des OpenAPI-Vertrags
sein (Spec slideshow-project, Requirement „Projektmodell“).

#### Scenario: Neues Projekt
- **WHEN** ein Benutzer Datei → „Neues Projekt“ wählt und die Rückfrage
  bestätigt
- **THEN** hat das Projekt Querformat 16:9 mit schwarzem Hintergrund

#### Scenario: Unbekanntes Format wird abgelehnt
- **WHEN** ein Client ein Projekt mit dem Canvas-Format `1:1` oder der
  Hintergrundfarbe `blau` speichern will
- **THEN** lehnt das Backend die Anfrage mit einem Validierungsfehler ab, und
  das zuletzt gespeicherte Projekt bleibt unverändert

#### Scenario: Canvas gilt für alle Elemente
- **WHEN** ein Projekt mit Hochformat 9:16 ein Hochkant-Foto, ein
  Querformat-Foto und einen Querformat-Videoclip enthält
- **THEN** werden alle drei in dasselbe Hochformat-Canvas eingepasst, und es
  gibt keine Einstellung, die das für ein einzelnes Element ändert

### Requirement: Inhalt in das Canvas einpassen
Der Inhalt eines Bildstreifen-Elements MUST vollständig sichtbar und
seitenverhältnistreu in die Canvas-Fläche eingepasst werden („contain“); er
MUST NOT beschnitten, verzerrt oder über die Fläche hinaus vergrößert werden.
Das **Inhaltsrechteck** eines Elements ist das größte Rechteck mit dem
Seitenverhältnis seines Inhalts, das vollständig in die Canvas-Fläche passt,
mittig darin; bei gleichem Seitenverhältnis von Inhalt und Canvas MUST es die
ganze Fläche sein. Die Fläche außerhalb des Inhaltsrechtecks MUST einfarbig in
der Hintergrundfarbe des Canvas gefüllt sein. Die Einpassung MUST in der
Vorschau und im Export aus derselben Definition folgen (Requirement „Eine
Definition für Vorschau und Export“).

#### Scenario: Inhalt mit dem Seitenverhältnis des Canvas
- **WHEN** ein Foto im Seitenverhältnis 16:9 in einem Querformat-Canvas
  dargestellt wird
- **THEN** füllt es die ganze Fläche aus, und es ist keine Hintergrundfläche
  sichtbar

#### Scenario: Inhalt kleiner als das Canvas
- **WHEN** ein Foto mit 320×240 Pixeln in einem Querformat-Canvas mit
  1280×720 Pixeln dargestellt wird
- **THEN** ist es auf 960×720 vergrößert, mittig, und links und rechts bleiben
  je 160 Pixel Hintergrundfläche

#### Scenario: Kein Zuschneiden
- **WHEN** ein Querformat-Foto im Seitenverhältnis 3:2 in einem
  Hochformat-Canvas dargestellt wird
- **THEN** ist das ganze Foto zu sehen, oben und unten mit Hintergrundfläche
  ergänzt, und kein Bildteil fehlt am Rand

### Requirement: Eine Definition für Vorschau und Export
Canvas-Format, Hintergrundfarbe, Einpassung und Inhaltsrechteck MUST in
Vorschau (WebGL2) und Export (headless GL) aus derselben Definition folgen.
Die Geometrie MUST als reine Funktion je Sprache vorliegen, die beide Seiten
Zeile für Zeile gleich halten, abgesichert durch dieselbe Tabelle von
Testwerten auf beiden Seiten (wie heute `containRect` in der Web-App und
`contain_rect` im Backend) und durch Golden-Frame-Tests, die Vorschau und
Export vergleichen. Die Pixelmaße beider Renderer MUST exakt das
Seitenverhältnis des Canvas haben; eine Näherung MUST NOT verwendet werden.
Für dieselbe Pixelgröße MUST ein Frame aus der Vorschau und ein Frame aus dem
Export bei gleichem Projekt und gleichem Zeitpunkt innerhalb der Toleranz der
Spec movie-export („Export entspricht der Vorschau“) übereinstimmen — in
beiden Canvas-Formaten und mit beiden Hintergrundfarben.

#### Scenario: Golden Frame im Hochformat
- **WHEN** für ein Projekt mit Hochformat 9:16, einem Querformat-Foto und
  weißem Hintergrund je ein Frame aus der Vorschau und aus dem Export in
  gleicher Größe verglichen wird
- **THEN** liegen die Abweichungen innerhalb der Toleranz der Spec
  movie-export, und die Balken oben und unten sind in beiden Frames an
  derselben Stelle und gleich weiß

#### Scenario: Gleiche Testwerte auf beiden Seiten
- **WHEN** ein Reviewer die Einpassung in Web-App und Backend vergleicht
- **THEN** findet er dieselbe Tabelle von Testwerten für Inhaltsrechteck und
  Puffergröße in beiden Sprachen, je Canvas-Format mindestens einen Fall mit
  einem Inhalt, dessen Seitenverhältnis nicht dem Canvas entspricht

#### Scenario: Exaktes Seitenverhältnis
- **WHEN** die Puffergröße der Vorschau und die Ausgabegröße des Exports für
  ein Canvas-Format bestimmt werden
- **THEN** haben beide genau das Seitenverhältnis des Canvas, beide
  Kantenlängen sind gerade, und kein Maß weicht gerundet vom
  Seitenverhältnis ab

### Requirement: Dialog „Filmformat“
Der Dialog „Filmformat“ MUST ein modaler Y2K-Dialog sein, erreichbar über den
Aufgabenbereich-Eintrag „Filmformat festlegen…“ (Spec app-shell). Er MUST zwei
Auswahlgruppen mit je einem zugänglichen Gruppennamen enthalten: „Format“ mit
den Optionen „Querformat 16:9“ und „Hochformat 9:16“ und „Hintergrund“ mit den
Optionen „Schwarz“ und „Weiß“. Beim Öffnen MUST die aktuelle Auswahl des
Projekts gesetzt sein. „OK“ MUST die Auswahl auf das Projekt anwenden (und
damit automatisch speichern, Spec slideshow-project), „Abbrechen“ MUST das
Projekt unverändert lassen. Der Dialog MUST vollständig per Tastatur bedienbar
sein, und alle Texte MUST in Deutsch und Englisch vorliegen (Spec
localization).

#### Scenario: Hochformat wählen
- **WHEN** ein Benutzer den Dialog öffnet, „Hochformat 9:16“ wählt und „OK“
  drückt
- **THEN** zeigt der Vorschaumonitor das Projekt im Hochformat, und die
  Statusleiste meldet den Speicherzustand wie bei jeder anderen Änderung

#### Scenario: Abbrechen
- **WHEN** ein Benutzer im Dialog „Weiß“ wählt und „Abbrechen“ drückt
- **THEN** bleibt der Hintergrund unverändert schwarz, und es wird nichts
  gespeichert

#### Scenario: Aktuelle Auswahl beim Öffnen
- **WHEN** ein Projekt auf Hochformat 9:16 mit weißem Hintergrund steht und
  ein Benutzer den Dialog öffnet
- **THEN** sind „Hochformat 9:16“ und „Weiß“ ausgewählt

#### Scenario: Dialog auf Englisch
- **WHEN** die Sprache Englisch ist und ein Benutzer den Dialog öffnet
- **THEN** heißt er „Movie format“ und bietet „Landscape 16:9“, „Portrait
  9:16“, „Black“ und „White“

### Requirement: Canvas in jedem Layout-Modus
Der Vorschaumonitor MUST das Seitenverhältnis des Canvas in jedem
Layout-Modus beibehalten (breit, mittel, kompakt; Spec mobile-ui). Die
Größenbegrenzungen des Monitors je Modus MUST unverändert gelten; im
Hochformat MUST der Monitor dazu schmaler werden, statt die Begrenzung zu
überschreiten. In keinem Modus MUST die Seite durch das Canvas-Format
horizontal scrollen.

#### Scenario: Hochformat am Handy
- **WHEN** ein Benutzer ein Projekt mit Hochformat 9:16 in einem Fenster von
  390×844 px öffnet
- **THEN** zeigt der Monitor das Hochformat-Canvas innerhalb der
  Höhenbegrenzung des kompakten Layouts, und die Seite hat keine horizontale
  Scrollleiste

#### Scenario: Hochformat am Schreibtisch
- **WHEN** ein Benutzer ein Projekt mit Hochformat 9:16 in einem Fenster von
  1280×720 px öffnet
- **THEN** steht der Monitor hochkant an seinem gewohnten Platz, und das
  Layout kommt ohne horizontales Scrollen der Seite aus
