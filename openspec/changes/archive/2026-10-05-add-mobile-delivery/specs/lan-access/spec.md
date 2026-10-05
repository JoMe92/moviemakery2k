## ADDED Requirements

### Requirement: LAN-Modus
Der Pixi-Task `serve-lan` MUST die Web-App bauen und sie zusammen mit der API
aus einem Prozess an allen Netzwerkschnittstellen ausliefern. Mit `--cert` und
`--key` MUST er HTTPS verwenden (Standardport 8443), ohne sie HTTP
(Standardport 8080); `--port` bzw. `MMY_LAN_PORT` MUST den Port überschreiben.
Mit `--behind-proxy` MUST er nur an `127.0.0.1` lauschen und
Weiterleitungs-Header nur von dort annehmen. Fehlt eine angegebene
Zertifikatsdatei, MUST der Task mit einer verständlichen Meldung abbrechen,
ohne den Server zu starten. `pixi run dev` und `pixi run demo` MUST weiterhin
nur lokal lauschen.

#### Scenario: Start ohne Zertifikat
- **WHEN** ein Benutzer `pixi run serve-lan` ohne Zertifikat startet
- **THEN** ist die Anwendung unter `http://<LAN-IP>:8080/` erreichbar, und die
  Ausgabe weist darauf hin, dass „Als App installieren“ und „Teilen…“ ohne
  HTTPS nicht verfügbar sind

#### Scenario: Start mit Zertifikat
- **WHEN** ein Benutzer `pixi run serve-lan --cert lan.pem --key lan-key.pem`
  mit gültigen Dateien startet
- **THEN** ist die Anwendung unter `https://<LAN-IP>:8443/` erreichbar

#### Scenario: Fehlende Zertifikatsdatei
- **WHEN** ein Benutzer `pixi run serve-lan --cert fehlt.pem --key k.pem`
  startet und `fehlt.pem` nicht existiert
- **THEN** endet der Task mit einer Meldung, die die fehlende Datei nennt, und
  es lauscht kein Server

### Requirement: Zugangstoken
Im LAN-Modus MUST das Backend jede Anfrage unter `/api/` nur mit gültigem
Zugangstoken beantworten, entweder aus dem Cookie `mmy_access` oder aus dem
Header `Authorization: Bearer`. Ohne gültiges Token MUST es mit Status 401
und dem Fehlercode `auth.required` im bestehenden Fehlervertrag antworten. Die
App-Hülle (HTML, Skripte, Stile, Manifest, Symbole, Service Worker) MUST ohne
Token abrufbar sein. Das Token MUST beim ersten Start zufällig mit mindestens
256 Bit erzeugt, im Datenverzeichnis nur für den Eigentümer lesbar gespeichert
und bei späteren Starts wiederverwendet werden; `--rotate-token` MUST ein neues
erzeugen, womit alte Links und Cookies ungültig werden. Ohne LAN-Modus (kein
`MMY_ACCESS_TOKEN`) MUST die API wie bisher ohne Token antworten.

#### Scenario: Anfrage ohne Token
- **WHEN** im LAN-Modus ein Gerät ohne Cookie `GET /api/project` aufruft
- **THEN** antwortet das Backend mit 401 und `errorCode` `auth.required`

#### Scenario: App-Hülle ohne Token
- **WHEN** im LAN-Modus ein Gerät ohne Cookie `/` und
  `/manifest.webmanifest` aufruft
- **THEN** werden beide ausgeliefert

#### Scenario: Token erneuern
- **WHEN** ein Benutzer `pixi run serve-lan --rotate-token` startet
- **THEN** wird ein neues Token erzeugt, und ein Gerät mit dem alten Cookie
  erhält bei API-Anfragen `auth.required`

#### Scenario: Ohne LAN-Modus
- **WHEN** ein Entwickler `pixi run demo` startet und `GET /api/project` ohne
  Cookie aufruft
- **THEN** antwortet das Backend wie bisher mit dem Projekt

### Requirement: Anmelden per Link und QR-Code
Beim Start des LAN-Modus MUST der Task jede erreichbare IPv4-Adresse als
vollständige Adresse mit Token (`?token=…`) ausgeben, einen QR-Code einer
dieser Adressen im Terminal zeigen (wählbar mit `--qr-host`) und darauf
hinweisen, dass jeder mit diesem Link Zugriff hat. Ruft ein Browser eine
Seite außerhalb von `/api/` mit gültigem `token` auf, MUST das Backend das
Cookie `mmy_access` setzen (`HttpOnly`, `SameSite=Strict`, 30 Tage, `Secure`
bei HTTPS auch hinter einem Proxy) und auf dieselbe Adresse ohne `token`
weiterleiten. Ein ungültiges Token MUST kein Cookie setzen.

#### Scenario: QR-Code scannen
- **WHEN** ein Benutzer den QR-Code aus dem Terminal mit dem Handy scannt und
  den Link öffnet
- **THEN** lädt die Anwendung, die Adresszeile enthält kein Token, und
  API-Anfragen sind ohne erneute Anmeldung möglich, auch nach einem Neustart
  des LAN-Modus ohne `--rotate-token`

#### Scenario: Falsches Token
- **WHEN** ein Gerät `/?token=falsch` aufruft
- **THEN** wird kein Cookie gesetzt, und die Anwendung zeigt den Dialog
  „Zugang erforderlich“

### Requirement: Hinweis bei fehlendem Zugang
Antwortet die API mit `auth.required`, MUST die Oberfläche einen Y2K-Dialog
„Zugang erforderlich“ zeigen, der erklärt, dass man den Link oder QR-Code aus
dem Terminal erneut öffnen muss, und statt „Backend nicht erreichbar“ den
Zustand „Kein Zugang“ anzeigen. Die Texte MUST auf Deutsch und Englisch
vorliegen.

#### Scenario: Cookie abgelaufen
- **WHEN** ein Benutzer die Anwendung öffnet und die API mit `auth.required`
  antwortet
- **THEN** erscheint der Dialog „Zugang erforderlich“, und die Anwendung
  stürzt nicht ab

### Requirement: Dokumentierte HTTPS-Wege
Die Dokumentation MUST zwei Wege zu HTTPS beschreiben: `tailscale serve` vor
dem LAN-Modus mit `--behind-proxy` (echtes Zertifikat, auch außerhalb des
Heimnetzes) und ein mit mkcert erzeugtes Zertifikat fürs Heimnetz,
einschließlich des Vertrauens der Root-CA auf iOS und Android. Sie MUST die
Sicherheitsgrenzen nennen (Token im Link, HTTP unverschlüsselt, keine
Benutzerkonten).

#### Scenario: Anleitung Tailscale
- **WHEN** ein Benutzer der Anleitung für Tailscale folgt
- **THEN** erreicht er die Anwendung am Handy unter einer
  `https://….ts.net/`-Adresse ohne Zertifikatswarnung
