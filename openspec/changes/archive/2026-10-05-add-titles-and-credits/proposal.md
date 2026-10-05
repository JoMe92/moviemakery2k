## Why

Titel und Nachspann fehlen komplett; der Aufgabenbereich-Eintrag „Titel
oder Nachspann erstellen“ ist sichtbar, aber ohne Funktion. Windows Movie
Maker 2.x hatte 43 Titel-/Nachspann-Animationen (25 einzeilige, 9
zweizeilige, 9 Nachspann-Varianten), aufgebaut aus drei Phasen (Entrance →
Main → Exit), jede mit Effekt, Position, Zoom und Textbereich — eine
Architektur-Beratung (2026-10-03) hat bestätigt, dass die 43 benannten
Stile Kombinationen aus einer kleinen Menge Bausteine sind, nicht 43
unabhängige Mechanismen.

Der Product Owner hat entschieden, diese Change auf ein **MVP von 8
benannten Stilen** zu begrenzen (4 einzeilig, 2 zweizeilig, 2 Nachspann) —
gebaut aus denselben Bausteinen, die die restlichen ~35 später billig
nachrüstbar machen. TypeWriter (zeichenweise Offenlegung) und
Perspective/OutlineExplode/Multi (3D- bzw. Glyphen-Zerlegung) bleiben in
jedem Fall zurückgestellt — dieselbe Komplexitätsklasse wie die bereits
zurückgestellten 3D/Partikel-Übergänge aus `add-transition-catalog`.

## What Changes

- **Neue Bausteine in der Render-Pipeline:** Canvas2D-Textrasterung mit
  alpha-erhaltendem Canvas (eine mitgelieferte, offen lizenzierte
  Schriftart für Pixel-Parität zwischen Vorschau und Export), ein
  Alpha-Blend-Zeichenmodus für Overlay-Titel, ein Vertex-Transform-Uniform
  für Position/Zoom pro Phase (Entrance/Main/Exit, je als
  Start→Ende-Paar — Nachspann-Scroll ist der Fall Start≠Ende während
  „Main“). Entrance/Exit-Effekte setzen sich aus Fade, dem generischen
  Wipe-Shader (`add-transition-catalog`, auf dem Text-Alpha-Kanal) und den
  Ein-Textur-Effekt-Shadern (`add-effects-catalog`) zusammen — keine neuen
  Fragment-Shader außer dem Alpha-Blend.
- **Titel als eigenes Element** (Platzierung am Filmanfang, vor einem Clip
  oder am Filmende) oder **als Overlay-Feld** auf einem bestehenden Bild-
  oder Videoclip-Element (Platzierung „auf dem Clip“) — je nachdem, was der
  Titel-Assistent als Platzierung wählt.
- **Titel-Assistent:** Schritte Platzierung → Text → Stil → Farbe/Schrift,
  im Y2K-Dialogstil wie der bestehende „Film speichern“-Assistent.
- **8 MVP-Stile:** einzeilig „Basic Title“, „Fly In“, „Zoom In“, „Subtitle“;
  zweizeilig „Fade In and Out“, „Fly In Fades“; Nachspann „Scroll Up
  Stacked“, „Fade In and Out“ (Nachspann, ohne Scroll).

## Capabilities

### New Capabilities

- `titles-and-credits`: Titel-Katalog (8 MVP-Stile), Titel-Assistent,
  Titel als Element oder Overlay, Phasen-Rendering (Entrance/Main/Exit mit
  Position/Zoom), Nachspann-Scroll als Main-Phase-Spezialfall

### Modified Capabilities

- `slideshow-project`: neue Slide-Art `title`, Overlay-Feld `title` auf
  Bild-/Videoclip-Elementen, Schema-Version 5
- `app-shell`: Aufgabenbereich-Eintrag „Titel oder Nachspann erstellen“
  wird funktional

## Nicht-Ziele

- TypeWriter (zeichenweise Offenlegung), Perspective, OutlineExplode,
  Multi, Flashing/SpotLight als eigene Glyphen- bzw. 3D-Mechanismen —
  zurückgestellt, eigener späterer Aufwand.
- Die übrigen rund 35 benannten Original-Stile, die nicht im MVP stehen —
  mit den hier gebauten Bausteinen später günstig nachrüstbar, aber nicht
  Teil dieser Change.
- Video oder Bild innerhalb der Nachspann-Liste („Video In Text“, „Video
  Left“, „Video Top“) — eigener, späterer Mechanismus.
- Eine zweite, eigene Schriftart-Auswahl pro Titel; diese Change bündelt
  eine offen lizenzierte Standardschrift für alle Stile (Planning-Agent-
  Default, im PR änderbar).
- Mehr als ein Titel gleichzeitig auf einem Element (ein Overlay-Slot, wie
  der Effekt-Platz).
- Änderungen am Übergangs- oder Effekt-Katalog selbst — diese Change nutzt
  sie nur als Bausteine, unverändert.
