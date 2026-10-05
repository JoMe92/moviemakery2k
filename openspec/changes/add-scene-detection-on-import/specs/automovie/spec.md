## MODIFIED Requirements

### Requirement: Automatische Erstellung
Nach Bestätigung MUST die Anwendung alle Bild- und Videoclip-Medien aus
der Mediensammlung in Importreihenfolge in den Bildstreifen einfügen, den
Übergang des gewählten Stils zwischen allen benachbarten Elementen setzen,
den Effekt des Stils (falls vorhanden) auf jedes Bild- und
Videoclip-Element anwenden und ein Titel-Element mit dem eingegebenen
Filmtitel am Anfang sowie eines mit „Ende“ (bzw. „The End“ auf Englisch)
am Schluss einfügen, beide im Titel-Stil des gewählten AutoMovie-Stils.
Video-Medien, deren Szenenerkennung noch läuft (Zustand `detecting`, Spec
scene-detection), MUST dabei übersprungen werden; jede erkannte Szene MUST
dagegen als eigenes Element eingefügt werden. Ist das Filmtitel-Feld leer
oder enthält es nur Leerzeichen, MUST der Titel am Anfang entfallen; der
Titel am Schluss MUST in jedem Fall eingefügt werden. Hat das Projekt eine
Musikspur, MUST anschließend „Film an Musik anpassen“ auf das Ergebnis
angewendet werden. Das entstandene Projekt MUST sich danach wie jedes andere
Projekt bearbeiten lassen.

#### Scenario: Klassischer Stil ohne Musik
- **WHEN** ein Benutzer mit drei Bildern und einem Video in der Sammlung,
  ohne Musik, den Stil „Klassisch“ mit Filmtitel „Urlaub“ wählt
- **THEN** enthält der Bildstreifen danach alle vier Elemente in
  Importreihenfolge, mit „Überblenden“ zwischen allen, einem Titel
  „Urlaub“ am Anfang und „Ende“ am Schluss

#### Scenario: Musikvideo mit Musik
- **WHEN** ein Benutzer mit Musikspur den Stil „Musikvideo“ wählt
- **THEN** enthält der Bildstreifen danach „Kreis“-Übergänge zwischen
  allen Elementen, und die Gesamtlänge entspricht der Musik (Spec
  music-track, „Film an Musik anpassen“)

#### Scenario: Ohne Filmtitel
- **WHEN** ein Benutzer das Filmtitel-Feld leer lässt und einen Stil
  wählt und bestätigt
- **THEN** beginnt der Bildstreifen mit dem ersten Bild, ohne Titel-Element
  und ohne eingehenden Übergang davor, und endet mit dem Titel „Ende“

#### Scenario: Alter Film mit Effekt
- **WHEN** ein Benutzer den Stil „Alter Film“ wählt
- **THEN** trägt jedes Bild- und Videoclip-Element danach den Effekt
  „Film-Alterung Älter“

#### Scenario: Erkannte Szenen als eigene Elemente
- **WHEN** ein Benutzer mit einem in drei Szenen zerlegten Video und ohne
  Bilder in der Sammlung den Stil „Klassisch“ wählt
- **THEN** enthält der Bildstreifen danach drei Videoclip-Elemente in
  Szenenreihenfolge, jeweils mit dem Übergang des Stils dazwischen

#### Scenario: Laufende Erkennung wird übersprungen
- **WHEN** ein Benutzer AutoMovie ausführt, während für ein importiertes
  Video die Szenenerkennung noch läuft
- **THEN** enthält der Bildstreifen danach dieses Video nicht, und die
  übrigen Medien sind wie gewohnt eingefügt
