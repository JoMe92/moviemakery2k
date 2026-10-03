## ADDED Requirements

### Requirement: AutoMovie-Katalog
Das System MUST einen Katalog von AutoMovie-Stilen bereitstellen. Jeder
Eintrag MUST eine stabile ID, einen deutschen und englischen Namen, eine
Kurzbeschreibung, einen Übergang, optional einen Effekt, einen Titel-Stil
und eine Angabe, ob er eine Musikspur voraussetzt, enthalten. Der Katalog
MUST genau diese drei Einträge enthalten: Klassisch, Alter Film,
Musikvideo (dieser mit vorausgesetzter Musikspur).

#### Scenario: Katalog abrufen
- **WHEN** ein Client den AutoMovie-Katalog abruft
- **THEN** erhält er drei Einträge mit ID, Namen, Beschreibung, Übergang,
  optionalem Effekt, Titel-Stil und der Musik-Voraussetzung

### Requirement: AutoMovie-Dialog
Extras → „AutoMovie…“ MUST einen modalen Y2K-Dialog mit einem
Filmtitel-Feld und einer Auswahl der drei Stile öffnen. Ein Stil, der eine
Musikspur voraussetzt, MUST deaktiviert sein, solange das Projekt keine
Musik hat. Ist der Bildstreifen beim Bestätigen nicht leer, MUST eine
Rückfrage erscheinen, bevor er ersetzt wird.

#### Scenario: Stil ohne Musik nicht wählbar
- **WHEN** ein Benutzer ohne Musikspur den Dialog öffnet
- **THEN** ist „Musikvideo“ deaktiviert, „Klassisch“ und „Alter Film“ sind
  wählbar

#### Scenario: Rückfrage vor dem Ersetzen
- **WHEN** ein Benutzer mit einem nicht leeren Bildstreifen einen Stil
  wählt und „Erstellen“ bestätigt
- **THEN** erscheint eine Rückfrage, und erst nach deren Bestätigung wird
  der Bildstreifen ersetzt

### Requirement: Automatische Erstellung
Nach Bestätigung MUST die Anwendung alle Bild- und Videoclip-Medien aus
der Mediensammlung in Importreihenfolge in den Bildstreifen einfügen, den
Übergang des gewählten Stils zwischen allen benachbarten Elementen setzen,
den Effekt des Stils (falls vorhanden) auf jedes Bild- und
Videoclip-Element anwenden und ein Titel-Element mit dem eingegebenen
Filmtitel am Anfang sowie eines mit „Ende“ (bzw. „The End“ auf Englisch)
am Schluss einfügen, beide im Titel-Stil des gewählten AutoMovie-Stils.
Hat das Projekt eine Musikspur, MUST anschließend „Film an Musik
anpassen“ auf das Ergebnis angewendet werden. Das entstandene Projekt
MUST sich danach wie jedes andere Projekt bearbeiten lassen.

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

#### Scenario: Alter Film mit Effekt
- **WHEN** ein Benutzer den Stil „Alter Film“ wählt
- **THEN** trägt jedes Bild- und Videoclip-Element danach den Effekt
  „Film-Alterung Älter“
