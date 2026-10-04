# dev-environment Specification

## Purpose
Reproduzierbare Entwicklungsumgebung für das gesamte Repository über Pixi:
Toolchain, Abhängigkeiten, einheitliche Befehle und das CI-Quality-Gate.

## Requirements

### Requirement: Pixi verwaltet Toolchain und Abhängigkeiten
Das Repository MUST ein Pixi-Manifest im Wurzelverzeichnis samt
eingechecktem Lockfile enthalten. Darüber werden Python, Node.js, pnpm, FFmpeg
und alle Werkzeuge bereitgestellt, die auf conda-forge verfügbar sind
(mindestens Biome, Ruff, Mypy, Pytest, glslang), ebenso alle
Python-Abhängigkeiten des Backends. Nur JavaScript-Pakete, die es nicht auf
conda-forge gibt, MUST über pnpm mit eingechecktem pnpm-Lockfile verwaltet
werden. Das Repository MUST NOT uv, ein uv-Lockfile oder ein Makefile als
Einstiegspunkt enthalten.

#### Scenario: Frischer Rechner mit nur Pixi
- **WHEN** ein Entwickler auf einem Linux-Rechner, auf dem nur Pixi
  installiert ist, das Repository klont und `pixi run check` ausführt
- **THEN** installiert Pixi alle Werkzeuge und Abhängigkeiten aus den
  Lockfiles, und das Quality-Gate läuft ohne weitere manuelle Installation
  durch

#### Scenario: Lockfiles sind aktuell
- **WHEN** CI `pixi install --locked` ausführt
- **THEN** schlägt der Lauf fehl, falls `pixi.lock` nicht zum Manifest passt

### Requirement: Einheitliche Befehle als Pixi-Tasks
Alle Entwicklerbefehle MUST als Pixi-Tasks verfügbar sein, mindestens: `dev`
(Backend und Web-App gemeinsam mit Live-Reload), `demo` (gebaute Web-App über
das Backend auf einem Port), `lint`, `format`, `typecheck`, `test`,
`test-e2e`, `check-shaders`, `gen-api`, `build` und `check` (Lint, Typecheck,
Tests, Shader-Prüfung, Build).

#### Scenario: Entwicklungsserver starten
- **WHEN** ein Entwickler `pixi run dev` ausführt
- **THEN** sind Backend und Web-App gestartet, und die Web-App erreicht das
  Backend unter `/api`, ohne dass weitere Befehle nötig sind

#### Scenario: Demo mit einem Prozess
- **WHEN** ein Entwickler `pixi run demo` ausführt
- **THEN** wird die Web-App gebaut und zusammen mit der API von einem
  einzigen Backend-Prozess auf einem Port ausgeliefert

### Requirement: CI nutzt Pixi als Quality-Gate
Die CI MUST für jeden Push auf `main`/`develop` und für jeden Pull Request die
Umgebung über Pixi aufbauen und `pixi run check` ausführen. Sie MUST außerdem
prüfen, dass die generierten API-Typen aktuell sind.

#### Scenario: Veraltete API-Typen
- **WHEN** ein Pull Request das Backend-API ändert, ohne die generierten
  Frontend-Typen neu zu erzeugen
- **THEN** schlägt die CI fehl und nennt die abweichende Datei
