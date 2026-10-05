## Context

Stand: `develop` nach dem Merge von `add-automovie` (PR #40, Merge
2d21e00). Die Capability `music-track` ist archiviert
(`openspec/specs/music-track/spec.md`); `add-timeline-editing`,
`add-titles-and-credits` und `add-automovie` sind implementiert und in
`develop`, aber noch nicht archiviert.

`apps/web/src/timeline/fitToMusic.ts` ist heute eine reine Funktion über
`TimelineSlide[]`:

- `uniformTotal(slides, d)` misst die Gesamtdauer, wenn **alle** Elemente
  die Dauer `d` haben, und `movieDurationWith(slides, durations)` die
  Gesamtdauer für eine Liste von Dauern — beide über `buildTimeline`, das
  Überlappungsmodell der Übergänge also schon korrekt;
- die gleichmäßige Dauer wird per Bisektion gesucht (`uniformTotal` ist
  monoton in `d`), auf 0,25 s gerundet, auf 0,5–60 s begrenzt, und der
  Rest geht auf das letzte Element;
- `canFitToMusic(slideCount, musicDuration)` entscheidet über die
  Verfügbarkeit des Menüeintrags.

Die Lücke sitzt nicht in dieser Funktion, sondern zwischen ihr und ihrem
Aufrufer: sie rechnet mit allen Elementen, der Store setzt die Dauer aber
nur bei den dehnbaren. Die Korrektur gehört deshalb in die Funktion — sie
muss von sich aus wissen, welche Elemente sie bewegen darf.

## Goals / Non-Goals

**Goals:** „Film an Musik anpassen“ trifft die Länge der Musik genau,
gleich welche Elementarten der Bildstreifen enthält; der nicht erreichbare
Fall ist benannt und meldet eine ehrliche Zahl; der Vertrag von
`fitToMusic` steht an einer Stelle statt zwischen Funktion und Aufrufer.

**Non-Goals:** siehe proposal.md.

## Decisions

### D1 – Dehnbar ist, wer eine eigene Anzeigedauer hat
Ein Bild-Element und ein Titel-Element sind dehnbar: ihre Dauer ist genau
die Zeit, die sie im Film zu sehen sind, und sie zu ändern verliert
nichts. Ein Videoclip ist fest: seine Länge ist `trimOut − trimIn`, also
ein Ausschnitt einer Datei, und ihn zu dehnen hieße, das Material zu
verändern (Nicht-Ziel von `add-timeline-editing`) oder den Schnitt des
Benutzers zu verschieben.

Das ist zugleich die Regel, nach der der Store heute schon arbeitet
(„alles außer Video“) — sie wird hier nur aus dem Aufrufer in die Funktion
und in die Spec gezogen, statt neu erfunden.

### D2 – Gesucht wird die gleichmäßige Dauer der dehnbaren Elemente
Der bestehende Algorithmus bleibt, nur die Suchgröße wechselt: bisektiert
wird die gleichmäßige Dauer der **dehnbaren** Elemente, gemessen wird die
Gesamtdauer aber weiterhin über den **ganzen** Bildstreifen
(`movieDurationWith` mit den festen Clips an ihrer echten Länge). So
bleibt die Überlappung eines Übergangs an der Grenze zwischen einem festen
und einem dehnbaren Element richtig gerechnet — sie hängt von beiden
Nachbardauern ab (`min(T, d_links/2, d_rechts/2)`), weshalb „Musiklänge
minus Clip-Länge“ als Zielwert für die Bilder gerade nicht ausreicht.

Rundung (0,25 s), Grenzen (0,5–60 s) und der Rest auf dem **letzten
dehnbaren** Element bleiben wie bisher; enthält der Bildstreifen keinen
Videoclip, liefert das Zeichen für Zeichen dasselbe Ergebnis wie heute.

### D3 – Nicht erreichbar deckt den Bildstreifen ohne dehnbares Element mit ab
Die Grenzen `minTotal`/`maxTotal` werden mit den dehnbaren Elementen auf
0,5 s bzw. 60 s und den festen Clips an ihrer echten Länge gemessen.
Liegt die Musiklänge darüber oder darunter, nennt der Dialog wie bisher
die erreichbare Dauer und es wird nichts geändert.

Der Bildstreifen aus lauter Videoclips braucht dafür keinen eigenen
Zweig: dort ist `minTotal = maxTotal =` die Länge des Films, und jede
davon abweichende Musiklänge fällt in genau diese bestehende Meldung. Nur
der Text muss beide Richtungen schon können, was er tut („höchstens“ /
„mindestens“).

### D4 – Der Menüeintrag bleibt verfügbar, solange es Elemente und Musik gibt
`canFitToMusic` entscheidet weiter nur über „mindestens ein Element und
Musik vorhanden“. Ein Bildstreifen aus lauter festen Clips wird **nicht**
deaktiviert, sondern beantwortet: der Benutzer erfährt im Dialog, welche
Dauer erreichbar ist, statt vor einem Eintrag zu stehen, dessen
Deaktivierung er sich nicht erklären kann. Die Spec sagt dafür „ohne
Elemente“ statt „ohne Bilder“ — die bisherige Formulierung stammt aus der
Zeit, als der Bildstreifen nur Bilder enthielt.

### D5 – AutoMovie bleibt unverändert
Die Spec `automovie` („Musikvideo mit Musik“: „die Gesamtlänge entspricht
der Musik“) verweist schon heute auf diese Anforderung und wird mit ihr
wieder wahr; an `add-automovie` ist nichts zu ändern. Der dort
dokumentierte Test, der die ungenaue Länge mit einem festen Videoclip
festhielt, ist mit dieser Change zu einem exakten Fall zu machen.
