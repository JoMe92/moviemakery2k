## Context

Stand: `develop` nach `add-timeline-editing` (archiviert gemeinsam mit den
übrigen Changes der WMM-2.x-Lückenanalyse). `add-mobile-layout`/
`add-mobile-delivery` laufen auf eigenen, unintegrierten Branches und sind
hier nicht Grundlage.

`packages/catalog/transitions.json` (Schema in `transitions.schema.json`)
listet heute sechs Einträge, jeder mit `id`, zweisprachigem Namen,
`shader`-Datei, `defaultDuration`, `params` und `source` (Quelle der
Parameter: `wmm2x-xml`-GUID oder `smpte`-MaskNum). `packages/shaders/`
enthält je einen GLSL-Shader pro Eintrag; `wipe-right.glsl` und
`circle.glsl` sind bereits parametrisiert (`gradientSize` bzw.
`borderSoftness`) und zeigen das Muster, das diese Change auf weitere Formen
verallgemeinert. Die Sammlung „Videoübergänge“ iteriert generisch über den
Katalog (keine fest codierte Liste in der Oberfläche) — eine größere Anzahl
Einträge braucht laut Architektur keine Code-Änderung, nur ggf. Scrollen.

`docs/research/movie-maker-reference.md` §3 (als [V] verifiziert) listet die
60 Original-Übergänge: Basis (9, davon 6 bereits umgesetzt oder trivial
abgeleitet), SMPTE-Wipes (34, nach `MaskNum`) und WMTFX-3D/Partikel (13).
Für die SMPTE-Geometrie verweist die Recherche auf die W3C-SMIL-Tabelle
(verlinkt in den Quellen dieser Datei); „weicher Rand“ und „Wiederholung“
sind laut Recherche eigene Ergänzungen (nicht Teil der SMIL-Geometrie
selbst), genau das Muster, das `circle.glsl`s `borderSoftness` schon zeigt.

Vorgaben des Product Owners (2026-10-03):

- Vierte von neun geplanten Changes; unabhängig von den anderen acht.
- Scope auf die 41 2D-Wisch-Übergänge begrenzt; die 13 3D/Partikel-Übergänge
  bleiben zurückgestellt (proposal.md Nicht-Ziele).

## Goals / Non-Goals

**Goals:** Der Katalog wächst von 6 auf deutlich über 40 Einträge, jeder mit
Standarddauer, Parametern und exakter Quellenangabe wie die bestehenden
sechs; zwei generische, parametrisierte Shader decken die neue Form-Vielfalt
ab, ohne für jeden Eintrag eine eigene Shader-Datei zu brauchen; bestehende
sechs Übergänge, ihre Golden-Frame-Tests und das Zeitmodell bleiben
unverändert.

**Non-Goals:** siehe proposal.md.

## Decisions

### D1 – Zwei generische Shader statt vieler Einzel-Dateien
Statt für jeden neuen Eintrag eine eigene `.glsl`-Datei anzulegen, bekommt
der Katalog zwei neue, parametrisierte Shader:

- **Linear-/Winkel-Wipe** (ersetzt/erweitert `wipe-right.glsl`): eine
  Kantenform aus geraden oder polygonalen Segmenten, parametrisiert über
  Richtung/Winkel, `gradientSize` (weicher Rand) und bei Bedarf eine
  Keil-/Zickzack-Periode. Deckt mindestens: die fünf fehlenden
  Wipe-Richtungsvarianten, Split V/H, Diagonal, Bow Tie V/H, Diagonal-Cross,
  Box-Out, Filled V ×4, Zig Zag V/H, Rechteck, Raute, Balken, Inset ×4, Fan
  In, Swinging Door, Windshield ×2.
- **Radial-/Kurven-Wipe** (erweitert `circle.glsl`): eine Distanzfunktion zu
  einer Kurve (Kreis, Stern, Herz, Schlüsselloch, Auge) oder ein
  Winkel-Schwenk (Rad, diagonales/horizontales Schwenken), parametrisiert
  über `borderSoftness` und optionale Wiederholung (`replicateX`/
  `replicateY`). Deckt mindestens: Iris, Circles (Replicate 8×6), Wheel,
  Star, Heart, Key Hole, Eye, Sweep Diagonal/Horizontal.

Die exakte Geometrie pro Form (Kantenwinkel, Polygon-Eckpunkte,
Kurvenformel) richtet sich nach `docs/research/movie-maker-reference.md`
§3 und der dort verlinkten W3C-SMIL-Tabelle; jeder neue Katalogeintrag MUST
wie die bestehenden sechs eine `source`-Angabe (MaskNum bzw. WMM-XML-GUID)
tragen.

### D2 – Geltungsbereich statt Namensliste in der Spec
Weil die genaue Namens- und `MaskNum`-Zuordnung Implementierungsdetail ist
(und sich bei der Umsetzung gegen die Referenzliste leicht verschiebt), legt
die Spec den Umfang über eine **Regel** fest (alle Basis-/SMPTE-Wipes der
Referenzliste, explizit ohne die 13 WMTFX-Übergänge), statt wie beim
MVP-Katalog eine feste Namensliste zu wiederholen. Die Implementierung
MUST sich gegen `docs/research/movie-maker-reference.md` §3 abgleichen und
im CHANGELOG dokumentieren, welche Einträge tatsächlich aufgenommen wurden.

### D3 – Sammlungsanzeige bei vielen Einträgen
Die Sammlung „Videoübergänge“ iteriert bereits generisch über den Katalog;
bei über 40 Einträgen MUST der Sammlungsbereich scrollbar sein (wie die
Bild-/Audio-Sammlungen bei vielen Medien), ohne Layout-Bruch. Keine
Änderung an Drag-&-Drop, Vorschau-Demo oder Doppelklick-Verhalten.
