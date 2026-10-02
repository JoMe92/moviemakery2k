## Purpose

Das Diashow-Projekt: geordneter Bildstreifen mit Bilddauern und Übergängen,
seine Bearbeitung per Drag & Drop im Storyboard sowie automatisches Speichern
und Wiederherstellen.

## ADDED Requirements

### Requirement: Projektmodell
Ein Projekt MUST aus einer geordneten Liste von Bildstreifen-Elementen
bestehen. Jedes Element verweist auf ein Medium und hat eine Anzeigedauer
(0,5–60 s in Schritten von 0,25 s, Standard 5,0 s). Jedes Element außer dem
ersten MAY genau einen eingehenden Übergang vom vorherigen Element haben,
bestehend aus Katalog-ID und Dauer (0,25–5 s in Schritten von 0,25 s,
Standard: Wert aus dem Katalog). Der Übergang gehört zu dem Element, in das er
überblendet (wie in Movie Maker). Ein Medium MAY mehrfach im Bildstreifen vorkommen. Das gespeicherte
Projekt MUST eine Schema-Version tragen.

#### Scenario: Ungültiges Projekt wird abgelehnt
- **WHEN** ein Client ein Projekt speichern will, das auf ein unbekanntes
  Medium oder eine unbekannte Übergangs-ID verweist oder eine Dauer außerhalb
  des Bereichs enthält
- **THEN** lehnt das Backend die Anfrage mit einem Validierungsfehler ab, und
  das zuletzt gespeicherte Projekt bleibt unverändert

### Requirement: Bilder in den Bildstreifen ziehen
Benutzer MUST Bilder aus der Sammlung per Drag & Drop an eine beliebige
Position im Storyboard ziehen können. Eine Einfügemarke MUST die Zielposition
anzeigen. Ein Doppelklick auf eine Kachel in der Sammlung MUST das Bild ans
Ende anhängen. Dasselbe MUST per Tastatur möglich sein.

#### Scenario: Einfügen zwischen zwei Bildern
- **WHEN** ein Benutzer ein Bild aus der Sammlung zwischen das erste und das
  zweite Element des Bildstreifens zieht
- **THEN** steht das Bild an Position 2, und die übrigen Elemente rücken nach

#### Scenario: Anhängen per Doppelklick
- **WHEN** ein Benutzer in der Sammlung doppelt auf ein Bild klickt
- **THEN** wird es als letztes Element mit der Standarddauer angehängt

### Requirement: Bildstreifen bearbeiten
Benutzer MUST Elemente im Storyboard per Drag & Drop umsortieren, ein Element
auswählen und mit Entf, über das Kontextmenü oder über Bearbeiten → Löschen
entfernen können. Die Anzeigedauer eines Elements MUST über einen
Eigenschaftendialog (Doppelklick oder Kontextmenü) änderbar sein. Jede
Storyboard-Kachel MUST Thumbnail, laufende Nummer und Dauer zeigen sowie einen
deaktivierten Effekt-Platz (für spätere Videoeffekte).

#### Scenario: Umsortieren
- **WHEN** ein Benutzer das dritte Element an die erste Position zieht
- **THEN** ist es das erste Element; sein eingehender Übergang entfällt, weil
  das erste Element keinen Vorgänger hat, alle anderen Elemente behalten ihren
  eingehenden Übergang

#### Scenario: Dauer ändern
- **WHEN** ein Benutzer für ein Element die Dauer 2,5 s einträgt und bestätigt
- **THEN** zeigt die Kachel 2,5 s, und die Gesamtdauer im Monitor
  aktualisiert sich

#### Scenario: Dauer außerhalb des Bereichs
- **WHEN** ein Benutzer 0,1 s einträgt
- **THEN** wird der Wert nicht übernommen, und der Dialog nennt den erlaubten
  Bereich

### Requirement: Übergänge setzen und entfernen
Zwischen zwei Storyboard-Kacheln MUST ein Übergangsplatz sichtbar sein. Ein
Benutzer MUST einen Übergang aus dem Übergangskatalog per Drag & Drop auf
diesen Platz setzen können; ein vorhandener Übergang wird dabei ersetzt. Über
den Übergangsplatz (Doppelklick oder Kontextmenü) MUST sich die
Übergangsdauer ändern und der Übergang entfernen lassen. Ein leerer Platz
bedeutet harter Schnitt.

#### Scenario: Übergang setzen
- **WHEN** ein Benutzer „Kreis“ aus dem Katalog auf den Platz zwischen Bild 1
  und Bild 2 zieht
- **THEN** zeigt der Platz das Symbol und den Namen von „Kreis“ mit seiner
  Standarddauer, und bei der Wiedergabe läuft dort dieser Übergang

#### Scenario: Übergang entfernen
- **WHEN** ein Benutzer am Übergangsplatz „Übergang entfernen“ wählt
- **THEN** ist der Platz wieder leer, und die Bilder folgen mit hartem Schnitt
  aufeinander

### Requirement: Automatisches Speichern und Wiederherstellen
Jede Änderung am Projekt MUST ohne Benutzeraktion im Backend gespeichert
werden, spätestens etwa eine Sekunde nach der letzten Änderung. Beim Öffnen der
Anwendung MUST das zuletzt gespeicherte Projekt geladen werden.

#### Scenario: Neuladen nach Bearbeitung
- **WHEN** ein Benutzer vier Bilder in den Bildstreifen zieht, zwei Übergänge
  setzt, zwei Sekunden wartet und die Seite neu lädt
- **THEN** sind Reihenfolge, Dauern und Übergänge unverändert wiederhergestellt
