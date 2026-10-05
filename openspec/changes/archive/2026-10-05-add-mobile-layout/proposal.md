## Why

moviemakerY2K lässt sich heute nur am Desktop bedienen: Das Layout ist ein
starres Raster ab 1280×720, und die Bedienung setzt Maus voraus (Ziehen und
Ablegen, Doppelklick, Rechtsklick-Kontextmenüs, Ziele von 16–24 px). Auf einem
Handy ist die Anwendung zwar erreichbar (Vite/Backend im Heimnetz), aber nicht
nutzbar. Der Product Owner will die Anwendung **vollständig vom Handy aus**
bedienen können, im gewohnten Y2K-Look und mit dem typischen
Movie-Maker-Ablauf (1. Aufnehmen → 2. Film bearbeiten → 3. Film fertig
stellen), aber nach gängigen Mobile-Prinzipien optimiert.

Dieser Change ist der erste von zwei: Er macht die Oberfläche auf Handy und
Tablet bedienbar. Der zweite Change `add-mobile-delivery` liefert sie über das
Heimnetz aus (LAN-Modus mit HTTPS und Zugangstoken), macht sie installierbar
(PWA) und bietet den fertigen Film zum Teilen an.

## What Changes

- **Drei Layout-Modi nach Fensterbreite:** *kompakt* (unter 600 px, Handy),
  *mittel* (600–1279 px, Tablet und Handy quer) und *breit* (ab 1280 px,
  Desktop wie heute). Zusätzlich vergrößert ein grober Zeiger
  (`pointer: coarse`) in jedem Modus alle Bedienziele auf mindestens 44×44 px.
- **Kompaktes Layout „Taskleisten-Schritte“:** Luna-Titelleiste mit
  Menüschaltfläche, darunter der Vorschaumonitor (4:3) mit großer
  Wiedergabesteuerung, darunter Bildstreifen und Musikleiste, unten eine
  XP-Taskleiste mit den drei Movie-Maker-Schritten im Daumenbereich.
  Sammlungen, Übergänge, Eigenschaften und Dialoge öffnen sich als
  Y2K-Bottom-Sheets. Im Querformat steht der Monitor links, Bearbeitung rechts.
- **Mittleres Layout:** Monitor und Sammlung nebeneinander, Bildstreifen
  darunter, Taskleiste unten; Ziehen und Ablegen bleibt zusätzlich möglich.
- **Touch-Bedienung mit voller Funktionsgleichheit:** Jede Desktop-Funktion
  ist ohne Maus, Hover, Doppelklick und Rechtsklick erreichbar: Tippen wählt,
  langes Drücken öffnet Aktionen, „⋯“-Schaltflächen und eine Aktionsleiste für
  das gewählte Element; Bilder per Mehrfachauswahl „Hinzufügen“, Umsortieren
  per langem Drücken und Ziehen *oder* „Nach links/rechts“; Übergänge per
  Tippen auf den Slot; Musik vollständig (Hinzufügen, Kürzen, Lautstärke,
  Blenden, Umsortieren, Film an Musik anpassen).
- **Menü als „Startmenü“:** Die Menüleiste wird im kompakten Modus zu einem
  Sheet mit denselben Menüs und derselben Aktivierungslogik.
- **Touch-taugliche Dialoge:** Stepper und Schieberegler statt reiner
  Zahlenfelder, numerische Tastatur, Assistent „Film speichern“ als
  Vollbild.
- **Gesten und Haptik:** Wischen im Monitor (vorheriges/nächstes Bild),
  Doppeltippen für Vollbildvorschau, Zwei-Finger-Zoom der Kachelgröße im
  Bildstreifen, kurze Vibration bei langem Drücken und Ablegen (abschaltbar
  in „Optionen…“). Jede Geste hat eine Schaltflächen-Alternative.
- **Mobile Grundlagen:** Safe Areas (`viewport-fit=cover`), dynamische
  Viewport-Höhe, kein Zoom-Sprung bei Eingaben, kein Pull-to-Refresh beim
  Ziehen, Leistungsgrenzen für die WebGL-Vorschau.

## Capabilities

### New Capabilities

- `mobile-ui`: Layout-Modi, kompaktes und mittleres Layout, Taskleiste,
  Bottom-Sheets, Touch-Bedienung mit Funktionsgleichheit, Gesten, Haptik,
  Safe Areas und Leistungsgrenzen auf Mobilgeräten

### Modified Capabilities

- `app-shell`: Das Movie-Maker-Layout gilt für den breiten Modus; kleinere
  Fenster verweisen auf `mobile-ui`. Barrierefreiheit um Zielgröße und
  Gesten-Alternativen erweitert.

## Nicht-Ziele

- Auslieferung im Heimnetz, HTTPS, Zugangsschutz, PWA und Teilen des Films
  (Change `add-mobile-delivery`).
- Zeitachsen-Ansicht, Videoclips, Titel und Effekte (eigene Changes).
- Kamera-Aufnahme direkt aus der App (der Import nutzt die Dateiauswahl bzw.
  Fotomediathek des Geräts).
- HEIC/HEIF-Import: iOS wandelt bei einer expliziten MIME-Liste beim Auswählen
  nach JPEG um; eine eigene HEIC-Unterstützung im Backend gibt es nicht.
- Native Apps (iOS/Android), App-Store-Auslieferung.
- Änderungen am breiten Desktop-Layout außer den Touch-Zielgrößen bei grobem
  Zeiger.
- Ein eigenes Design-System neben dem Y2K-Theme; alle neuen Elemente nutzen die
  bestehenden Theme-Tokens.
