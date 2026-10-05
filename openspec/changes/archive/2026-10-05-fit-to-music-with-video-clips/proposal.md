## Why

„Film an Musik anpassen“ verspricht, dass der Film so lange dauert wie die
Musik. Seit es Videoclips im Bildstreifen gibt, hält der Eintrag das nicht
mehr ein: `fitToMusic` verteilt die Zieldauer gleichmäßig über alle
Elemente, der Aufrufer setzt die neue Dauer aber nur bei Elementen mit
einer Anzeigedauer — die Länge eines Videoclips ist sein Trimmfenster und
wird bewusst nicht gestreckt (Nicht-Ziel von `add-timeline-editing`).
Enthält der Bildstreifen einen Videoclip, landet der Film deshalb *neben*
der Musik statt auf ihr: gemessen 51,25 s bei 60 s Musik für drei Bilder
und einen 7,5-s-Clip (Discovery auf mmy-46b).

Das trifft nicht nur den Menüeintrag. AutoMovie nimmt immer die ganze
Mediensammlung, wendet die Anpassung selbst an und verspricht für den Stil
„Musikvideo“ ausdrücklich, dass „die Gesamtlänge der Musik entspricht“ —
jeder Benutzer mit einem importierten Video trifft den Fehler also bei
jedem AutoMovie-Lauf, während der Menüeintrag nur einen selbst gebauten
Bildstreifen betrifft.

Die implementierende Sitzung hat den Fall korrekt nicht im Task behoben:
die Abweichung exakt zu machen heißt entweder Videoclips zu dehnen (ein
Nicht-Ziel) oder die Verteilung zu ändern, und das ändert den Vertrag von
`fitToMusic` für jeden Aufrufer — eine Entscheidung für eine
Planungssitzung.

Dazu kommt eine zweite, bisher unbenannte Lücke: seit
`add-titles-and-credits` kann der Bildstreifen Titel-Elemente enthalten.
Sie haben eine Anzeigedauer und werden heute schon mitgedehnt — die Spec
sagt das nirgends, sie spricht nur von „den Anzeigedauern der Bilder“.

## What Changes

- **Die Anpassung unterscheidet dehnbare und feste Elemente.** Dehnbar
  ist jedes Element mit einer eigenen Anzeigedauer (Bild- und
  Titel-Elemente), fest ist ein Videoclip. Die Dauer der dehnbaren
  Elemente wird so gesetzt, dass die Gesamtdauer die Länge der Musik
  **genau** trifft, auch wenn feste Clips dazwischen liegen.
- **Der Fall „nicht erreichbar“ umfasst den Bildstreifen ohne dehnbares
  Element** (nur Videoclips) und den, dessen feste Clips allein schon
  länger sind als die Musik: wie bisher nennt ein Dialog die erreichbare
  Dauer und es wird nichts geändert.
- **Die Spec benennt, was gedehnt wird** — damit das schon bestehende
  Mitdehnen der Titel-Elemente festgeschrieben ist.

## Capabilities

### Modified Capabilities

- `music-track`: „Film an Musik anpassen“ trifft die Musiklänge auch mit
  festen Videoclips genau und benennt die dehnbaren Elemente

## Nicht-Ziele

- Videoclips dehnen, stauchen oder ihr Trimmfenster verschieben — das
  bleibt das Nicht-Ziel von `add-timeline-editing`; die Länge eines Clips
  gehört dem Benutzer.
- Die Übergänge ändern: sie bleiben wie bisher unangetastet.
- Eine andere Verteilung als gleichmäßig (etwa Dauern im bisherigen
  Verhältnis zu lassen) oder eine feinere Rasterung als 0,25 s.
- Die Musik an den Film anpassen (kürzen, dehnen, Geschwindigkeit) — die
  Richtung bleibt Film nach Musik.
- Ein neuer Menüeintrag oder eine Einstellung dafür.
