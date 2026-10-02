Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man sieht,
dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Die Funde und
ihre Herkunft stehen in design.md (Context). Der Farbraum-Task trägt einen
Golden-Frame-Test (Vorschau ↔ Export).

## 1. Export

- [ ] TASK-INFRA-009 Plattform `linux-aarch64` in `pixi.toml` mit `mesalib` und den EGL-Aktivierungsvariablen für beide Linux-Ziele, `pixi.lock` aktualisieren, CI-Job auf `ubuntu-24.04-arm` mit `check-render-env` und den Render-/Export-Tests (design.md D1). Erledigt, wenn `pixi install --locked -a` durchläuft und der ARM-Job grün ist oder, falls kein ARM-Runner verfügbar ist, ein Lauf auf einem Pi im Bead belegt ist.
- [ ] TASK-RENDER-005 Farbraum BT.709: Umrechnung `out_color_matrix=bt709`, Tags `bt709`/`tv` im MP4, PSNR-Referenz mit BT.709 dekodieren (design.md D2). Erledigt, wenn pytest per ffprobe die vier Farb-Tags prüft, ein Einfarbbild (rot, blau) nach Dekodierung je Kanal höchstens 3 vom Original abweicht und der Golden-Frame-Kreuzvergleich grün bleibt.
- [ ] TASK-API-011 Job-Index `exports/index.json` (atomar) für fertige Exporte, Laden beim Start, Entfernen aller übrigen Reste, Aufbewahrung und Statuswechsel auf `done` unter einer Sperre (design.md D9). Erledigt, wenn pytest Neustart mit fertigem und abgebrochenem Export, Aufbewahrung ohne Zwischenstand mit 6 fertigen Exporten und einen beschädigten Index abdeckt.

## 2. Fehler und Medien

- [ ] TASK-API-009 Fehlervertrag: `ErrorCode` als `StrEnum` in OpenAPI, Upload-Ergebnis und Export-Job mit `errorCode`, `errorParams`, `message` (`error` entfällt), `gen-api` (design.md D3, D4). Erledigt, wenn pytest beide Formen und die Aufzählung im Schema prüft und `gen-api` sauber und wiederholbar ist.
- [ ] TASK-WEB-021 Frontend auf den Fehlervertrag umstellen: Katalog `errors` über den generierten Typ `ErrorCode` schlüsseln, Upload und Export lesen die einheitlichen Felder, der Test, der `errors.py` parst, entfällt (nach TASK-API-009; design.md D4). Erledigt, wenn ein absichtlich entfernter Katalogeintrag `pixi run typecheck` rot macht und alle Tests grün sind.
- [ ] TASK-API-010 `DELETE /api/media/{id}` → `409` mit `media.inUseByExport`, solange ein wartender oder laufender Export das Medium im Schnappschuss hat (nach TASK-API-009; design.md D5). Erledigt, wenn pytest Löschen während eines Exports (abgelehnt, Medium und Export unverändert) und danach (erlaubt) abdeckt.
- [ ] TASK-WEB-022 Abgelehntes Löschen in der Oberfläche: übersetzte Meldung, Medium bleibt in Sammlung und Bildstreifen (nach TASK-API-010, TASK-WEB-021). Erledigt, wenn Komponententests die Meldung in beiden Sprachen und den unveränderten Bildstreifen abdecken.
- [ ] TASK-WEB-023 Bildnummer in 422-Meldungen aus `loc` ableiten und voranstellen („Bild 2: …“ / „Picture 2: …“) (nach TASK-WEB-021; design.md D6). Erledigt, wenn Vitest eine ungültige Dauer an Bild 2 in beiden Sprachen und einen Fehler ohne Bildbezug abdeckt.

## 3. Oberfläche

- [ ] TASK-WEB-024 Übergangssammlung: keine Vorauswahl, Demo nur nach Klick, Kennzeichnung „Beispiel: <Name>“ / „Sample: <Name>“, Rückkehr zum Projekt bei Wiedergabe, Suchen oder Auswahl im Bildstreifen (design.md D7). Erledigt, wenn Komponententests alle drei Spec-Szenarien abdecken.
- [ ] TASK-WEB-025 Dialog-Titelleiste „Dialog schließen“ / „Close dialog“ und Inline-Skript in `index.html` für `<html lang>` vor dem App-Start (design.md D8). Erledigt, wenn ein Test eindeutige Schaltflächennamen im Fehlerdialog prüft und ein E2E-Test `lang="en"` vor der Ausführung des App-Skripts nachweist.
- [ ] TASK-WEB-026 Debug-Ansicht mit eingebautem 640×480-Testmuster (`?debug-progress=<id>:<p>:pattern`) und E2E-Kreuzvergleich Vorschau ↔ Export für Pixelate und Dissolve mit dem Muster (design.md D10). Erledigt, wenn der Kreuzvergleich mit Muster die Toleranz aus der Spec einhält und `pixi run test-e2e` grün ist.

## 4. Wartung und Abschluss

- [ ] TASK-INFRA-010 Lint auch für `e2e/` und `scripts/` (ruff im Pixi-Task `lint`), vorhandene Funde beheben, deutsche Kommentare in `e2e/` englisch, Spec-Verweise einheitlich als `spec <capability> "<Titel>"`, `Image.getdata()` ersetzen. Erledigt, wenn `pixi run lint` die beiden Ordner prüft und grün ist und `pixi run test-e2e` ohne Pillow-Warnung läuft.
- [ ] TASK-INFRA-011 `@dnd-kit/core` auf `~6.3.1` pinnen mit Kommentar zum Storyboard-Fix; `glcontext` ohne `find_library`-Unterprozesse starten oder den Aufwand messen und dokumentieren. Erledigt, wenn `pnpm-lock.yaml` die gepinnte Version zeigt und der Export-Start ohne `ldconfig`/`gcc`-Aufruf belegt oder die gemessene Dauer im Bead steht.
- [ ] TASK-INFRA-012 Doku: README und `docs/architecture.md` (ARM, Farbraum, Job-Index, Fehlervertrag), CHANGELOG „Unreleased“ mit BREAKING-Hinweis (nach allen anderen Tasks). Erledigt, wenn die Doku die Entscheidungen D1–D10 abbildet und `pixi run check` grün ist.
