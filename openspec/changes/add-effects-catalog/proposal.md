## Why

Jede Storyboard-Kachel hat bereits einen vorgesehenen, aber deaktivierten
„Effekt-Platz“ (`slideshow-project`-Spec, Requirement „Bildstreifen
bearbeiten“), und Extras/Aufgabenbereich → „Videoeffekte anzeigen“ ist
sichtbar, aber ohne Funktion. Die Feature-Lückenanalyse (Orchestrator,
2026-10-03) listet die Video-Effekte aus Windows Movie Maker 2.x (Sepia,
Schwarzweiß, Helligkeit, Unschärfe, Film-Alterung, Spiegeln, Rotieren …) als
nächste Lücke nach den Übergängen.

Von den rund 30 Original-Effekten sind **22 zustandslose Bild-Effekte**:
eine Textur hinein, dieselbe Textur mit angewendetem Effekt heraus — genau
das Muster, das die Übergangs-Shader bereits für zwei Texturen beherrschen,
nur mit einer. Die übrigen sind entweder **zeitabhängig am Element-Rand**
(Fade In/Out von/zu Schwarz/Weiß, Ease In/Out, Hue Cycle — vermutlich
animiert) oder **eine Zeitabbildung auf einem Videoclip** (Speed Up Double,
Slow Down Half — ändert, wie schnell `trimIn..trimOut` abgespielt wird,
keine Pixel-Operation). Der Product Owner hat entschieden, diese Change auf
die 22 zustandslosen Bild-Effekte zu begrenzen; die zeitabhängigen Effekte
und die Geschwindigkeits-Effekte bleiben zurückgestellt (eigener,
unterschiedlicher Mechanismus je Gruppe, siehe Nicht-Ziele).

## What Changes

- **Neuer Effekt-Katalog** (`packages/catalog/effects.json`, analog
  `transitions.json`): 22 Einträge (Sepia, Negative, Posterisieren,
  Schwellenwert, Schwarzweiß, Helligkeit +/-, Unschärfe, Verpixeln,
  Film-Alterung ×3, Filmkörnung, Kohlestift, Federzeichnung, Aquarell,
  Spiegeln horizontal/vertikal, Rotieren 90°/180°/270°), jeweils mit
  zweisprachigem Namen, Shader, festen Parametern und Quelle wie bei
  Übergängen.
- **Ein Effekt-Shader hat genau eine Eingabetextur** (anders als
  Übergangs-Shader mit zwei) und läuft als zusätzlicher Rendering-Durchgang
  in eine Zwischentextur, bevor das Ergebnis wie bisher in den
  Still-/Übergangs-Durchgang geht — in Vorschau (`Renderer.ts`) und Export
  (`FrameRenderer`) gleich.
- **Effekt-Platz aktiv:** Jedes Bildstreifen-Element (Bild oder Videoclip)
  MAY genau einen Effekt aus dem Katalog tragen, gesetzt über den
  bestehenden Effekt-Platz auf der Kachel (Ziehen aus der neuen Sammlung
  „Videoeffekte“ oder Auswahldialog); „Keinen Effekt“ entfernt ihn wieder.
- **Sammlung „Videoeffekte“:** neue Sammlung analog „Videoübergänge“, mit
  Vorschau am Beispielbild.

## Capabilities

### New Capabilities

- `video-effects`: Effekt-Katalog, Effekt-Platz je Bildstreifen-Element,
  Rendering-Durchgang mit einer Eingabetextur, Sammlung „Videoeffekte“

### Modified Capabilities

- `slideshow-project`: Effekt-Platz aktiv statt deaktiviert; Projektmodell
  um `effectId` je Element erweitert (Schema-Version 4)
- `app-shell`: Aufgabenbereich-Eintrag „Videoeffekte anzeigen“ wird
  funktional

## Nicht-Ziele

- Zeitabhängige Effekte am Element-Rand: Fade In/Out von/zu Schwarz/Weiß,
  Ease In/Out, Hue Cycle (vermutlich animiert) — eigener Mechanismus
  (Rampe über die Zeit, nicht pro Frame statisch), eigene spätere Change.
- Speed Up Double / Slow Down Half — ändert die Zeitabbildung eines
  Videoclips (`trimIn`/`trimOut` zu Timeline-Zeit), keine Pixel-Operation;
  gehört inhaltlich zu `add-timeline-editing`s Datenmodell, nicht zu einem
  Pixel-Effekt-Katalog.
- Mehrere Effekte gleichzeitig auf einem Element — der bestehende
  Effekt-Platz ist Singular (`slideshow-project`-Spec), wie im Original.
- Effekt-Parameter pro Instanz einstellbar — wie bei Übergängen kommen alle
  Werte aus dem Katalog-Eintrag (z. B. drei feste Film-Alterung-Stufen statt
  eines Reglers).
- Effekte in Movie Maker 6.0 (Pan&Zoom, 3D Ripple, Sharpen, Dream, Edge
  Detection …) — 6.0 ist nicht die Referenzversion dieses Projekts.
