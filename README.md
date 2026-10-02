# moviemakerY2K

Ein kleiner Video-Editor im Stil der 2000er, inspiriert vom klassischen
Movie Maker 2.x unter Windows XP. Im Mittelpunkt stehen **Übergänge und Effekte**.
Der Rest folgt modernen Standards.

> Kein Microsoft-Produkt und nicht mit Microsoft verbunden. Enthält keine
> Original-Assets.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `apps/web/` | Web-App: Vite + React + TypeScript, WebGL2-Vorschau, Y2K-Theme |
| `backend/` | Python 3.13 + FastAPI: Medien, Übergangskatalog, Projekt (FFmpeg-Export folgt) |
| `packages/shaders/` | GLSL-ES-3.00-Shader, gemeinsam für Vorschau und Export |
| `packages/catalog/` | Katalog der Übergänge, Effekte und Titel (Single Source of Truth) |
| `openspec/` | Spezifikationen und Changes (nur in Planungssessions schreibbar) |
| `docs/research/` | Recherche zum Original samt Referenzquellen |
| `docs/adr/` | Architekturentscheidungen |
| `docs/nogging/` | Arbeitsmodell für Agents (Planung → Beads → Umsetzung) |

Architektur und Begründung: [ADR 0001](docs/adr/0001-architektur.md),
Toolchain: [ADR 0002](docs/adr/0002-pixi.md).

## Entwicklung

Einzige Voraussetzung: [Pixi](https://pixi.sh) (≥ 0.81). Pixi bringt Python,
Node.js, pnpm, FFmpeg und alle Werkzeuge aus `pixi.lock` mit. npm-Pakete
verwaltet pnpm, das Pixi selbst bereitstellt.

```bash
pixi run dev     # Backend + Web-App (Vite) mit /api-Proxy → http://localhost:5173
pixi run demo    # gebaute Web-App + API aus einem Prozess
pixi run check   # Quality-Gate: lint, typecheck, test, Shader, build
pixi task list   # alle Befehle
```

- Der API-Port ist über `MMY_API_PORT` einstellbar (Standard 8000), z. B.
  `MMY_API_PORT=8765 pixi run dev`.
- Laufzeitdaten (Uploads, Projekt) liegen in `backend/.data/` (`MMY_DATA_DIR`).
- Ist `~/.cache` nicht beschreibbar (z. B. Symlink auf ein nicht eingehängtes
  Laufwerk), muss der Pixi-Cache umgelenkt werden:
  `export PIXI_CACHE_DIR=/pfad/mit/platz/.cache-pixi`.
- Backend-Image: `docker build -f backend/Dockerfile .`

## Arbeitsweise

Aufgaben stehen in [Beads](https://github.com/gastownhall/beads) (`bd ready`).
Spezifikationen stehen in OpenSpec. Branches: `main` (Releases), `develop`
(Integration), `<type>/<change-slug>` für Arbeit. Details in `AGENTS.md`.

## Lizenz

GPL-3.0-or-later, siehe [LICENSE](LICENSE).
