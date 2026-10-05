## Context

Setzt auf `add-mobile-layout` auf (Sheets, kompaktes Layout, Optionen) und
MUST nach ihm umgesetzt und archiviert werden. Heute: `pixi run demo` liefert
die gebaute Web-App über das Backend aus (`StaticFiles` unter `/`, uvicorn auf
`127.0.0.1`); `pixi run dev` startet Vite (nur `localhost`). Die API hat keine
Anmeldung. Konfiguration läuft über `MMY_*`-Umgebungsvariablen
(`config.Settings.from_env`).

Vorgaben des Product Owners (2026-10-03):

- PWA installierbar, Film teilen, LAN-Server-Modus, eigener Change.
- HTTPS über „Tailscale + eigenes Zertifikat“: Der Task nimmt
  `--cert`/`--key`; dokumentiert werden `tailscale serve` (echtes Zertifikat,
  auch unterwegs) und mkcert fürs Heimnetz. Ohne Zertifikat läuft HTTP, und
  die Oberfläche blendet Teilen und Installieren aus.
- Schutz über Zugangstoken mit QR-Code und Cookie.

Hintergrund: Service Worker, `beforeinstallprompt` und die Web Share API
verlangen einen sicheren Kontext (HTTPS oder `localhost`). Über
`http://192.168.x.y` sind sie im Browser nicht verfügbar.

Standardwerte, vom Planning Agent festgelegt (im PR änderbar): Port 8443 mit
Zertifikat, 8080 ohne; Token 32 Byte (URL-sicheres Base64); Cookie 30 Tage;
Teilen bis 200 MB Dateigröße; QR-Code über das Python-Paket `segno`
(conda-forge, ohne weitere Abhängigkeiten); Service Worker über
`vite-plugin-pwa` (Workbox, pnpm).

## Goals / Non-Goals

**Goals:** Ein Befehl macht die Anwendung im Heimnetz am Handy nutzbar;
Fremde im selben Netz kommen ohne Token nicht an Daten; mit HTTPS ist die
Anwendung installierbar und der Film teilbar; `dev`, `demo`, Tests und Docker
verhalten sich wie bisher.

**Non-Goals:** siehe proposal.md.

## Decisions

### D1 – Zugangstoken im Backend
- `Settings` bekommt `access_token: str | None` aus `MMY_ACCESS_TOKEN`. Ist es
  nicht gesetzt, ist der Schutz aus (Standard für `dev`, `demo`, Tests,
  Docker).
- Eine ASGI-Middleware prüft jede Anfrage unter `/api/`: gültig ist das
  Cookie `mmy_access` oder der Header `Authorization: Bearer <token>`.
  Vergleich mit `hmac.compare_digest`. Fehlt es oder ist es falsch, antwortet
  sie mit 401 und dem bestehenden Fehlervertrag, Code `auth.required`.
- Token-Austausch: Eine Anfrage an `/` (oder einen beliebigen Pfad außerhalb
  von `/api/`) mit Query-Parameter `token` prüft das Token, setzt bei Erfolg
  das Cookie (`HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age` 30 Tage,
  `Secure` bei HTTPS bzw. `X-Forwarded-Proto: https`) und leitet mit 303 auf
  dieselbe Adresse ohne `token` weiter (das Token bleibt nicht im Verlauf
  stehen). Ein falsches Token führt zur Startseite ohne Cookie; die App zeigt
  dann den Dialog aus D4.
- Die App-Hülle (HTML, JS, CSS, Manifest, Symbole, Service Worker) bleibt ohne
  Token abrufbar: Sie enthält keine Daten, und Browser holen Manifest und
  Symbole ohne Cookies.
- Medien-, Audio- und Export-Downloads liegen unter `/api/` und sind damit
  geschützt; `<img>`, `<audio>` und Downloads senden das Cookie automatisch
  (gleicher Ursprung).

### D2 – LAN-Modus `serve-lan`
`scripts/serve_lan.py`, Pixi-Task `serve-lan` (hängt von `build` ab):

- Bindet uvicorn an `0.0.0.0` (Option `--host`), Port aus `--port` bzw.
  `MMY_LAN_PORT`, Standard 8443 mit Zertifikat und 8080 ohne.
- `--cert`/`--key` werden an uvicorn (`ssl_certfile`/`ssl_keyfile`)
  durchgereicht; fehlt eine Datei, bricht der Task mit verständlicher Meldung
  ab.
- `--behind-proxy` (für `tailscale serve`): bindet an `127.0.0.1`, vertraut
  `X-Forwarded-*` nur von dort (`--proxy-headers`, `forwarded_allow_ips`).
- Token: liegt in `<MMY_DATA_DIR>/lan-token` (Rechte 0600), wird beim ersten
  Start erzeugt (`secrets.token_urlsafe(32)`) und mit `--rotate-token` neu
  erzeugt; der Task setzt `MMY_ACCESS_TOKEN` für den Backend-Prozess.
- Ausgabe beim Start: alle IPv4-Adressen der Schnittstellen (LAN, Tailscale)
  als vollständige URL mit `?token=…`, ein QR-Code der ersten Adresse
  (oder der mit `--qr-host` gewählten) im Terminal (`segno`, Unicode-Blöcke),
  und ohne Zertifikat der Hinweis: „Ohne HTTPS sind ‚Als App installieren‘
  und ‚Teilen…‘ nicht verfügbar“. Immer der Hinweis, dass jeder mit dem Link
  Zugriff hat.
- `demo` bleibt unverändert (nur `127.0.0.1`, ohne Token).

### D3 – HTTPS-Wege (Dokumentation)
`docs/mobile.md` beschreibt zwei Wege, beide ohne Code im Projekt:

1. **Tailscale:** `pixi run serve-lan --behind-proxy --port 8080` und
   `tailscale serve --bg 8080` → `https://<gerät>.<tailnet>.ts.net/`, echtes
   Zertifikat, auch unterwegs; QR-Code mit `--qr-host <gerät>.<tailnet>.ts.net`.
2. **mkcert im Heimnetz:** `mkcert -install`, Zertifikat für die LAN-IP und
   den Rechnernamen, Root-CA auf dem Handy installieren und vertrauen (iOS:
   Einstellungen → Allgemein → Info → Zertifikatsvertrauen), dann
   `pixi run serve-lan --cert … --key …`.

### D4 – Web: fehlender Zugang
Antwortet die API mit `auth.required`, zeigt die App statt des allgemeinen
Backend-Fehlers einen Y2K-Dialog „Zugang erforderlich“ mit dem Hinweis, den
QR-Code bzw. Link aus dem Terminal erneut zu öffnen. Die Statusleiste bzw.
Titelleiste zeigt „Kein Zugang“ statt „Backend nicht erreichbar“. Der Code
kommt in die Übersetzungstabelle (`de`/`en`) der Spec localization.

### D5 – Manifest und Symbole
`apps/web/public/manifest.webmanifest`: `name` „moviemakerY2K“,
`short_name` „mmY2K“ (passt unter das Symbol und vermeidet die Nähe zum
Originalnamen), `display: standalone`, `orientation: any`, `start_url: "/"`,
`scope: "/"`, `theme_color` = Luna-Blau aus dem Theme, `background_color` =
Fensterbeige. Symbol: eigener Entwurf (Filmstreifen mit Y2K-Glanz, keine
Microsoft-Elemente) als SVG in `apps/web/public/icons/`. Die PNG-Größen 192,
512, 512 maskable und `apple-touch-icon` 180 zeichnet `scripts/gen_icons.py`
mit Pillow aus denselben Formen (keine neue Abhängigkeit für SVG-Rendering);
die PNGs werden eingecheckt, das Skript ist ein Pixi-Task `gen-icons`.
`index.html` bekommt `<link rel="manifest">`, `apple-touch-icon`,
`apple-mobile-web-app-capable` und `apple-mobile-web-app-status-bar-style`.

### D6 – Service Worker
`vite-plugin-pwa` mit `registerType: "prompt"` und Workbox `generateSW`:
- Precache der gebauten App-Hülle (gehashte Assets, `index.html`).
- `navigateFallback: "/index.html"` mit `navigateFallbackDenylist: [/^\/api\//]`.
- Keine Laufzeit-Caching-Regel für `/api/`; Anfragen dorthin gehen immer ans
  Netz.
- Registrierung nur im Produktions-Build und nur bei `isSecureContext`; im
  Dev-Server und in Vitest gibt es keinen Service Worker.
- Gibt es eine neue Version, zeigt die App den Hinweis „Neue Version
  verfügbar“ mit „Neu laden“; erst dann wird der neue Worker aktiviert.

### D7 – Installieren
- Chromium/Android: `beforeinstallprompt` wird abgefangen; „Extras → Als App
  installieren…“ und der Eintrag in „3. Fertig stellen“ zeigen den Dialog des
  Browsers.
- iOS Safari (kein Ereignis): derselbe Eintrag öffnet einen Y2K-Dialog mit der
  Anleitung „Teilen → Zum Home-Bildschirm“.
- Läuft die App bereits installiert (`display-mode: standalone` bzw.
  `navigator.standalone`) oder nicht im sicheren Kontext, ist der Eintrag
  ausgeblendet.
- Im Standalone-Modus fehlt die Browserleiste; die Safe-Area-Tokens aus
  `add-mobile-layout` gelten unverändert.

### D8 – Film teilen
Im Schritt „Fertig“ des Assistenten:
- „Teilen…“ erscheint nur, wenn `navigator.canShare?.({ files: [probe] })`
  wahr ist, der Kontext sicher ist und die Datei höchstens 200 MB groß ist.
- Weil die Web Share API eine Benutzeraktion verlangt und das Laden einer
  großen Datei länger dauert als deren Gültigkeit, lädt der Assistent die
  MP4-Datei beim Erreichen von „Fertig“ als Blob vor („Wird vorbereitet…“,
  Schaltfläche bis dahin deaktiviert) und ruft `navigator.share({ files,
  title })` direkt im Tippen auf.
- Abbruch durch den Benutzer (`AbortError`) ist kein Fehler; andere Fehler
  zeigen einen Hinweis und lassen „Herunterladen“ als Ausweg.
- „Herunterladen“ bleibt unverändert immer verfügbar.

### D9 – Tests
- pytest: Middleware (aus ohne Token-Setting; 401 mit `auth.required` ohne
  bzw. mit falschem Token; Cookie und Bearer gültig; Austausch per `?token=`
  setzt Cookie mit den Attributen aus D1 und leitet ohne Token weiter; App-Hülle
  und Manifest ohne Token abrufbar; `Secure` bei `X-Forwarded-Proto: https`).
- pytest für `serve_lan.py`: Token-Datei (Erzeugen, Wiederverwenden,
  Rotieren, Rechte 0600), Adressausgabe, Abbruch bei fehlender Zertifikatsdatei
  (ohne den Server zu starten).
- Vitest: Dialog „Zugang erforderlich“, Install-Eintrag (drei Fälle), Teilen
  (verfügbar, zu groß, nicht unterstützt, `AbortError`) mit Fakes.
- Playwright: LAN-Modus ohne Zertifikat auf zufälligem Port; ohne Token
  erscheint „Zugang erforderlich“, mit Token-URL lädt die App und das Cookie
  ist gesetzt; Manifest ist erreichbar und gültiges JSON.

## Risks / Trade-offs

- **Token im QR-Code/Link** kann weitergegeben werden → Hinweis beim Start,
  `--rotate-token` macht alte Links und Cookies ungültig.
- **HTTP im LAN** ist abhörbar → Token und Daten unverschlüsselt; der Start
  ohne Zertifikat warnt deutlich und empfiehlt Tailscale.
- **Service-Worker-Caching** kann alte Versionen festhalten → `prompt`-Modus,
  keine API im Cache, `index.html` immer über den Precache-Abgleich.
- **Speicher beim Teilen**: Die Datei liegt im Arbeitsspeicher → Grenze
  200 MB, darüber nur Herunterladen.
- **iOS-Eigenheiten**: kein `beforeinstallprompt`, Service Worker nur in
  Safari bzw. installierter App → Anleitungsdialog, App bleibt ohne Worker
  vollständig nutzbar.

## Migration Plan

Keine Datenmigration. Ohne `MMY_ACCESS_TOKEN` verhält sich das Backend wie
bisher. Rückfall: `serve-lan` nicht verwenden; Service Worker lässt sich über
eine Build-Option ohne Plugin abschalten (der Worker meldet sich bei einem
Build ohne Plugin selbst ab, `selfDestroying`).

## Open Questions

Keine; die Standardwerte oben sind im PR änderbar.
