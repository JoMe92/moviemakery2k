# 0001 – Web-App + FFmpeg-Backend mit geteilten GLSL-Shadern

- **Status:** angenommen (2026-10-02)
- **Ersetzt:** die KMP/Compose-Empfehlung in `docs/research/movie-maker-klon.md` §5

## Kontext

moviemakerY2K ist ein kleiner Video-Editor im Stil von Movie Maker 2.x
(Windows XP). Im Mittelpunkt stehen **Übergänge und Effekte**. Alles andere soll
modernen Standards folgen. Vorgaben des Product Owners: Das Frontend ist eine
kleine Web-App, das Backend nutzt FFmpeg. Weitere Entscheidungen: Lizenz GPL,
eigener Y2K-Look ohne Original-Assets, Name moviemakerY2K.

Damit ein Effekt treu nachgebaut ist, müssen **Vorschau und Export pixelgleich
genug** sein. Die eingebauten FFmpeg-Filter (`xfade`, `eq`, `hue` …) bilden die
Movie-Maker-Effekte nur ungefähr ab. 3D-Übergänge (Page Curl, Flip) und
Partikelübergänge (Shatter, Whirlwind) können sie gar nicht darstellen.

## Entscheidung

1. **Monorepo** mit pnpm-Workspaces (TS) und einem uv-Projekt (Python).
2. **Frontend `apps/web`:** Vite + React + TypeScript (strict), Biome, Vitest.
   Die Vorschau rendert über **WebGL2**. Das Y2K-Theme baut auf CSS-Tokens auf.
3. **Backend `backend/`:** Python 3.13 + FastAPI + Pydantic v2, uv, ruff, mypy
   (strict), pytest. FFmpeg läuft **als Subprozess** (CLI) und wird nie gelinkt.
4. **Render-Pipeline (Ziel):** FFmpeg decodiert zu Rohframes. Danach wendet ein
   headless OpenGL (EGL) die Shader für Effekte und Übergänge an. Zum Schluss
   encodiert FFmpeg nach H.264/AAC.
   Ein früher Zwischenschritt darf reine FFmpeg-Filtergraphen nutzen.
5. **Geteilte Pakete:** `packages/shaders` (GLSL ES 3.00) und `packages/catalog`
   (Effekt-Katalog) sind die einzige Quelle. Frontend und Backend erfinden keine
   eigenen Effektdefinitionen.
6. **API-Vertrag:** Die Pydantic-Modelle sind die Quelle der Wahrheit. Das
   OpenAPI-Schema liefert die TS-Typen fürs Frontend (Generator folgt per
   Change).
7. **Projektdatei:** ein versioniertes JSON-Dokument (Storyboard/Timeline,
   Clips, Übergänge, Effekte, Titel, Audio). Mediendateien werden nur
   referenziert.
8. **Lizenz:** GPL-3.0-or-later. FFmpeg mit libx264 ist damit zulässig.

## Konsequenzen

- (+) Ein Shader-Quelltext für Vorschau und Export, und die Treue ist testbar
  (Golden Frames).
- (+) Python bietet ausgereifte Wege zu headless GL (z. B. moderngl/EGL) und
  FFmpeg-Pipes.
- (−) Zwei Sprachen im Repo. Das wird über die Pakete in `packages/` und das
  OpenAPI-Schema aufgefangen.
- (−) Unterschiede zwischen WebGL2 und Desktop-GL (Präzision, Header) brauchen
  eine kleine Kompatibilitätsschicht.
- (−) Der Export braucht im Container eine GPU oder Software-GL (Mesa llvmpipe).
- Lokal ist teils nur ein altes FFmpeg vorhanden (4.3). Ziel ist **FFmpeg ≥ 7**,
  das Backend-Image bringt es mit.

## Verworfene Alternativen

- **Nur FFmpeg-Filtergraph:** schnell gebaut, kann aber 3D und Partikel nicht
  und weicht von der Vorschau ab.
- **Rendern im Browser (WebCodecs) ohne Backend:** widerspricht der Vorgabe
  „Backend mit FFmpeg“ und ist bei Codecs und Audio-Mix eingeschränkt.
- **Node-Backend:** headless GL kann dort nur WebGL1 (headless-gl). Für die
  Shader-Pipeline ist das schlechter.
- **KMP/Compose (alte Empfehlung):** passte zum Ziel Android. Das Ziel ist jetzt
  eine Web-App.
