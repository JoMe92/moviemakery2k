## MODIFIED Requirements

### Requirement: Einheitliche Befehle als Pixi-Tasks
Alle Entwicklerbefehle MUST als Pixi-Tasks verfügbar sein, mindestens: `dev`
(Backend und Web-App gemeinsam mit Live-Reload), `demo` (gebaute Web-App über
das Backend auf einem Port), `serve-lan` (gebaute Web-App und API im
Heimnetz mit Zugangstoken, Spec lan-access), `lint`, `format`, `typecheck`,
`test`, `test-e2e`, `check-shaders`, `gen-api`, `gen-icons` (PNG-Symbole der
installierbaren App aus dem eigenen Entwurf), `build` und `check` (Lint,
Typecheck, Tests, Shader-Prüfung, Build).

#### Scenario: Entwicklungsserver starten
- **WHEN** ein Entwickler `pixi run dev` ausführt
- **THEN** sind Backend und Web-App gestartet, und die Web-App erreicht das
  Backend unter `/api`, ohne dass weitere Befehle nötig sind

#### Scenario: Demo mit einem Prozess
- **WHEN** ein Entwickler `pixi run demo` ausführt
- **THEN** wird die Web-App gebaut und zusammen mit der API von einem
  einzigen Backend-Prozess auf einem Port ausgeliefert

#### Scenario: Im Heimnetz ausliefern
- **WHEN** ein Entwickler `pixi run serve-lan` ausführt
- **THEN** wird die Web-App gebaut und zusammen mit der API an allen
  Netzwerkschnittstellen ausgeliefert, und das Terminal zeigt Adressen mit
  Token und einen QR-Code
