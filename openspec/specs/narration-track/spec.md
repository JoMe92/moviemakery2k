# narration-track Specification

## Purpose
Die Erzählungsspur des Films: Clips mit absoluter Startzeit auf der
Filmzeitachse, die Aufnahme über das Mikrofon des Geräts und die
Erzählungsleiste, in der sie verschoben, gekürzt und in der Lautstärke
geändert werden.

## Requirements

### Requirement: Erzählungsspur
Ein Projekt MUST eine Erzählungsspur mit höchstens 100 Erzählungs-Clips
haben. Jeder Clip verweist auf ein Audio-Medium und hat eine **absolute
Startzeit** auf der Filmzeitachse (anders als die Musikspur, die
lückenlos nacheinander ab 0:00 spielt), einen Anfang und ein Ende
innerhalb der Aufnahme (Standard: ganze Aufnahme), eine Lautstärke von
0–200 % (Standard 100 %) sowie die Schalter „Einblenden“ und „Ausblenden“
(je 1 s, Standard aus). Clips MAY sich zeitlich überlappen; überlappende
Abschnitte MUST gemeinsam hörbar gemischt werden, keiner MUST den anderen
automatisch verdrängen oder ersetzen.

#### Scenario: Erzählung an fester Stelle
- **WHEN** ein Erzählungs-Clip mit `at` = 0:05 und 3 s Länge in einem
  Projekt mit mehr Elementen vorkommt
- **THEN** ist die Aufnahme ausschließlich zwischen 0:05 und 0:08 hörbar,
  unabhängig davon, was an dieser Stelle im Bildstreifen steht

#### Scenario: Überlappende Erzählung
- **WHEN** zwei Erzählungs-Clips sich zeitlich um 1 s überlappen
- **THEN** sind in der Überlappung beide Aufnahmen gemischt hörbar, und
  keine der beiden wird automatisch gekürzt oder entfernt

### Requirement: Erzählung aufnehmen
Ein Aufnahme-Knopf MUST bei laufender Wiedergabe über das Mikrofon des
Geräts aufnehmen. Die Startzeit der Aufnahme MUST die Wiedergabeposition
im Moment des Aufnahmestarts sein. Nach dem Stoppen MUST automatisch ein
neuer Erzählungs-Clip mit dieser Startzeit und der vollen Aufnahmedauer
entstehen, und die Aufnahme MUST dauerhaft als Audio-Medium gespeichert
werden (Spec media-library).

#### Scenario: Erzählung aufnehmen
- **WHEN** ein Benutzer bei laufender Wiedergabe an Position 0:10 die
  Aufnahme startet, 4 s spricht und stoppt
- **THEN** entsteht ein Erzählungs-Clip mit `at` = 0:10 und 4 s Länge, und
  die Aufnahme erscheint auch in der Mediensammlung

#### Scenario: Kein Mikrofon verfügbar
- **WHEN** ein Benutzer die Aufnahme startet, aber der Zugriff auf das
  Mikrofon verweigert oder kein Mikrofon vorhanden ist
- **THEN** zeigt die Anwendung eine verständliche Meldung, und es entsteht
  kein Erzählungs-Clip

### Requirement: Erzählungsleiste
Eine Erzählungsleiste MUST unter der Musikleiste alle Erzählungs-Clips an
ihrer absoluten Position zeigen. Ein Benutzer MUST einen Clip verschieben
(neue Startzeit), kürzen, seine Lautstärke ändern und ihn entfernen können
(Kontextmenü oder Entf bei fokussiertem Clip, mit Rückfrage beim
Entfernen).

#### Scenario: Clip verschieben
- **WHEN** ein Benutzer einen Erzählungs-Clip von `at` 0:10 auf `at` 0:15
  zieht
- **THEN** ist die Aufnahme danach ab 0:15 hörbar, nicht mehr ab 0:10

#### Scenario: Clip entfernen
- **WHEN** ein Benutzer einen Erzählungs-Clip löscht und die Rückfrage
  bestätigt
- **THEN** verschwindet er aus der Erzählungsleiste, und das zugehörige
  Audio-Medium bleibt in der Mediensammlung erhalten
