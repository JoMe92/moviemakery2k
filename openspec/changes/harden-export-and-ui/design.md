## Context

Stand: `develop` mit `add-movie-export` und `add-ui-localisation` (archiviert
2026-10-02). Die Funde stammen aus den Discoveries der Beads, aus Reviews der
Spezialisten und aus einem Rundgang mit Screenshots (Cloud-Session
2026-10-02).

### Funde

| # | Fund | Quelle | Behandlung |
|---|---|---|---|
| F1 | Spec verspricht Export auf Linux aarch64, `pixi.toml` hat kein `linux-aarch64`, `mesalib` nur als linux-64-Ziel | `mmy-nav` | D1, TASK-INFRA-009 |
| F2 | MP4 ohne Farbraum-Kennzeichnung (BT.601-Matrix von swscale) | `mmy-5v4` | D2, TASK-RENDER-005 |
| F3 | Upload-Ergebnis: Code in `error`, Export-Job: Code in `errorCode`, `error` = Meldung | `mmy-ojm`, `mmy-dix` | D3, TASK-API-009 |
| F4 | Vollständigkeit der Fehlerübersetzungen per Test, der `errors.py` als Text parst | `mmy-dix` | D4, TASK-API-009, TASK-WEB-021 |
| F5 | Medium während des Exports gelöscht → Bild wird schwarz gerendert | `mmy-a2f` | D5, TASK-API-010, TASK-WEB-022 |
| F6 | 422 bei Dauern: Bildnummer nur noch in `loc`, nicht in der Meldung | `mmy-ojm` | D6, TASK-WEB-023 |
| F7 | Offene Übergangssammlung zeigt Demo („A“-Beispielbild) statt Projekt | Rundgang | D7, TASK-WEB-024 |
| F8 | Fehlerdialog: zwei Schaltflächen mit dem Namen „Schließen“ | `mmy-ym3` | D8, TASK-WEB-025 |
| F9 | `index.html` fest `lang="de"` bis die App lädt | `mmy-etx` | D8, TASK-WEB-025 |
| F10 | Fertige Exporte nach Neustart verloren (`exports/` wird geleert) | `mmy-a2f`, `mmy-rpx` | D9, TASK-API-011 |
| F11 | Kurzzeitig 6 fertige Exporte sichtbar, bevor aufgeräumt wird | `mmy-rpx` | D9, TASK-API-011 |
| C1 | `e2e/` und `scripts/` nicht im Lint; ruff-Funde in `scripts/` | Review | TASK-INFRA-010 |
| C2 | Deutsche Kommentare in `e2e/`; Spec-Verweise in Kommentaren uneinheitlich | Review | TASK-INFRA-010 |
| C3 | `Image.getdata()` in E2E (entfällt in Pillow 14) | `mmy-8te` | TASK-INFRA-010 |
| C4 | Storyboard-Fix nutzt interne Felder von dnd-kit, Version nicht gepinnt | `mmy-fa5` | TASK-INFRA-011 |
| C5 | `glcontext` startet je Kontext `ldconfig`/`gcc` (`find_library`) | `mmy-5v4` | TASK-INFRA-011 |
| C6 | Kreuzvergleich nur mit Einfarbbildern; Pixelate-Mitte nicht aussagekräftig | `mmy-arf`, `mmy-8te` | D10, TASK-WEB-026 |

Entscheidungen des Product Owners (2026-10-02): aarch64 unterstützen; Löschen
während eines Exports blockieren; fertige Exporte über Neustart behalten;
Demo-Animation nur nach Auswahl.

## Goals / Non-Goals

**Goals:** Spec und Verhalten stimmen wieder überein; kein stiller Fehler im
Export; die Übersetzungs-Vollständigkeit ist Teil des Typechecks.

**Non-Goals:** neue Funktionen; Performance-Optimierung des Encoders.

## Decisions

### D1 – linux-aarch64
`linux-aarch64` kommt zu den Pixi-Plattformen; `mesalib` und die
EGL-Aktivierungsvariablen gelten für beide Linux-Ziele (conda-forge liefert
mesalib 26.2, moderngl 5.12, glcontext 3.0, libegl 1.7, ffmpeg 9.0 auch für
linux-aarch64, per `pixi search` geprüft). CI bekommt einen Job auf
`ubuntu-24.04-arm`, der `check-render-env` und die Render-/Export-Tests des
Backends ausführt.
*Risiko:* ARM-Runner sind für private Repos ggf. nicht verfügbar; dann läuft
der Job nur, wenn das Repo öffentlich ist, und der Nachweis erfolgt einmalig
auf einem Pi (dokumentiert im Bead).

### D2 – BT.709 mit Kennzeichnung
Die Umrechnung RGB → YUV erfolgt mit `scale=out_color_matrix=bt709:out_range=tv`,
das MP4 trägt `-colorspace bt709 -color_primaries bt709 -color_trc bt709
-color_range tv`. Der PSNR-Test dekodiert ebenfalls mit BT.709. Grund: Browser
und Player nehmen bei HD-Material BT.709 an; so stimmen Vorschau und Film
farblich überein.

### D3 – Einheitliche Fehlerfelder
Upload-Ergebnis je Datei und Export-Job tragen beide `errorCode`,
`errorParams` und `message` (englisch). `error` entfällt. Das Frontend liest
nur noch diese Felder.

### D4 – Fehlercodes im Vertrag
Das Backend führt die Codes als `StrEnum` `ErrorCode`, das in OpenAPI als
Aufzählung erscheint (`errorCode`, `ApiError.code`). Die generierten TS-Typen
enthalten damit die Union aller Codes; der Katalog `errors` in `en.ts` wird
über diesen Typ geschlüsselt, ein fehlender Code ist ein Typfehler. Der Test,
der `errors.py` als Text parst, entfällt.

### D5 – Löschen blockieren
`DELETE /api/media/{id}` antwortet mit `409` und `media.inUseByExport`, solange
ein Export im Status `queued` oder `running` das Medium im Schnappschuss hat.
Die Oberfläche zeigt die übersetzte Meldung; das Medium bleibt in Sammlung und
Bildstreifen.

### D6 – Bildnummer in 422-Meldungen
Bei FastAPI-422-Listen leitet das Frontend aus `loc`
(`["body","slides",<i>,…]`) die Bildnummer `i + 1` ab und stellt der
übersetzten Meldung „Bild <n>: “ bzw. „Picture <n>: “ voran.

### D7 – Demo nur nach Auswahl
Beim Öffnen der Übergangssammlung ist keine Kachel ausgewählt, und der Monitor
zeigt das Projekt. Ein Klick auf eine Kachel spielt die Demo einmal ab; während
der Demo zeigt der Monitor die Kennzeichnung „Beispiel: <Name>“ bzw.
„Sample: <Name>“. Wiedergabe, Suchen oder Auswahl im Bildstreifen kehren zum
Projekt zurück.

### D8 – Dialog-Namen und Dokumentsprache
Die Titelleisten-Schaltfläche der Dialoge heißt „Dialog schließen“ bzw.
„Close dialog“. `index.html` enthält ein kleines Inline-Skript, das `lang` aus
`localStorage`/`navigator.languages` setzt (gleiche Regel wie die App, ohne
Abhängigkeiten).

### D9 – Job-Index und atomare Aufbewahrung
Fertige Exporte werden in `exports/index.json` (atomar geschrieben) mit `id`,
`fileName`, `profile`, `createdAt` geführt. Beim Start werden Einträge mit
vorhandenem `out.mp4` als `done` geladen; alles andere unter `exports/`
(Teildateien, verwaiste Ordner, Jobs ohne Datei) wird entfernt. Der Wechsel
eines Jobs auf `done` und das Aufräumen auf höchstens 5 fertige Exporte
geschehen unter derselben Sperre.

### D10 – Kreuzvergleich mit Muster
Die Debug-Ansicht bekommt einen Modus mit einem eingebauten, exakt 640×480
großen Testmuster (keine Skalierung), z. B. `?debug-progress=<id>:<p>:pattern`.
Der E2E-Kreuzvergleich nutzt ihn zusätzlich für Pixelate und Dissolve.

## Risks / Trade-offs

- **ARM-Runner** ggf. nicht verfügbar (D1) → manueller Nachweis auf dem Pi.
- **BREAKING API** (D3) → Frontend und Backend im selben Change, `gen-api` und
  Drift-Prüfung sichern ab.
- **Farbumrechnung** ändert Pixelwerte im MP4 leicht → PSNR-Schwelle bleibt,
  Referenz wird mit BT.709 dekodiert.

## Migration Plan

Vorhandene Daten unter `exports/` werden beim ersten Start mit dem neuen Index
entfernt (wie bisher). Projektdateien sind nicht betroffen.

## Open Questions

Keine.
