## ADDED Requirements

### Requirement: Rückgängig und Wiederholen
Jede Änderung am Bildstreifen oder an der Musikspur (Hinzufügen, Entfernen,
Umsortieren, Anzeigedauer, Übergang, Kürzen, Lautstärke, Blenden) MUST über
Bearbeiten → „Rückgängig“ bzw. Strg+Z rückgängig gemacht werden können, und
eine rückgängig gemachte Änderung MUST über Bearbeiten → „Wiederholen“ bzw.
Strg+Y oder Strg+Umschalt+Z wiederholt werden können. Der Verlauf MUST
mindestens 50 Schritte zurückreichen. Eine neue Änderung, die auf ein
Rückgängig folgt, MUST den Wiederholen-Verlauf verwerfen. „Rückgängig“ MUST
deaktiviert sein, solange keine rückgängig machbare Änderung vorliegt;
„Wiederholen“ entsprechend, solange nichts rückgängig gemacht wurde. Der
Verlauf MUST ein Neuladen der Seite nicht überstehen.

#### Scenario: Umsortieren rückgängig machen
- **WHEN** ein Benutzer ein Bild im Bildstreifen umsortiert und danach
  Strg+Z drückt
- **THEN** steht das Bild wieder an seiner vorherigen Position, und
  Bearbeiten → „Wiederholen“ ist jetzt aktiviert

#### Scenario: Wiederholen nach Rückgängig
- **WHEN** ein Benutzer eine Änderung rückgängig gemacht und danach Strg+Y
  gedrückt hat
- **THEN** ist die Änderung wieder wirksam, und „Wiederholen“ ist deaktiviert,
  solange keine weitere rückgängig gemachte Änderung vorliegt

#### Scenario: Neue Änderung verwirft den Wiederholen-Verlauf
- **WHEN** ein Benutzer eine Änderung rückgängig macht und danach eine neue,
  andere Änderung vornimmt
- **THEN** ist Bearbeiten → „Wiederholen“ deaktiviert

#### Scenario: Leerer Verlauf nach Neuladen
- **WHEN** ein Benutzer mehrere Änderungen vorgenommen hat und die Seite neu
  lädt
- **THEN** sind „Rückgängig“ und „Wiederholen“ deaktiviert, und der zuletzt
  gespeicherte Stand ist geladen

#### Scenario: Tastenkombination im Textfeld
- **WHEN** der Fokus in einem Eingabefeld eines Dialogs liegt und ein
  Benutzer Strg+Z drückt
- **THEN** bearbeitet dies nur den Text im Feld (natives
  Browser-Verhalten), nicht den Projekt-Verlauf

### Requirement: Ausschneiden, Kopieren, Einfügen
Ein ausgewähltes Bildstreifen-Element oder Musikstück MUST sich über
Bearbeiten → „Ausschneiden“/„Kopieren“ bzw. Strg+X/Strg+C in eine interne
Zwischenablage legen lassen; „Ausschneiden“ MUST das Element zusätzlich
entfernen. Die Zwischenablage MUST höchstens ein Element halten; jedes
Kopieren oder Ausschneiden MUST den bisherigen Inhalt unabhängig von dessen
Art ersetzen. Bearbeiten → „Einfügen“ bzw. Strg+V MUST ein neues Element mit
dem Inhalt der Zwischenablage in der zur Art der Zwischenablage passenden
Reihe einfügen — direkt nach einem ausgewählten Element derselben Art, sonst
am Ende der Reihe — und MUST das neue Element auswählen. Ein eingefügtes
Bildstreifen-Element MUST ohne eingehenden Übergang eingefügt werden (harter
Schnitt). Ausschneiden, Kopieren und Einfügen MUST je einen eigenen
Rückgängig-Schritt erzeugen (Ausschneiden genau einen für den gesamten
Vorgang). „Ausschneiden“ und „Kopieren“ MUST deaktiviert sein, solange keine
Auswahl besteht; „Einfügen“ MUST deaktiviert sein, solange die
Zwischenablage leer ist.

#### Scenario: Bild kopieren und einfügen
- **WHEN** ein Benutzer ein Bildstreifen-Element wählt, Strg+C drückt und
  danach Strg+V
- **THEN** erscheint ein neues Element mit demselben Bild und derselben
  Anzeigedauer direkt nach dem Original, ohne eingehenden Übergang, und ist
  ausgewählt

#### Scenario: Musikstück ausschneiden und einfügen
- **WHEN** ein Benutzer ein Musikstück wählt, Strg+X drückt und an anderer
  Stelle Strg+V
- **THEN** ist das Original aus der Musikspur entfernt, und ein neues
  Musikstück mit denselben Kürzungen, derselben Lautstärke und denselben
  Blenden erscheint an der eingefügten Stelle; Strg+Z macht den gesamten
  Ausschneiden-Vorgang in einem Schritt rückgängig

#### Scenario: Einfügen ohne Auswahl
- **WHEN** die Zwischenablage ein kopiertes Bild enthält, aktuell aber
  nichts ausgewählt ist, und ein Benutzer Strg+V drückt
- **THEN** wird das Bild als letztes Element an den Bildstreifen angehängt

#### Scenario: Einfügen bei leerer Zwischenablage
- **WHEN** die Zwischenablage leer ist
- **THEN** ist Bearbeiten → „Einfügen“ deaktiviert, und Strg+V bleibt ohne
  Wirkung

#### Scenario: Neuer Inhalt ersetzt die Zwischenablage
- **WHEN** ein Benutzer zuerst ein Bild kopiert und danach ein Musikstück
  kopiert
- **THEN** enthält die Zwischenablage nur noch das Musikstück, und
  „Einfügen“ fügt jetzt in die Musikspur ein
