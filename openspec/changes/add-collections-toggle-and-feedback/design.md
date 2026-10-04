## Context

Die Hülle hat heute drei Layout-Modi (Spec `mobile-ui`, Anforderung
Layout-Modi) und je Modus andere Rückmeldeflächen:

| | Symbolleiste | Sammlung | Statusleiste | Kurzhinweis |
|---|---|---|---|---|
| breit (ab 1280 px) | ja | Bereich in der Mitte | ja | **nein** |
| mittel (600–1279 px) | ja | Bereich neben dem Monitor | nein | ja |
| kompakt (< 600 px) | **nein** | Sheet von unten | nein | ja |

Belegt in `apps/web/src/App.tsx`: `AppWindow` bekommt `statusBar` nur im
breiten, `notices` nur im mittleren Layout; das kompakte `CompactWindow`
bekommt immer `notices`. `StatusNotices`
(`apps/web/src/shell/StatusNotices.tsx`) leitet seinen Text heute allein aus
Zustandswechseln ab (Speicher- und Backend-Zustand, 2500 ms) — es gibt keinen
Weg, von einer Aktion aus einen Hinweis auszulösen.

Hinzugefügt wird aus der Sammlung an drei Stellen: die Schaltfläche des
Sammlungs-Sheets (`media/CollectionSheet.tsx`, nur kompakt), Doppelklick auf
eine Kachel und „Zum Storyboard hinzufügen“ bzw. „Zur Musikleiste
hinzufügen“ im Kontextmenü (`media/MediaCollection.tsx`, breit und mittel).
Alle drei rufen `addSlide`/`addMusicClip` und melden nichts zurück.

Der Haptik-Helfer `apps/web/src/ui/haptics.ts` existiert bereits mit den
Mustern `activate`, `drop` und `reject` und mit dem lokal gespeicherten
Schalter „Vibration“.

Vorgaben des Product Owners (2026-10-04, Bead mmy-0v0): eine einzelne
Umschaltfläche für den Sammlungsbereich — nicht die zwei Schaltflächen von
Movie Maker 2.x und kein bloßer Fokussprung; und eine Rückmeldung, dass das
Hinzufügen wirklich passiert ist.

Diese Change setzt auf `add-mobile-layout` auf (Layout-Modi, Taskleiste,
Sammlungs-Sheet, Haptik) und wird nach ihr archiviert; die Spec-Deltas
verändern deren Fassung der Anforderungen, nicht die heutige Fassung in
`openspec/specs/app-shell/spec.md` (D7).

## Goals / Non-Goals

**Goals:** Der Sammlungsbereich lässt sich mit einem Griff wegnehmen und
zurückholen, ohne dass dabei eine Funktion ins Leere läuft. Jedes Hinzufügen
aus der Sammlung ist in jedem Layout-Modus zu sehen, auch für
Hilfstechnologien, und auf Geräten mit Vibration zusätzlich zu fühlen.

**Non-Goals:** siehe proposal.md.

## Decisions

### D1 – Eine Umschaltfläche in der Symbolleiste, Zustand in der Hülle
`Toolbar` nimmt schon heute `children` entgegen und setzt sie links neben die
Sammlungsauswahl — dafür ist der Platz vorgesehen. Dort steht künftig genau
eine Schaltfläche „Sammlungen“ mit dem vorhandenen `FolderIcon`.

Die Beschriftung bleibt in beiden Zuständen gleich, und der Zustand steht in
`aria-pressed` (gedrückt = Bereich sichtbar). Das ist die Semantik einer
Symbolleisten-Umschaltfläche, es passt zum Y2K-Bild einer eingerasteten
Schaltfläche, und `aria-pressed` ist im Projekt bereits die übliche Form
(Kacheln im Sammlungs-Sheet). Verworfen: eine wechselnde Beschriftung
(„Sammlungen ausblenden“ / „Sammlungen anzeigen“) — der zugängliche Name
einer Schaltfläche sollte nicht springen, und zwei Texte je Sprache wären
doppelte Pflege. Ebenfalls verworfen: `aria-expanded` mit `aria-controls` —
das ist das Muster einer Ausklappfläche, nicht einer Symbolleisten-Taste, und
der Bereich ist im eingeklappten Zustand nicht als Fortsetzung der
Schaltfläche zu lesen.

Der Sichtbarkeitszustand gehört in den App-Store neben `collection`, nicht in
`AppWindow`: `setCollection` muss ihn mitsetzen können (D5), und das geht
nicht, wenn er in einer Komponente eingeschlossen ist.

### D2 – Nur die Schaltfläche, kein Menüeintrag und kein Tastenkürzel
Movie Maker 2.x kennt die Sammlungen auch unter „Ansicht“. Diese Change nimmt
den Eintrag nicht auf: Der Product Owner hat die Schaltfläche verlangt, die
Schaltfläche ist per Tabulator erreichbar und erfüllt damit die Anforderung
Grundlegende Barrierefreiheit, und das Menü „Ansicht“ ist heute vollständig
deaktiviert — es zu öffnen, zieht die Frage nach den übrigen Einträgen nach
sich. Der Eintrag ist eine naheliegende spätere Ergänzung und steht als
Nicht-Ziel in proposal.md.

### D3 – Der Zustand wird nicht gemerkt
Drei Möglichkeiten standen zur Wahl: im Projekt (serverseitig, Teil des
Films), lokal im Browser (wie Kachelgröße und Vibrationsschalter) oder gar
nicht.

Gewählt: **gar nicht.** Beim Laden ist der Sammlungsbereich sichtbar.

Das Projekt scheidet aus, weil die Sichtbarkeit eines Bereichs nichts über
den Film aussagt — sie gehörte sonst in jede Projektdatei und in die
Schema-Migration. Gegen das lokale Merken spricht die Anforderung
Movie-Maker-Layout: Sie verspricht, dass beim Start alle Bereiche
gleichzeitig zu sehen sind. Ein gemerkter Zustand würde dieses Versprechen
geräteabhängig brechen, und wer die Schaltfläche beim ersten Mal nicht
wiedererkennt, startet dauerhaft in einem Fenster ohne Sammlungen, ohne zu
wissen, warum. Die Umschaltfläche ist als Griff für den Augenblick gedacht
(„jetzt mehr Platz für den Monitor“), nicht als Einstellung; Einstellungen
haben im Projekt ihren Ort in „Extras → Optionen…“, und dorthin soll sie
gerade nicht.

Folge für D5: Weil der Zustand flüchtig ist, genügt es, ihn beim Wechsel des
Layout-Modus einfach stehen zu lassen — er ist im kompakten Layout
wirkungslos und gilt wieder, sobald die Symbolleiste zurück ist.

### D4 – Ein Hinweiskanal, zwei Darstellungen
Die Bestätigung braucht eine Fläche, die es in allen drei Layout-Modi gibt.
Heute gibt es zwei halbe Lösungen: den Kurzhinweis (kompakt, mittel) und die
Statusleiste (breit).

Gewählt: **ein Kanal im Store, zwei Darstellungen.** Der Store bekommt einen
Kurzhinweis (Text plus laufende Nummer, damit zweimal derselbe Text erneut
erscheint) und eine Aktion, die ihn setzt. Im kompakten und mittleren Layout
zeigt ihn `StatusNotices` wie bisher, im breiten Layout erscheint er als
vorübergehende zusätzliche Angabe in der Statusleiste und verschwindet nach
derselben Zeit (2500 ms) wieder.

Verworfen: den eingeblendeten Hinweisstreifen auch im breiten Layout
verwenden. Am Desktop gibt es die Statusleiste genau für solche Meldungen —
im Original steht dort die kurze Rückmeldung zur letzten Aktion —, und ein
schwebender Streifen über dem Bildstreifen wäre ein Fremdkörper im
Y2K-Fenster. Verworfen auch: eine eigene Toast-Komponente; sie wäre eine
dritte Fläche für dieselbe Sache.

**Vorrang.** Das Hinzufügen löst ein Speichern aus, und „Gespeichert“ würde
die Bestätigung nach Sekundenbruchteilen überschreiben. Darum gilt: Solange
ein Aktionshinweis steht, verdrängt ihn keine Zustandsmeldung; ein neuer
Aktionshinweis ersetzt den alten sofort (wer zweimal schnell hinzufügt, liest
die neuere Zahl). Das dauerhafte Warnsymbol „Speichern fehlgeschlagen“ in der
Titelleiste ist davon nicht betroffen — es ist kein Kurzhinweis.

### D5 – Nichts darf ins Leere laufen
Mit ausgeblendetem Bereich dürfen „Sammlungen anzeigen“, „Videoübergänge
anzeigen“, der Import und die Sammlungsauswahl der Symbolleiste nicht
wirkungslos aussehen. Statt jede dieser Stellen einzeln anzufassen, blendet
**`setCollection` selbst** den Bereich wieder ein: Alle genannten Wege gehen
bereits durch diese Aktion (`shell/tasks.ts`, `Toolbar`), und im kompakten
Layout, wo sie zusätzlich das Sheet öffnet, bleibt sie wirkungslos. Eine
Stelle, keine vergessenen Pfade.

Die Sammlungsauswahl bleibt bei ausgeblendetem Bereich bedienbar und
eingeblendet; sie zu deaktivieren wäre eine zweite Regel, die man sich merken
müsste, und sie ist der schnellste Weg zurück.

### D6 – Die Bestätigung besteht aus Text und Sichtbarkeit, Haptik kommt dazu
Der Kurzhinweis nennt die Anzahl und die Art: „3 Bilder hinzugefügt“, „1
Musikstück hinzugefügt“, mit den vorhandenen Pluralregeln der
Übersetzungsschicht (`i18n/t.ts` kennt `one`/`other`) und in `de` und `en`.
Da `StatusNotices` bereits `role="status"` mit `aria-live="polite"` trägt,
liest eine Sprachausgabe die Bestätigung ohne weiteres Zutun vor; die
Statusleiste bekommt dieselbe Auszeichnung für ihre vorübergehende Angabe.

Dazu kommt, dass die neuen Elemente **sichtbar gescrollt** werden — sonst
behauptet der Text etwas, das man nicht nachprüfen kann, genau der Fall des
Product Owners (Sheet zu, Bildstreifen weit gescrollt). Gescrollt wird auf
das zuletzt hinzugefügte Element; die Auswahl bleibt unverändert, damit die
Einfügestelle für ein weiteres Hinzufügen bleibt, wo sie war.

Die Haptik nutzt das vorhandene Muster `drop` — „etwas ist im Bildstreifen
gelandet“ ist genau seine Bedeutung — und damit auch den vorhandenen
Schalter „Vibration“. Kein neues Muster, keine neue Einstellung. Ohne
Vibrations-API bleibt alles beim Text; die Rückmeldung ist nie allein
haptisch.

### D7 – Verhältnis zu den anderen offenen Changes
`add-mobile-layout` ändert dieselbe Anforderung Movie-Maker-Layout
(breiter Modus, Verweis auf die Spec `mobile-ui`) und ist bereits umgesetzt,
aber noch nicht archiviert. Das Delta dieser Change schreibt deshalb die
Fassung aus `add-mobile-layout` fort und setzt voraus, dass diese Change
**nach** `add-mobile-layout` archiviert wird. Dasselbe gilt für die
Anforderungen der Spec `mobile-ui`, die es bisher nur dort gibt.

Mit `add-canvas-format`, `add-mobile-delivery`, `add-video-import`,
`add-effects-catalog`, `add-titles-and-credits` und `add-automovie` gibt es
keine Überschneidung: Alle ändern an `app-shell` die Anforderungen
Aufgabenbereich mit drei Schritten bzw. Menüs mit funktionalem Kern, nicht
Movie-Maker-Layout.

### D8 – Prüfbarkeit
Alles hier ist Komponentenverhalten und wird mit Vitest geprüft: die
Schaltfläche samt `aria-pressed` und dem Verschwinden des Bereichs je
Layout-Modus, das Wiedereinblenden über `setCollection`, der Vorrang des
Aktionshinweises vor „Gespeichert“, die beiden Darstellungen des Kurzhinweises
und die Pluralformen in beiden Sprachen. Ein Playwright-Test fährt den Weg des
Product Owners am Handy ab: mehrere Bilder wählen, hinzufügen, Bestätigung
lesen, Bilder im Bildstreifen sehen. Die Vibration wird über einen
Stellvertreter für `navigator.vibrate` geprüft, wie `ui/haptics.test.tsx` es
schon tut.
