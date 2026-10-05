## Why

Der Übergangskatalog enthält bisher nur sechs der 60 Übergänge aus Windows
Movie Maker 2.x (Feature-Lückenanalyse, Orchestrator, 2026-10-03). Die
Katalog- und Shader-Architektur dafür steht bereits (gemeinsamer GLSL-Code
für Vorschau und Export, deterministisch, mit Standarddauer und
Quellenangabe pro Eintrag) — diese Change füllt sie mit den meisten der
fehlenden 54 Übergänge.

Von den 54 fehlenden sind 41 **2D-Wisch-Übergänge** (Basis- und
SMPTE-Kategorie aus `docs/research/movie-maker-reference.md` §3): eine
Kantenform (gerade, diagonal, kreisförmig, sternförmig …) deckt das Zielbild
auf, mit weichem Rand und optionaler Wiederholung — mechanisch dieselbe Art
Shader wie die bereits vorhandenen `wipe-right`/`circle`. Die übrigen 13 sind
**3D- oder Partikel-Übergänge** (WMTFX: Flip, Slide Up, Slide Up Center,
Roll, Spin Out, Page Curl ×2, Shatter ×4, Whirlwind, Shrink) und bräuchten
eine grundlegend andere Rendering-Technik (ein 3D-Quad-Renderer bzw. ein
eigenes Partikelsystem — laut Recherche „There is no open template“ dafür).

Der Product Owner hat entschieden, diese Change auf die 41 2D-Wisch-Übergänge
zu begrenzen und die 13 3D/Partikel-Übergänge als eigenen, noch nicht
terminierten Folgeaufwand zurückzustellen — eine Entscheidung, die direkt aus
der bereits verifizierten Recherche folgt ([V]-Markierung in
`movie-maker-reference.md`), nicht aus einer neuen Rückfrage.

## What Changes

- **Zwei generische Wisch-Shader statt vieler Einzel-Shader:** ein
  Linear-/Winkel-Wipe-Shader (gerade und polygonale Kanten: Richtung,
  Diagonale, Bow Tie, Kreuz, gefüllte Keile, Zickzack, Rechteck, Raute,
  Balken, Fenster-Ausschnitte, Fächer, Schwingtür, Windschutzscheibe) und ein
  Radial-/Kurven-Wipe-Shader (Iris, gekachelte Kreise, Rad, Stern, Herz,
  Schlüsselloch, Auge, diagonales/horizontales Schwenken), jeweils
  parametrisiert über Form, weichen Rand und Wiederholung — Verallgemeinerung
  des bestehenden Musters von `wipe-right.glsl`/`circle.glsl`.
- **Katalog erweitert** um alle damit abbildbaren Basis- und SMPTE-Wipes aus
  der Referenzliste, jeweils mit Standarddauer, Parametern und exakter Quelle
  (MaskNum bzw. Movie-Maker-XML-GUID) wie bei den sechs bestehenden
  Einträgen.
- **Sammlung „Videoübergänge“** zeigt weiterhin automatisch alle
  Katalogeinträge als Kacheln (generische Iteration); bei deutlich mehr
  Einträgen wird die Sammlung bei Bedarf scrollbar.

## Capabilities

### Modified Capabilities

- `transitions`: Katalog um die Basis- und SMPTE-Wisch-Übergänge erweitert;
  generisches, parametrisiertes Shader-Verhalten für diese Familie

## Nicht-Ziele

- Die 13 3D- und Partikel-Übergänge (WMTFX: Flip, Slide Up, Slide Up
  Center, Roll, Spin Out, Page Curl ×2, Shatter ×4, Whirlwind, Shrink) —
  eigener, noch nicht terminierter Folgeaufwand (eigene Rendering-Technik).
- Die drei in Movie Maker 6.0 neu hinzugekommenen Übergänge (Dissolve
  Rough/Vertical, Whirlwind from top) — 6.0 ist nicht die Referenzversion
  dieses Projekts (2.1).
- Änderungen am Zeitmodell der Übergänge (maximale Dauer, Überlappung) oder
  an der Übergangs-Demo in der Sammlung — beides bleibt wie in Spec
  `transitions` bereits beschrieben.
- Videoeffekte (Sepia, Zeitlupe …) und Titel/Nachspann-Animationen — eigene,
  spätere Changes.
