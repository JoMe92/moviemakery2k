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
| `backend/` | Python 3.13 + FastAPI. Steuert FFmpeg (Import, Render, Export) |
| `packages/shaders/` | GLSL-ES-3.00-Shader, gemeinsam für Vorschau und Export |
| `packages/catalog/` | Katalog der Übergänge, Effekte und Titel (Single Source of Truth) |
| `openspec/` | Spezifikationen und Changes (nur in Planungssessions schreibbar) |
| `docs/research/` | Recherche zum Original samt Referenzquellen |
| `docs/adr/` | Architekturentscheidungen |
| `docs/nogging/` | Arbeitsmodell für Agents (Planung → Beads → Umsetzung) |

Architektur und Begründung: [ADR 0001](docs/adr/0001-architektur.md).

## Entwicklung

Voraussetzungen: Node ≥ 22 mit pnpm, [uv](https://docs.astral.sh/uv/) und
FFmpeg (≥ 7 empfohlen).

```bash
make install   # pnpm install + uv sync
make dev       # Backend :8000 + Web-App (Vite) mit /api-Proxy
make check     # Lint, Typecheck, Tests, Build
```

## Arbeitsweise

Aufgaben stehen in [Beads](https://github.com/gastownhall/beads) (`bd ready`).
Spezifikationen stehen in OpenSpec. Branches: `main` (Releases), `develop`
(Integration), `<type>/<change-slug>` für Arbeit. Details in `AGENTS.md`.

## Lizenz

GPL-3.0-or-later, siehe [LICENSE](LICENSE).
