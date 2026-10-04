## Why

Nach `add-mobile-layout` ist die Oberfläche am Handy bedienbar, aber der Weg
dorthin ist ein Entwicklerweg: Man startet den Vite-Dev-Server mit `--host`,
tippt eine IP mit Port ein, und jeder im Netz kann ohne Anmeldung Medien
hochladen und löschen. Außerdem fehlen am Handy zwei Dinge, die eine
Handy-Anwendung ausmachen: Sie lässt sich nicht wie eine App auf den
Startbildschirm legen, und der fertige Film landet nur als Download im
Browser statt in der Fotomediathek oder im Messenger. PWA-Installation und
Teilen setzen HTTPS voraus, das es heute nicht gibt.

## What Changes

- **LAN-Modus `pixi run serve-lan`:** baut die Web-App und liefert sie mit der
  API aus einem Prozess im Heimnetz aus, mit HTTPS über ein übergebenes
  Zertifikat (`--cert`/`--key`) oder hinter `tailscale serve`; ohne
  Zertifikat über HTTP mit deutlichem Hinweis, dass Installieren und Teilen
  dann nicht verfügbar sind.
- **Zugangstoken mit QR-Code:** Der LAN-Modus erzeugt ein zufälliges Token
  (dauerhaft im Datenverzeichnis, erneuerbar), zeigt die Adressen mit Token
  und einen QR-Code im Terminal. Der Aufruf mit Token setzt ein Cookie; jede
  API-Anfrage ohne gültiges Token wird mit dem neuen Fehlercode
  `auth.required` abgewiesen. `dev` und `demo` bleiben ohne Token.
- **Installierbare App (PWA):** Web-App-Manifest mit eigenem Y2K-Symbol,
  Standalone-Modus, Service Worker für die App-Hülle (die API wird nie
  zwischengespeichert), Hinweis „Neue Version verfügbar“, Eintrag
  „Als App installieren…“ mit Anleitung für iOS.
- **Film teilen:** Im letzten Schritt des Assistenten „Film speichern“ gibt es
  neben „Herunterladen“ die Schaltfläche „Teilen…“ (Web Share API mit Datei),
  wenn das Gerät sie unterstützt.

## Capabilities

### New Capabilities

- `lan-access`: LAN-Modus, HTTPS-Wege (eigenes Zertifikat, Tailscale),
  Zugangstoken mit QR-Code und Cookie, Abweisen ohne Token
- `installable-app`: Manifest, Symbole, Service Worker der App-Hülle,
  Update-Hinweis, Installationseintrag

### Modified Capabilities

- `movie-export`: Schritt „Fertig“ des Assistenten bietet „Teilen…“ an
- `app-shell`: „Als App installieren…“ im Menü Extras und in „3. Film fertig
  stellen“
- `dev-environment`: neue Pixi-Tasks `serve-lan` und `gen-icons`

Der neue Fehlercode `auth.required` fällt unter die bestehende Anforderung
„Übersetzte Fehlermeldungen“ (Spec localization); sie ändert sich nicht.

## Nicht-Ziele

- Benutzerkonten, mehrere Benutzer, Rechte; das Token schützt eine
  Einzelperson-Installation im eigenen Netz.
- Öffentliche Erreichbarkeit aus dem Internet (Port-Freigabe, Reverse-Proxy,
  Let's-Encrypt-Automatik); dafür wird `tailscale serve`/`funnel` nur
  dokumentiert, nicht eingebaut.
- Ein eigenes, automatisch erzeugtes selbstsigniertes Zertifikat.
- Offline-Bearbeitung: Ohne Backend startet nur die App-Hülle und meldet,
  dass das Backend nicht erreichbar ist.
- Push-Benachrichtigungen (z. B. „Export fertig“), Hintergrund-Synchronisation.
- Docker-Image für den LAN-Modus (das bestehende Image bleibt, wie es ist).
