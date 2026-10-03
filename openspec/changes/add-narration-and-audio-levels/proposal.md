## Why

Zwei Lücken aus der README-Roadmap hängen zusammen: Erzähler-Aufnahme
(Mikrofon) und Pegelregler „Ton von Videoclips ↔ Musik“. `add-timeline-
editing` hat Videoclip-Ton bewusst stumm gelassen (design.md D5:
„Videoclips spielen stumm (muted = true)“), explizit zurückgestellt auf
diese Change. Eine Architektur-Beratung (2026-10-03) hat geklärt, wie
Clip-Ton hörbar wird, ohne das dort beschlossene Ein-Taktgeber-Prinzip zu
verletzen: nicht über das `<video>`-Element selbst (das bleibt reines
Scrubbing für das Bild), sondern denselben Weg wie Musik — per Web Audio
API dekodiert und in dieselbe Audiouhr eingeplant, die heute schon die
Musik steuert.

Movie Maker 2.x hatte dafür genau **einen** globalen Regler („Audio
Levels…“, Clip-Menü) zwischen Videoclip-Ton und Musik/Erzählung — kein
Lautstärke-Feld pro Videoclip. Erzählung läuft auf einer zweiten,
**nicht-sequentiellen** Audiospur: anders als Musikstücke (lückenlos
nacheinander ab 0:00) hat jeder Erzählungs-Clip eine eigene, absolute
Startzeit (dort, wo die Aufnahme während der Wiedergabe begann).

## What Changes

- **Erzähler-Aufnahme:** Ein Aufnahme-Knopf nimmt bei laufender Wiedergabe
  über das Mikrofon auf; nach dem Stoppen entsteht automatisch ein
  Erzählungs-Clip an der Startzeit der Aufnahme, auf einer neuen,
  eigenständigen Spur unter der Musikleiste.
- **Erzählungsspur:** Clips mit absoluter Startzeit (statt Aneinanderreihung
  wie bei Musik), je mit Kürzen, Lautstärke (0–200 %) und Blenden — dasselbe
  Bedienmuster wie bei Musikstücken. Überlappende Clips MAY gleichzeitig
  spielen (gemischt, keine automatische Ersetzung).
- **Clip-Ton hörbar:** Die Originaltonspur eines Videoclips wird wie ein
  Musiksegment per Web Audio dekodiert und in dieselbe Audiouhr eingeplant —
  kein zweiter Taktgeber, kein `video.play()`.
- **Ein globaler Pegelregler** („Audio-Pegel…“ im Clip-Menü) zwischen
  Videoclip-Ton auf der einen und Musik+Erzählung auf der anderen Seite
  (Standard: 50/50).
- **Export:** dieselbe zweistufige Mischung (Musik+Erzählung vs. Clip-Ton,
  dann zusammen) wie die Vorschau.

## Capabilities

### New Capabilities

- `narration-track`: Erzählungsspur (nicht-sequentielle Clips mit
  absoluter Startzeit, Kürzen, Lautstärke, Blenden), Aufnahme per Mikrofon
  während der Wiedergabe

### Modified Capabilities

- `slideshow-project`: Projektmodell um Erzählungsspur und den globalen
  Pegelregler `clipAudioBalance` erweitert, Schema-Version 6
- `preview-player`: Clip-Ton und Erzählung spielen mit, über dieselbe
  Audiouhr wie Musik
- `movie-export`: Tonspur enthält zusätzlich Clip-Ton und Erzählung, im
  Verhältnis des globalen Pegelreglers

## Nicht-Ziele

- Eine Lautstärke pro Videoclip (nur der eine globale Regler, wie im
  Original).
- Automatisches Ersetzen oder Verschieben überlappender Erzählungs-Clips —
  Überlappung ist erlaubt, Benutzer verwalten das wie jeden anderen Clip.
- Rauschunterdrückung, Normalisierung oder andere Audio-Bearbeitung der
  Aufnahme.
- Mehrere Erzählungsspuren gleichzeitig (eine Spur, wie im Original).
- Spracherkennung, automatische Untertitel aus der Erzählung.
