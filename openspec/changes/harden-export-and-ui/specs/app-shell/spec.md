## MODIFIED Requirements

### Requirement: Grundlegende Barrierefreiheit
Alle interaktiven Elemente MUST echte Schaltflächen bzw. Menüelemente mit
zugänglichem Namen sein, einen sichtbaren Fokus haben und per Tastatur
erreichbar sein. Innerhalb eines Dialogs MUST jeder zugängliche Name einer
Schaltfläche eindeutig sein.

#### Scenario: Bedienung per Tastatur
- **WHEN** ein Benutzer nur mit der Tab-Taste durch die Oberfläche navigiert
- **THEN** erreicht er Menüleiste, Aufgabenbereich, Sammlung, Player-Steuerung
  und Storyboard, und der Fokus ist jederzeit sichtbar

#### Scenario: Eindeutige Namen im Fehlerdialog
- **WHEN** ein Fehlerdialog mit der Schaltfläche „Schließen“ geöffnet ist
- **THEN** heißt die Schaltfläche in der Titelleiste „Dialog schließen“, und
  kein zweites Element im Dialog trägt den Namen „Schließen“
