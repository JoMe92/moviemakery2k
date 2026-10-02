# @mmy/shaders – geteilte GLSL-Programme

Ein Shader pro Übergang/Effekt, geschrieben in **GLSL ES 3.00**. Dieselbe Datei
läuft an zwei Stellen:

| Ort | Laufzeit |
|---|---|
| Frontend-Vorschau | WebGL2 im Browser |
| Backend-Export | headless OpenGL (EGL) zwischen FFmpeg-Decode und -Encode |

Nur so sehen Vorschau und Export gleich aus. Golden-Frame-Tests sichern das
später ab (siehe `docs/adr/0001-architektur.md`).

Konventionen (Uniform-Namen wie `from`/`to`/`progress`, Parameter-Mapping aus
`@mmy/catalog`) werden per OpenSpec-Change festgelegt.
