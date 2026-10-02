# @mmy/shaders – geteilte GLSL-Programme

Ein Shader pro Übergang, geschrieben in **GLSL ES 3.00**. Dieselbe Datei läuft
in der Vorschau (WebGL2) und später im Export (headless GL im Backend). Nur so
sehen beide gleich aus (ADR 0001, design.md D4).

## Shader-Vertrag

Eine Datei `transitions/<id>.glsl` enthält **nur**:

```glsl
uniform float <param>;   // je Eintrag in catalog params, Name 1:1
vec4 transition(vec2 uv) { … }
```

Der Renderer baut das Programm so zusammen:
`prelude.glsl` + `transitions/<id>.glsl` + `epilogue.glsl`, dazu `vertex.glsl`.

| Bereitgestellt | Bedeutung |
|---|---|
| `getFromColor(uv)` / `getToColor(uv)` | Ausgangs- bzw. Zielbild (Frame-Raum, bereits 4:3 eingepasst) |
| `uniform float progress` | 0.0 … 1.0 |
| `uniform vec2 resolution` | Ausgabegröße in Pixeln |
| `uv` | 0…1, Ursprung unten links |

Regeln:

- Bei `progress == 0.0` muss exakt das Ausgangsbild herauskommen, bei `1.0`
  exakt das Zielbild. Das prüfen die Randwert-Golden-Frames in der E2E-Suite.
- Kein Laufzeit-Zufall: Pseudozufall nur über deterministische Integer-Hashes.
- Größen in Pixeln beziehen sich auf eine Bildbreite von 640 px und werden
  mit `resolution.x / 640.0` skaliert. So passen die Werte zu Movie Maker
  (DV/NTSC-Breite).
- Neue Parameter zuerst in `packages/catalog/transitions.json` eintragen.

## Prüfung

`pixi run check-shaders` setzt jedes Programm zusammen, prüft es mit
`glslangValidator` (ES 3.00) und gleicht die Parameter mit dem Katalog ab.
Der Task ist Teil von `pixi run check`.
