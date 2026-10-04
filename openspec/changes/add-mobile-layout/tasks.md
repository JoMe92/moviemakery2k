Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man sieht,
dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Dieser Change
wird vor `add-mobile-delivery` umgesetzt und archiviert. Es gibt keine
Backend- oder API-Änderung.

## 1. Grundlagen

- [x] TASK-WEB-032 Layout-Modi und Theme: `useLayoutMode()` (`compact`/`medium`/`wide`, Querformat, `coarse`) in `src/shell/layoutMode.ts`, `data-layout`/`data-pointer`, Touch- und Safe-Area-Tokens, `viewport-fit=cover`, `100dvh`, Testhelfer `mockLayout()` (design.md D1, D2). Erledigt, wenn Vitest den Moduswechsel an allen Grenzen (599/600, 1279/1280, Querformat unter 500 px Höhe) prüft und das breite Layout unverändert ist.
- [x] TASK-WEB-033 Aufgabengruppen als Daten: Einträge des Aufgabenbereichs aus `App.tsx` in `tasks.ts` (Text, Symbol, Aktion, Aktivierung) ziehen und `TaskPane` darauf umstellen, ohne Verhaltensänderung (nach TASK-WEB-032; design.md D4). Erledigt, wenn die bestehenden TaskPane- und App-Tests unverändert grün sind.
- [x] TASK-WEB-034 Sheet-Komponente: `ui/Sheet.tsx` im Y2K-Fensterstil mit Griff, Höhen `auto`/`full`, Schließen per Schaltfläche, Escape, Hintergrund und Herunterwischen, Fokusfalle und -rückgabe, `prefers-reduced-motion`, Safe Area; `Dialog` rendert im kompakten Modus als Sheet (nach TASK-WEB-032; design.md D5). Erledigt, wenn Komponententests alle Szenarien von „Bottom-Sheets im Y2K-Stil“ abdecken.

## 2. Kompaktes und mittleres Layout

- [x] TASK-WEB-035 Kompakte Shell: Titelleiste mit „☰“ und Speicher-Warnsymbol, Monitor (höchstens 45 %), Steuerleiste, Bearbeitungsbereich, Taskleiste; Querformat-Variante; Hinweise statt Statusleiste; Texte in `de`/`en` (nach TASK-WEB-034; design.md D3). Erledigt, wenn Komponententests die Szenarien von „Kompaktes Layout“ in beiden Ausrichtungen abdecken.
- [x] TASK-WEB-036 Taskleiste und Schritt-Sheets: drei Schaltflächen, Sheets mit den Einträgen aus `tasks.ts`, Hervorhebung des aktiven Schritts, deaktivierte Einträge mit `aria-disabled` (nach TASK-WEB-033, TASK-WEB-035; design.md D4). Erledigt, wenn Komponententests beide Szenarien von „Taskleiste mit den drei Movie-Maker-Schritten“ in beiden Sprachen abdecken.
- [x] TASK-WEB-037 Menü-Sheet: „☰“ öffnet „Menü“ mit allen Menüs aus `menus.ts` als aufklappbare Gruppen, gleiche Aktivierung, ohne Tastenkürzel-Hinweise (nach TASK-WEB-034, TASK-WEB-035; design.md D11). Erledigt, wenn ein Komponententest „Neues Projekt am Handy“ und die Deaktivierung von „Film speichern…“ bei leerem Bildstreifen prüft.
- [x] TASK-WEB-038 Mittleres Layout: Monitor und Sammlung nebeneinander, Bildstreifen darunter, Taskleiste unten, Ziehen aus der Sammlung in den Bildstreifen per Touch erlaubt (nach TASK-WEB-036; design.md D3, D8). Erledigt, wenn Komponententests das Szenario „Tablet“ und Ziehen aus der Sammlung im mittleren Modus abdecken.

## 3. Touch-Bedienung

- [x] TASK-WEB-039 Auswahl, Aktionsleiste und Aktions-Sheets: Tippen wählt, Aktionsleiste je Elementart, langes Drücken (400 ms, 8 px) und „⋯“ öffnen das Kontextmenü als Sheet, alles über die bestehenden Store-Funktionen (nach TASK-WEB-034, TASK-WEB-035; design.md D6). Erledigt, wenn Komponententests „Bild nach rechts verschieben“, „Aktionsmenü per langem Drücken“ und je Aktion die gleiche Store-Wirkung wie am Desktop prüfen.
- [x] TASK-WEB-040 Sammlungs-Sheet: Reiter Bilder/Musik/Übergänge, Importieren, Mehrfachauswahl mit Häkchen und `aria-pressed`, „Zum Bildstreifen/Zur Musikleiste hinzufügen (n)“ in Auswahlreihenfolge, langes Drücken mit „Eigenschaften“/„Löschen“ (nach TASK-WEB-036, TASK-WEB-039; design.md D7). Erledigt, wenn Komponententests alle Szenarien von „Hinzufügen aus der Sammlung per Auswahl“ abdecken.
- [x] TASK-WEB-041 Umsortieren per Touch: dnd-kit-`TouchSensor` (400 ms, 8 px) für Bildstreifen und Musikleiste im Touch-Modus, `touch-action`/`overscroll-behavior`, Auto-Scroll am Rand (nach TASK-WEB-039; design.md D8). Erledigt, wenn Komponententests „Scrollen statt Ziehen“ und „Ziehen nach langem Drücken“ für Bilder und Musikstücke abdecken.
- [x] TASK-WEB-042 Übergangs-Sheet: Tippen auf Slot öffnet „Übergang“ mit „Kein Übergang“, Katalog, Dauer-Stepper, sofortigem Setzen und einmaligem Abspielen im Monitor, „Fertig“ (nach TASK-WEB-039; design.md D9). Erledigt, wenn Komponententests beide Szenarien von „Übergänge per Sheet setzen“ und das Entfernen abdecken.
- [x] TASK-WEB-043 Touch-taugliche Eingaben: Stepper und Schieberegler in den Dialogen Dauer, Lautstärke und Kürzen, `inputmode="decimal"` und 16 px Schrift, Kürzen-Griffe auf der Wellenform mit Anspielen, Assistent „Film speichern“ als Vollbild-Sheet (nach TASK-WEB-034; design.md D10). Erledigt, wenn Komponententests je Dialog Schrittweite, Grenzen und unveränderte Gültigkeitsregeln in beiden Sprachen prüfen.

## 4. Gesten, Haptik, Leistung

- [x] TASK-WEB-044 Monitor-Gesten und Vollbild: `useGestures` (Pointer Events) für Wischen und Doppeltippen, Schaltfläche „Vollbild“, Fullscreen-API mit Overlay-Ersatz, ausblendende Steuerleiste (nach TASK-WEB-035; design.md D12). Erledigt, wenn Komponententests „Wischen zum nächsten Bild“, Doppeltippen und „Vollbild ohne Fullscreen-API“ abdecken.
- [x] TASK-WEB-045 Kachelgröße und Haptik: Zwei-Finger-Zoom und „Kleiner“/„Größer“ im Bildstreifen mit lokal gespeicherter Stufe; `haptics.ts` und Schalter „Vibration“ in „Optionen…“ (nur mit Vibrations-API), Texte in `de`/`en` (nach TASK-WEB-041, TASK-WEB-044; design.md D12, D13). Erledigt, wenn Komponententests die drei Zoomstufen, die Speicherung und „Vibration ausschalten“ mit und ohne `navigator.vibrate` prüfen.
- [x] TASK-WEB-046 Leistung am Handy: Zeichenpuffer begrenzt (Faktor 2, 1920 px), Pause und gestoppte Render-Schleife bei `visibilitychange`, `loading="lazy"`/`decoding="async"` für Kacheln, kein Pull-to-Refresh (nach TASK-WEB-035; design.md D14). Erledigt, wenn Vitest Puffergröße bei `devicePixelRatio` 1, 3 und sehr breitem Monitor sowie „Tab im Hintergrund“ prüft.

## 5. Abschluss

- [x] TASK-INFRA-014 Mobile E2E: Playwright-Projekte `iPhone 13`, `Pixel 7` und `iPad (gen 7)` mit Touch; Prüfungen auf horizontale Scrollleiste und Zielgröße ≥ 44 px im kompakten Modus; Ablauf Import → Hinzufügen → Übergang → Musik → Export per Tippen im Hoch- und Querformat; Desktop-Tests unverändert grün (nach allen Tasks aus 2–4; design.md D15). Erledigt, wenn `pixi run test-e2e` grün ist.
- [x] TASK-INFRA-015 Doku: README-Abschnitt „Am Handy und Tablet“ mit Screenshots (hoch, quer, Tablet), `docs/architecture.md` (Layout-Modi, Sheets, Auswahlmodell), Hinweise zu iOS (keine Vibration, Stummschalter), CHANGELOG „Unreleased“ (nach TASK-INFRA-014). Erledigt, wenn `pixi run check` grün ist und die Screenshots dem Stand entsprechen.
