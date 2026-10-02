## Context

Stand: 0.1.0 plus der Change `add-movie-export` (Assistent „Film speichern“,
Export-API). Die Oberfläche ist deutsch; Texte stehen direkt in den
React-Komponenten (rund 200 Zeichenketten in etwa 50 Dateien), die sechs
Katalognamen stehen deutsch in `packages/catalog/transitions.json`, das Backend
gibt deutsche Fehlermeldungen als `detail` zurück. Bead `mmy-85c` verlangt eine
englische Oberfläche und englische Kommentare für die Veröffentlichung.

Vorgaben des Product Owners (2026-10-02): Deutsch und Englisch umschaltbar,
Sprache folgt dem Browser, umschaltbar über Extras → Optionen, Rückfall
Englisch; Katalognamen und Backend-Fehler werden über Codes lokalisiert;
Code-Kommentare und Docstrings werden englisch.

Dieser Change setzt auf `add-movie-export` auf. Seine Umsetzung beginnt erst,
wenn `add-movie-export` in `develop` integriert ist (Abhängigkeit des ersten
Tasks auf den letzten Export-Task).

## Goals / Non-Goals

**Goals:**
- Kein sichtbarer Text mehr im Komponenten-Code; fehlende Übersetzungen fallen
  schon beim Typecheck auf.
- Sprachwechsel ohne Neuladen.
- Bestehende Tests bleiben aussagekräftig (sie laufen weiter auf Deutsch).

**Non-Goals (Design-Ebene):**
- Keine Laufzeit-Bibliothek für i18n, kein Laden von Sprachdateien über das
  Netz.
- Keine serverseitige Sprachwahl; das Backend bleibt sprachneutral.

## Decisions

### D1 – Eigene, typisierte Sprachkataloge statt Bibliothek
`apps/web/src/i18n/en.ts` ist der Referenzkatalog (verschachteltes Objekt mit
Schlüsseln nach Bereich, z. B. `menu.file.saveMovie`), `de.ts` MUST denselben
Typ erfüllen (`satisfies Messages`), sodass ein fehlender Schlüssel ein
Typfehler ist. `t(key, params)` ersetzt `{name}`-Platzhalter; Mehrzahl über
`Intl.PluralRules` (`{count}` mit `one`/`other`-Varianten).
*Alternative:* react-i18next/FormatJS – verworfen: zusätzliche Abhängigkeit,
Schlüssel zur Laufzeit untypisiert, Mehrwert für zwei Sprachen gering.

### D2 – Sprachwahl
Reihenfolge: gespeicherte Einstellung (`localStorage` `mmy.locale`) →
`navigator.languages` (erster Eintrag, der mit `de` oder `en` beginnt) →
`en`. Die Sprache liegt im Zustand-Store; Komponenten lesen sie über
`useT()`. `<html lang>` wird mitgeführt.

### D3 – Sprachabhängige Formate
`Intl.NumberFormat` für Dezimalzahlen (Dauern, Größen), Zeitanzeige
`h:mm:ss,cc` (de) bzw. `h:mm:ss.cc` (en). Eingaben in Dauer-Dialogen
akzeptieren Komma und Punkt in beiden Sprachen.

### D4 – Katalognamen
`transitions.schema.json`: `name` (String) wird zu `names`
(`{ "de": string, "en": string }`, beide Pflicht). Backend-Modell und
OpenAPI folgen; das Frontend zeigt `names[locale]`. Englische Namen sind eigene
Formulierungen: Fade, Dissolve, Wipe right, Circle, Pixelate, Checkerboard.

### D5 – Fehlercodes vom Backend
Eigene Fehler (Medien, Projekt, Export) antworten mit
`{"detail": {"code": "<bereich.fehler>", "params": {…}, "message": "<english>"}}`.
Export-Jobs tragen zusätzlich `errorCode`. Das Frontend übersetzt bekannte
Codes und zeigt sonst `message`. FastAPIs eigene 422-Validierungsfehler
(Liste) bleiben unverändert; das Frontend bildet bekannte Felder
(z. B. `fileName`) auf übersetzte Hinweise ab und zeigt sonst einen
allgemeinen Text.

### D6 – Tests
Die Testumgebung setzt die Sprache auf Deutsch, damit bestehende Tests
unverändert gelten. Ein Test prüft, dass `de` und `en` dieselben Schlüssel
haben und keine leeren Werte. E2E läuft mit Browser-Locale `de-DE`; ein
zusätzlicher E2E-Test schaltet über Optionen auf Englisch.

### D7 – Englische Kommentare
Kommentare, Docstrings, Pixi-Task-Beschreibungen und CI-Schrittnamen werden
mechanisch übersetzt, getrennt nach Backend/Skripten und Web/Paketen. Keine
Verhaltensänderung in diesen Commits.

## Risks / Trade-offs

- **Großer Diff mit vielen Textstellen** → Aufteilung nach Bereichen, jeder
  Task mit grünem `pixi run check`.
- **API-Bruch bei Katalog und Fehlern** → Frontend und Backend ändern sich im
  selben Change; `gen-api` und Drift-Prüfung in CI sichern den Vertrag.
- **Konflikte mit laufender Arbeit** → Start erst nach Integration von
  `add-movie-export`.

## Migration Plan

Projektdateien sind nicht betroffen (sie speichern nur Übergangs-IDs). Die
gespeicherte Spracheinstellung ist neu und optional. Rollback = Change
zurücknehmen.

## Open Questions

Keine.
