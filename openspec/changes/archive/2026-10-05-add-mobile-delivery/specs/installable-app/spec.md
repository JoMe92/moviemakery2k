## ADDED Requirements

### Requirement: Web-App-Manifest und Symbole
Die gebaute Web-App MUST ein Web-App-Manifest mit Name „moviemakerY2K“,
Kurzname „mmY2K“, `display: standalone`, Start-URL `/`, Theme- und
Hintergrundfarbe aus dem Y2K-Theme sowie Symbolen in 192 und 512 px (davon
eines `maskable`) ausliefern, dazu ein `apple-touch-icon` mit 180 px. Die
Symbole MUST ein eigener Entwurf sein und MUST NOT Elemente von Microsoft
enthalten.

#### Scenario: Manifest prüfen
- **WHEN** ein Prüfer `/manifest.webmanifest` der gebauten Anwendung abruft
- **THEN** ist es gültiges JSON mit den genannten Feldern, und jede
  angegebene Symboldatei ist abrufbar und hat die angegebene Größe

### Requirement: Service Worker der App-Hülle
Im Produktions-Build und im sicheren Kontext MUST ein Service Worker die
App-Hülle vorhalten, sodass sie ohne Netz startet. Anfragen unter `/api/`
MUST NOT zwischengespeichert werden. Ohne Backend MUST die App-Hülle starten
und den bestehenden Hinweis zeigen, dass das Backend nicht erreichbar ist.
Liegt eine neue Version vor, MUST die Anwendung „Neue Version verfügbar“ mit
„Neu laden“ zeigen und die neue Version erst danach aktivieren. Im
Dev-Server und ohne sicheren Kontext MUST kein Service Worker registriert
werden.

#### Scenario: Start ohne Backend
- **WHEN** die installierte Anwendung geöffnet wird, während der LAN-Modus
  nicht läuft
- **THEN** erscheint die Y2K-Oberfläche mit dem Hinweis, dass das Backend
  nicht erreichbar ist

#### Scenario: Neue Version
- **WHEN** nach einem neuen Build die Anwendung geöffnet wird
- **THEN** zeigt sie „Neue Version verfügbar“, und nach „Neu laden“ läuft die
  neue Version

#### Scenario: Keine API im Cache
- **WHEN** ein Prüfer nach Benutzung der Anwendung den Cache-Speicher des
  Service Workers durchsieht
- **THEN** enthält er keinen Eintrag unter `/api/`

### Requirement: Als App installieren
Im sicheren Kontext und solange die Anwendung nicht installiert läuft, MUST
„Extras → Als App installieren…“ und ein gleichnamiger Eintrag in der Gruppe
„3. Film fertig stellen“ verfügbar sein. Bietet der Browser einen
Installationsdialog an, MUST der Eintrag ihn öffnen; sonst (z. B. iOS Safari)
MUST ein Y2K-Dialog die Schritte „Teilen → Zum Home-Bildschirm“ erklären.
Ohne sicheren Kontext oder im Standalone-Modus MUST der Eintrag fehlen.

#### Scenario: Installation auf Android
- **WHEN** ein Benutzer in Chrome für Android über HTTPS „Als App
  installieren…“ wählt
- **THEN** erscheint der Installationsdialog des Browsers

#### Scenario: Installation auf iOS
- **WHEN** ein Benutzer in Safari für iOS über HTTPS „Als App installieren…“
  wählt
- **THEN** erscheint ein Dialog mit der Anleitung „Teilen → Zum
  Home-Bildschirm“

#### Scenario: Über HTTP im LAN
- **WHEN** die Anwendung über `http://<LAN-IP>:8080/` geöffnet ist
- **THEN** gibt es den Eintrag „Als App installieren…“ nicht

#### Scenario: Bereits installiert
- **WHEN** die Anwendung vom Startbildschirm im Standalone-Modus läuft
- **THEN** gibt es den Eintrag „Als App installieren…“ nicht, und keine
  Browserleiste ist sichtbar
