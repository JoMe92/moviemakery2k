## Why

Das Backend begrenzt eine Titelzeile auf 200 Zeichen
(`TITLE_LINE_MAX_LENGTH` in `backend/src/mmy_backend/project.py`), aber
kein Eingabefeld der Oberfläche begrenzt seine Eingabe — weder die Felder
„Zeile 1/2“ und die Nachspann-Einträge des Titel-Assistenten noch das
Filmtitel-Feld des AutoMovie-Dialogs.

Solange der AutoMovie-Dialog seinen Filmtitel noch verwarf, war das
harmlos. Seit der Filmtitel ein Titel-Element wird (mmy-0pz, Commit
a7a3904), erzeugt ein Filmtitel über 200 Zeichen ein Projekt, das das
Backend ablehnt: das automatische Speichern schlägt fehl, und der
Benutzer bekommt dafür nur die allgemeine Fehlermeldung zu sehen, ohne zu
erfahren, welche Eingabe sie ausgelöst hat. Über den Titel-Assistenten
besteht dieselbe Lücke seit TASK-WEB-066.

Der Fall ist heute erreichbar, und die richtige Behebung ist
übergreifend — eine Grenze an jedem Feld für Titeltext, in zwei
verschiedenen Changes — weshalb die implementierende Sitzung sie korrekt
nicht an einer Stelle behoben, sondern als Discovery gemeldet hat.

## What Changes

- **Jedes Eingabefeld für Titeltext begrenzt seine Eingabe** auf dieselbe
  Grenze, die das Backend erzwingt: die Zeilenfelder und die
  Nachspann-Einträge des Titel-Assistenten und das Filmtitel-Feld des
  AutoMovie-Dialogs.
- **Eine gemeinsame Konstante** in der Oberfläche spiegelt die Grenze des
  Backends, geprüft gegen den generierten API-Vertrag, statt die Zahl je
  Feld zu wiederholen.
- **Die Grenze blockiert, sie kürzt nicht:** am Limit nimmt das Feld keine
  weiteren Zeichen an, vorhandener Text wird nie stillschweigend
  verkürzt.

## Capabilities

### Modified Capabilities

- `titles-and-credits`: begrenzter Titeltext in jedem Eingabefeld, auch
  im Filmtitel-Feld des AutoMovie-Dialogs

## Nicht-Ziele

- Eine andere Grenze als die bestehenden 200 Zeichen des Backends, oder
  eine Änderung an der Zahl der Zeilen (höchstens 2) bzw. der
  Nachspann-Einträge (höchstens 50).
- Eine Zeichenzähler-Anzeige neben dem Feld — das Original hatte keine,
  und ein blockierendes Feld macht den Zustand schon sichtbar.
- Grenzen für andere Textfelder (Projektname, Dateinamen, Suchfelder) —
  dort gibt es heute keinen gemeldeten Fehlerfall.
- Eine Fehlermeldung beim Speichern: mit begrenzten Feldern ist der
  abgelehnte Zustand nicht mehr erreichbar.
