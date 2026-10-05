## Context

Stand: `develop` nach dem Merge von `add-automovie` (PR #40, Merge
2d21e00). Die Capability `titles-and-credits` ist mit `add-titles-and-credits`
beschlossen, aber noch nicht archiviert; `add-automovie` ist ebenfalls noch
nicht archiviert. Beide Changes sind in `develop` implementiert.

Was heute schon da ist:

- `TITLE_LINE_MAX_LENGTH = 200` in `backend/src/mmy_backend/project.py`,
  als `TitleLine = Annotated[str, Field(max_length=...)]` sowohl für
  `TitleSlide.lines`/`creditEntries` als auch für `TitleOverlay.lines`.
- Derselbe Wert steht als `maxLength: 200` im generierten
  `apps/web/src/generated/openapi.json` (geprüft: unter
  `components.schemas.TitleSlide.properties.lines` und
  `components.schemas.TitleOverlay.properties.lines`) — der API-Vertrag
  trägt die Grenze also bereits, nur die Oberfläche liest sie nicht.
- `apps/web/src/titles/` mit den reinen Titel-Hilfsfunktionen, aus dem
  auch der AutoMovie-Algorithmus schon `newTitleSlide()` benutzt — ein
  gemeinsamer Ort für die Konstante ist damit ohne neue Abhängigkeit da.
- Kein einziges `maxLength` in `apps/web/src/titles/` oder
  `apps/web/src/automovie/` (geprüft).

## Goals / Non-Goals

**Goals:** Ein über 200 Zeichen langer Titeltext ist in der Oberfläche
nicht mehr eingebbar, die Grenze steht genau einmal, und eine Änderung der
Grenze im Backend lässt einen Test der Oberfläche fehlschlagen statt die
beiden Seiten stillschweigend auseinanderlaufen.

**Non-Goals:** siehe proposal.md.

## Decisions

### D1 – Wo die Grenze steht
Das Backend bleibt die einzige Quelle der Wahrheit: `TITLE_LINE_MAX_LENGTH`
in `project.py`, unverändert. Die Oberfläche spiegelt den Wert in **einer**
Konstante in `apps/web/src/titles/` (z. B. `titleText.ts`), die jedes Feld
importiert — kein wiederholtes Literal und keine neue API-Antwort.

Damit die Spiegelung nicht verrutschen kann, prüft ein Komponenten- bzw.
Unit-Test die Konstante gegen `apps/web/src/generated/openapi.json`
(`maxLength` einer Titelzeile). Das ist der gleiche Mechanismus, auf dem
dieses Repository schon arbeitet — „Pydantic-Modelle sind der
API-Vertrag, TS-Typen werden daraus erzeugt“ —, nur dass die generierten
TS-Typen eine Zahl wie `maxLength` nicht als Wert tragen und der Test
deshalb das generierte Schema selbst liest. Verschiebt eine Sitzung die
Grenze im Backend ohne die Oberfläche, wird das Ergebnis von
`pixi run gen-api` den Test rot machen.

### D2 – Blockieren, nicht kürzen
Ein Feld nimmt am Limit keine weiteren Zeichen an (natives `maxlength`
des Eingabefelds). Vorhandener Text wird nie stillschweigend verkürzt, und
es gibt keine Prüfung erst beim Bestätigen: der vom Backend abgelehnte
Zustand entsteht so gar nicht, also braucht es auch keine Fehlermeldung
dafür. Eingefügter längerer Text wird vom Eingabefeld selbst auf die
Grenze beschnitten — das ist die einzige Stelle, an der Text verloren
geht, und sie ist sofort sichtbar.

### D3 – Archivierungsreihenfolge
Diese Change fügt der Capability `titles-and-credits` eine Anforderung
hinzu, die es in `openspec/specs/` noch nicht gibt: die Capability wird
erst mit `add-titles-and-credits` angelegt. `add-titles-and-credits` MUSS
deshalb vor dieser Change archiviert werden. `openspec validate --strict`
erzwingt diese Reihenfolge nicht, darum steht sie hier.

Die Anforderung nennt das Filmtitel-Feld des AutoMovie-Dialogs
ausdrücklich mit, statt die Spec `automovie` zusätzlich zu ändern: die
Grenze ist eine Eigenschaft von Titeltext, gleich wo er eingegeben wird,
und eine zweite Delta-Datei gegen eine ebenfalls noch nicht archivierte
Capability würde die Reihenfolge nur weiter verschränken.
