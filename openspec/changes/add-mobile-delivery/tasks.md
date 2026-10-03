Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man sieht,
dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Dieser Change
setzt auf `add-mobile-layout` auf (Sheets, kompaktes Layout, Optionen) und
wird nach ihm umgesetzt und archiviert.

## 1. Backend und LAN-Modus

- [ ] TASK-API-015 Zugangstoken: `Settings.access_token` aus `MMY_ACCESS_TOKEN`, ASGI-Middleware für `/api/` (Cookie `mmy_access` oder Bearer, `hmac.compare_digest`), 401 mit neuem Code `auth.required` im Fehlervertrag, Austausch per `?token=` mit Cookie-Attributen und 303 ohne Token, App-Hülle frei, `gen-api` (design.md D1). Erledigt, wenn pytest alle Fälle aus design.md D9 (Middleware) abdeckt und ohne `MMY_ACCESS_TOKEN` alle bestehenden Tests unverändert grün sind.
- [ ] TASK-INFRA-016 Pixi-Task `serve-lan`: `scripts/serve_lan.py` mit den Optionen aus design.md D2, Token-Datei 0600 im Datenverzeichnis, Adressen mit Token und QR-Code per `segno` (conda-forge), Warnhinweise, hängt von `build` ab (nach TASK-API-015). Erledigt, wenn pytest Token-Datei (Erzeugen, Wiederverwenden, Rotieren, Rechte), Adressausgabe und Abbruch bei fehlender Zertifikatsdatei prüft, ohne einen Server zu starten.

## 2. Oberfläche

- [ ] TASK-WEB-047 Fehlender Zugang: Dialog „Zugang erforderlich“ bei `auth.required`, Zustand „Kein Zugang“ in Status- bzw. Titelleiste, Übersetzung des Codes in `de`/`en` (nach TASK-API-015; design.md D4). Erledigt, wenn Komponententests den Dialog, den Zustand in beiden Layouts und beide Sprachen prüfen.
- [ ] TASK-WEB-048 Manifest und Symbole: eigener Symbolentwurf als SVG, `scripts/gen_icons.py` (Pillow) mit Pixi-Task `gen-icons` für 192, 512, 512 maskable und 180, `manifest.webmanifest`, Links und Apple-Meta-Tags in `index.html` (design.md D5). Erledigt, wenn ein Test das Manifest gegen die Spec-Felder und die Größen aller Symboldateien prüft.
- [ ] TASK-WEB-049 Service Worker: `vite-plugin-pwa` (`prompt`, `generateSW`), Precache der App-Hülle, kein Caching von `/api/`, Registrierung nur im Build und bei `isSecureContext`, Hinweis „Neue Version verfügbar“ in `de`/`en` (nach TASK-WEB-048; design.md D6). Erledigt, wenn ein Test die Workbox-Konfiguration auf fehlende `/api/`-Einträge prüft und Komponententests Registrierung (sicher/unsicher) und den Update-Hinweis abdecken.
- [ ] TASK-WEB-050 Als App installieren: `beforeinstallprompt` abfangen, Eintrag in „Extras“ und „3. Film fertig stellen“ bzw. Taskleisten-Sheet, iOS-Anleitungsdialog, Ausblenden im Standalone-Modus und ohne sicheren Kontext, Texte in `de`/`en` (nach TASK-WEB-049; design.md D7). Erledigt, wenn Komponententests alle Szenarien von „Als App installieren“ mit Fakes abdecken.
- [ ] TASK-WEB-051 Film teilen: Vorladen der MP4 als Blob im Schritt „Fertig“, „Teilen…“ nur bei sicherem Kontext, `canShare` mit Datei und höchstens 200 MB, `navigator.share` im Tippen, `AbortError` still, sonst Hinweis, „Herunterladen“ unverändert, Texte in `de`/`en` (design.md D8). Erledigt, wenn Komponententests verfügbar, nicht unterstützt, unsicher, zu groß, Abbruch und Fehler prüfen.

## 3. Abschluss

- [ ] TASK-INFRA-017 E2E und Doku: Playwright startet den LAN-Modus ohne Zertifikat auf zufälligem Port und prüft „Zugang erforderlich“ ohne Token, Laden mit Token-URL samt Cookie und Weiterleitung ohne Token, Manifest erreichbar; `docs/mobile.md` mit Tailscale- und mkcert-Anleitung und Sicherheitsgrenzen, README-Abschnitt „Am Handy nutzen“, CHANGELOG „Unreleased“ (nach allen anderen Tasks; design.md D3, D9). Erledigt, wenn `pixi run test-e2e` und `pixi run check` grün sind.
