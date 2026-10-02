# Einstiegspunkte für Menschen und Agents. Voraussetzungen: pnpm, uv, ffmpeg (>= 7 empfohlen).
.PHONY: install dev dev-web dev-backend lint typecheck test build check

install:
	pnpm install
	cd backend && uv sync

dev:
	$(MAKE) -j2 dev-backend dev-web

dev-web:
	pnpm --filter @mmy/web dev

dev-backend:
	cd backend && uv run uvicorn mmy_backend.main:app --reload --port 8000

lint:
	pnpm lint
	cd backend && uv run ruff check . && uv run ruff format --check .

typecheck:
	pnpm typecheck
	cd backend && uv run mypy src tests

test:
	pnpm test
	cd backend && uv run pytest

build:
	pnpm build

check: lint typecheck test build
