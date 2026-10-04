## Context

Stand: `develop` nach `add-music-track` (alle bisherigen Changes archiviert).
Die Web-App hat keine einzige Media-Query; `AppWindow.module.css` ist ein
festes Raster (Aufgabenbereich | Sammlung | Monitor, darunter Storyboard,
`min-height: 560px`). Ziehen und Ablegen läuft über dnd-kit mit
`StoryboardPointerSensor` (Aktivierung nach 5 px) und `KeyboardSensor`;
Kontextmenüs öffnen per Rechtsklick (`onContextMenu`), Hinzufügen und Setzen
per Doppelklick.

Vorgaben des Product Owners (2026-10-03):

- Layoutkonzept „Taskleisten-Schritte“: Monitor oben, Bildstreifen darunter,
  XP-Taskleiste mit 1./2./3. unten; Sammlungen, Übergänge und Eigenschaften als
  Bottom-Sheets.
- Zielgeräte: Handy hoch und quer als Hauptziel, Tablet mit Zwischenlayout,
  Desktop ab 1280 px bleibt wie heute.
- Volle Funktionsgleichheit mit dem Desktop.
- Gesten und Haptik sind Teil des Umfangs.
- Aufteilung in zwei Changes: dieser (Layout und Bedienung) und
  `add-mobile-delivery` (LAN-Modus, HTTPS, Token, PWA, Teilen).

Standardwerte, vom Planning Agent festgelegt (im PR änderbar): Grenzen 600 und
1280 px; Zielgröße 44×44 px (Apple HIG; Material 48 dp ist mit 44 px plus
Abstand abgedeckt); langes Drücken 400 ms; Wisch-Schwelle 48 px; Vibration
10 ms; Pixelverhältnis der Vorschau höchstens 2.

## Mobile-UX-Prinzipien (Analyse)

Grundlage für die Entscheidungen unten:

| Prinzip | Quelle | Umsetzung hier |
|---|---|---|
| Ziele ≥ 44×44 pt, Abstand ≥ 8 px | Apple HIG, Material, WCAG 2.5.8 | Token `--y2k-touch-target`, gilt bei grobem Zeiger und im kompakten Modus |
| Daumenzone: Hauptaktionen unten | Hoober (Thumb Zone) | Taskleiste und Aktionsleiste unten, Titelleiste nur sekundär |
| Kein Hover, kein Rechtsklick, kein Doppelklick | Touch-Plattformen | Tippen = wählen, langes Drücken bzw. „⋯“ = Aktionen |
| Ziehen nie als einziger Weg | WCAG 2.5.7 | „Hinzufügen“, „Nach links/rechts“, Übergang per Sheet |
| Gesten haben eine Alternative | WCAG 2.5.1 | Wischen ↔ Vorheriges/Nächstes, Zoom ↔ Schaltflächen |
| Progressive Offenlegung, ein Fokus je Ansicht | Nielsen Norman Group | Drei Schritte als Navigation, Details in Sheets |
| Bottom-Sheets statt zentrierter Dialoge | Material, iOS | `Sheet`-Komponente im Y2K-Fensterstil |
| Safe Areas, dynamische Höhe | WebKit/CSS | `viewport-fit=cover`, `env(safe-area-inset-*)`, `100dvh` |
| Kein Zoom-Sprung | iOS Safari | Eingaben mindestens 16 px Schrift |
| Sofortiges Feedback | Material | XP-„gedrückt“-Zustand, Vibration, kurze Hinweise |
| Bewegung reduzieren | WCAG 2.3.3 | `prefers-reduced-motion` schaltet Sheet-Animationen ab |
| Leistung und Akku | Web.dev | Pixelverhältnis begrenzen, Render-Schleife bei verdecktem Tab anhalten |

## Goals / Non-Goals

**Goals:** Jede Funktion der Anwendung ist am Handy erreichbar; der
Movie-Maker-Ablauf und der Y2K-Look bleiben erkennbar; das Desktop-Layout
ändert sich nicht; die Bedienlogik (Store, Zeitmodell, API) bleibt für alle
Layouts dieselbe.

**Non-Goals:** siehe proposal.md.

## Decisions

### D1 – Layout-Modi
Ein Hook `useLayoutMode()` liefert `compact | medium | wide` per
`matchMedia` (`(max-width: 599px)`, `(max-width: 1279px)`) und dazu
`coarse: boolean` aus `(pointer: coarse)`. Ein Handy quer mit weniger als
500 px Höhe gilt als `compact` mit Ausrichtung `landscape`
(`(orientation: landscape) and (max-height: 499px)`). CSS nutzt dieselben
Grenzen als Media-Queries; das Wurzelelement trägt `data-layout` und
`data-pointer` für Komponenten, die sich im Verhalten unterscheiden (z. B.
Kontextmenü vs. Aktions-Sheet). Die Grenzen liegen als Konstanten an einer
Stelle (`src/shell/layoutMode.ts`) und als CSS-Custom-Media-Kommentar im
Theme.

### D2 – Theme-Erweiterung
`theme.css` bekommt Tokens `--y2k-touch-target` (44px), `--y2k-touch-gap`
(8px), `--y2k-taskbar-height`, `--y2k-sheet-radius` sowie die Safe-Area-Werte
als Tokens (`--y2k-safe-top` = `env(safe-area-inset-top, 0px)` usw.). Die
Taskleiste nutzt den Luna-Verlauf der Titelleiste und grüne
„Start“-Akzentfarbe nur als eigene Interpretation (kein XP-Logo, keine
Original-Bitmaps). `index.html` setzt
`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
und `<meta name="theme-color">`. Das Fenster nutzt `height: 100dvh` mit
Fallback `100vh`; `min-height: 560px` gilt nur im breiten Modus.

### D3 – Kompaktes Layout
Raster von oben nach unten: Titelleiste (Name, Projektzustand, Menüschaltfläche
„☰“), Monitor (4:3, volle Breite, höchstens 45 % der Höhe), Steuerleiste
(Wiedergabe, Stopp, Vorheriges, Nächstes, Suchleiste, Zeit, Vollbild),
Bearbeitungsbereich (Bildstreifen mit horizontalem Scrollen, Musikleiste),
Aktionsleiste des gewählten Elements (erscheint nur bei Auswahl),
Taskleiste. Die Statusleiste entfällt; ihr Inhalt erscheint als kurze
Hinweise („Gespeichert“ nur bei Zustandswechsel, „Speichern fehlgeschlagen“
dauerhaft als Symbol in der Titelleiste). Querformat: Monitor und
Steuerleiste links (60 %), Bearbeitungsbereich und Taskleiste rechts.

### D4 – Taskleiste und Schritte
Die Taskleiste zeigt drei Schaltflächen „1. Aufnehmen“, „2. Bearbeiten“,
„3. Fertig stellen“ (Kurztexte aus i18n; die langen Texte bleiben im
Aufgabenbereich des Desktops). Jede öffnet ein Sheet mit genau den Einträgen
der entsprechenden Aufgabengruppe (gleiche Aktivierungslogik, gleiche
Komponenten-Daten wie `TaskPane`), also z. B. „Bilder importieren“,
„Audio oder Musik importieren“; „Sammlungen anzeigen“,
„Videoübergänge anzeigen“; „Auf dem Computer speichern“. Menüfunktionen wie
Clip → „Film an Musik anpassen“ bleiben im Menü-Sheet (D11). Der aktive Schritt ist hervorgehoben. Die Aufgabengruppen werden
dafür aus `App.tsx` in eine Datenbeschreibung (`tasks.ts`) gezogen, die
Desktop und Taskleiste gemeinsam nutzen.

### D5 – Sheet-Komponente
`ui/Sheet.tsx`: modal, von unten, Y2K-Fensterrahmen mit Luna-Titelzeile und
Griff; Höhen `auto` (bis 90 %) und `full`. Schließt per „Schließen“, Escape,
Tippen auf den Hintergrund und Herunterwischen am Griff (Schwelle 80 px oder
schnelles Wischen). Fokusfalle und Fokusrückgabe wie `Dialog`; Rolle
`dialog`, `aria-modal`. `Dialog` rendert im kompakten Modus intern als Sheet,
sodass bestehende Dialoge ohne Umbau folgen. Animation 200 ms, aus bei
`prefers-reduced-motion`. Unterer Innenabstand berücksichtigt die Safe Area.

### D6 – Auswahl- und Aktionsmodell
Im Touch-Modus (`coarse` oder `compact`) gilt:

- **Tippen** wählt ein Element (Bild, Übergangsslot, Musikstück) und springt
  bei Bildern mit dem Monitor dorthin; Doppelklick-Aktionen gibt es nicht.
- **Aktionsleiste** über der Taskleiste zeigt die Aktionen des gewählten
  Elements als Symbol-Schaltflächen mit Text: Bild: „Dauer…“, „Nach links“,
  „Nach rechts“, „Übergang davor…“, „Entfernen“; Musikstück: „Lautstärke…“,
  „Kürzen…“, „Einblenden“, „Ausblenden“, „Nach links“, „Nach rechts“,
  „Entfernen“.
- **Langes Drücken** (400 ms ohne Bewegung > 8 px) oder „⋯“ öffnet dasselbe
  Menü wie heute der Rechtsklick, als Aktions-Sheet. `ContextMenu` bekommt
  dafür eine Sheet-Darstellung; Inhalte und Logik bleiben gleich.
- Die Aktionen rufen dieselben Store-Funktionen wie Desktop-Menüs auf; es gibt
  keine zweite Bearbeitungslogik.

### D7 – Hinzufügen aus der Sammlung
Das Sammlungs-Sheet hat Reiter „Meine Bilder“, „Meine Musik“ und
„Videoübergänge“ (entspricht der Sammlungsauswahl) und oben „Importieren“.
In Bildern und Musik schaltet Tippen die Auswahl (Häkchen); die feste
Schaltfläche „Zum Bildstreifen hinzufügen (n)“ bzw. „Zur Musikleiste
hinzufügen (n)“ hängt die Auswahl in Auswahlreihenfolge hinten an oder nach
dem gewählten Bild ein und schließt das Sheet. Langes Drücken auf eine Kachel
zeigt „Eigenschaften“ und „Löschen“. Der Dateiauswahl-`accept` bleibt eine
explizite MIME-Liste (iOS liefert dann JPEG statt HEIC).

### D8 – Umsortieren per Touch
dnd-kit bekommt im Touch-Modus einen eigenen Sensor (`TouchSensor` mit
`activationConstraint: { delay: 400, tolerance: 8 }`), damit horizontales
Scrollen des Bildstreifens nicht als Ziehen gilt. Während des Ziehens:
`touch-action: none` auf dem gezogenen Element, `overscroll-behavior: contain`
im Bildstreifen, automatisches Scrollen am Rand, Vibration bei Aktivierung und
Ablegen. Im mittleren Modus darf man zusätzlich aus der (nebenstehenden)
Sammlung in den Bildstreifen ziehen; im kompakten Modus nicht, weil das Sheet
den Bildstreifen verdeckt. „Nach links/rechts“ ist immer die gleichwertige
Alternative.

### D9 – Übergänge setzen
Tippen auf einen Übergangsslot öffnet das Sheet „Übergang“: Liste des
Katalogs mit Namen und Symbol, oben „Kein Übergang“, darunter die Dauer als
Stepper (0,25–5 s, Schritt 0,25 s). Wählen eines Übergangs setzt ihn sofort
und spielt ihn im Monitor einmal am echten Projekt ab (gleiche Logik wie die
Desktop-Vorschau des Slots). Das Sheet bleibt offen, bis „Fertig“ gewählt
wird.

### D10 – Touch-taugliche Eingaben
Dauer-, Lautstärke- und Kürzen-Dialoge zeigen einen Stepper (− / Wert / +)
plus Schieberegler; das Zahlenfeld bleibt mit `inputmode="decimal"` und
16 px Schrift. Schrittweiten: Bilddauer 0,5 s, Übergang 0,25 s, Lautstärke
5 %, Kürzen 0,1 s. Der Kürzen-Dialog zeigt die Wellenform mit zwei
ziehbaren Griffen (Ziele 44 px) und spielt beim Loslassen 2 s ab der Marke an.
Der Assistent „Film speichern“ ist im kompakten Modus ein Vollbild-Sheet mit
„Zurück“/„Weiter“ unten.

### D11 – Menü im kompakten Modus
„☰“ öffnet das Sheet „Menü“ im Stil eines Startmenüs: die sieben Menüs als
aufklappbare Gruppen mit denselben Einträgen und derselben Aktivierung aus
`menus.ts`. Deaktivierte Einträge bleiben sichtbar. Kurzbefehl-Hinweise
(Tastenkürzel) werden ausgeblendet.

### D12 – Monitor, Gesten und Vollbild
- Wischen horizontal im Monitor (≥ 48 px, überwiegend horizontal) springt
  zum vorherigen/nächsten Bild (wie die Schaltflächen).
- Doppeltippen im Monitor oder die Schaltfläche „Vollbild“ öffnet die
  Vollbildvorschau: Fullscreen-API am Monitor-Container, ersatzweise (iOS
  Safari auf dem iPhone) ein festes Overlay über den ganzen Viewport;
  Steuerleiste blendet sich nach 3 s ohne Berührung aus.
- Zwei-Finger-Zoom im Bildstreifen ändert die Kachelgröße in drei Stufen
  (klein/mittel/groß); gleichwertig per zwei Schaltflächen „Kleiner“ und
  „Größer“ im Kopf des Bildstreifens (die Menüs bleiben unverändert). Die Stufe wird lokal gespeichert
  (`localStorage`, wie die Sprache).
- Gesten werden per Pointer Events selbst erkannt (kleiner Hook
  `useGestures`), ohne neue Abhängigkeit.

### D13 – Haptik
`haptics.ts` kapselt `navigator.vibrate` (10 ms Aktivierung, 15 ms Ablegen,
2×10 ms bei Ablehnung). Fehlt die API (z. B. iOS Safari), passiert nichts.
„Extras → Optionen…“ bekommt den Schalter „Vibration“ (Standard an), lokal
gespeichert; der Schalter erscheint nur, wenn die API vorhanden ist.

### D14 – Leistung
- Canvas-Puffer = CSS-Größe × min(`devicePixelRatio`, 2), höchstens 1920 px
  Breite.
- `visibilitychange`: verdeckter Tab pausiert die Wiedergabe und stoppt die
  Render-Schleife.
- Kacheln mit `loading="lazy"` und `decoding="async"`; Bildstreifen
  virtualisiert nicht (höchstens einige Hundert Kacheln, siehe Projektgrenzen).
- `overscroll-behavior-y: none` am Fenster verhindert Pull-to-Refresh.
- Kein neues Laufzeit-Paket für Layout oder Gesten.

### D15 – Tests
Komponententests (Vitest/jsdom) setzen `matchMedia` per Helfer
(`mockLayout("compact", { coarse: true })`). Playwright bekommt Projekte mit
Geräteprofilen (`iPhone 13`, `Pixel 7`, `iPad (gen 7)`; `hasTouch`) und
prüft: keine horizontale Seiten-Scrollbar, alle sichtbaren interaktiven
Elemente ≥ 44×44 px im kompakten Modus, kompletter Ablauf Import →
Bildstreifen → Übergang → Musik → Export per Tippen, hoch und quer.

## Risks / Trade-offs

- **Zwei Bedienmodelle** (Maus/Touch) können auseinanderlaufen → beide rufen
  dieselben Store-Aktionen auf; Tests decken jede Aktion in beiden Modi ab.
- **iOS Safari**: keine Vibration, eingeschränkte Fullscreen-API, Web Audio
  wird vom Stummschalter stummgeschaltet → Ersatz-Overlay, Haptik optional,
  Hinweis in der README.
- **Leistung auf schwachen Handys** (WebGL2 mit großen Bildern) → Puffer
  begrenzt, Vorschaubilder statt Originale (bereits so).
- **Platz im Hochformat**: Monitor plus Bildstreifen plus Musik ist knapp →
  Monitor auf 45 % begrenzt, Musikleiste einklappbar.

## Migration Plan

Keine Daten- oder API-Änderung. Das Desktop-Layout bleibt per
Media-Query-Grenze unverändert; Rückfall ist das Entfernen der neuen
Media-Queries.

## Open Questions

Keine; die Standardwerte oben sind im PR änderbar.
