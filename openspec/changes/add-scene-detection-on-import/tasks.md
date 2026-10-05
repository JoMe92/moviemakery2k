Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man
sieht, dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Diese
Change ändert das Projektmodell nicht und hat deshalb keine
Reihenfolge-Abhängigkeit zu `add-canvas-format` oder zu
`add-time-ramp-effects`; die Begründung steht in design.md D10.

## 1. Datenmodell der Medien

- [ ] TASK-API-025 Video-Medium als Fenster auf eine Quelle, mit Zustand
  `sourceIn` und `status` (`detecting`, `ready`) auf `VideoItem`, die
  benutzte Quelle je Eintrag im Medien-Index, Übernahme bestehender Einträge
  als `sourceIn: 0` und `ready`, Ablehnung eines Projekts, das auf ein Medium
  im Zustand `detecting` verweist, `gen-api` (design.md D1, D2). Erledigt,
  wenn pytest die Übernahme eines bestehenden Index, die Ablehnung der
  Projektreferenz und ein Fenster mit `sourceIn > 0` abdeckt und der
  generierte TS-Typ beide Felder trägt.

## 2. Erkennung im Backend

- [ ] TASK-API-026 Erkennungsverfahren mit festen Grenzen und Stufen
  FFmpeg-Szenenfilter über die gespeicherte Datei, Ableitung der Grenzen
  (Rand von 1 s, Mindestabstand 1 s, höchstens 49 Grenzen nach Szenen-Wert,
  Gleichstand nach Zeitpunkt), Fenster aus den Grenzen und die vier
  Schwellenstufen (Aus, Wenige, Mittel, Viele) als reine, deterministische
  Funktion über den Fundstellen (nach TASK-API-025; design.md D4, D5, D6).
  Erledigt, wenn pytest aus aufgezeichneten Fundstellen dieselben Fenster
  zweimal reproduziert und die Fälle null Grenzen, eine Grenze, 400
  Fundstellen und eine Fundstelle in der ersten Sekunde abdeckt.
- [ ] TASK-API-027 Erkennungsauftrag und Upload-Antwort mit Platzhalter
  Der Upload nimmt die Schwellenstufe an und antwortet für Video sofort mit
  einem Medium im Zustand `detecting`, der Auftrag läuft nachgelagert mit
  Fortschritt und höchstens einem gleichzeitig in Importreihenfolge, das
  Ergebnis ersetzt den Platzhalter an seiner Stelle, ein Fehlschlag und ein
  Neustart führen zu genau einem Medium mit der ganzen Datei, „Aus“ erzeugt
  sofort ein Medium ohne Auftrag (nach TASK-API-026; design.md D3, D5, D6).
  Erledigt, wenn pytest Platzhalter, Ersetzen, Reihenfolge bei drei Dateien,
  Fehlschlag, Neustart und „Aus“ abdeckt.
- [ ] TASK-API-028 Posterbild je Fenster und Löschen bei geteilter Quelle
  Posterbild aus `sourceIn + 1 s` bzw. `sourceIn + duration / 2`, Löschen
  entfernt nur das Medium, die gespeicherte Quelldatei verschwindet mit dem
  letzten Verweis darauf, ein Medium im Zustand `detecting` ist löschbar
  (nach TASK-API-027; design.md D7, D8). Erledigt, wenn pytest je Szene ein
  eigenes Posterbild, das Überleben der Geschwister nach einer Löschung und
  das Verschwinden der Quelldatei nach der letzten Löschung prüft.

## 3. Render-Pfad

- [ ] TASK-RENDER-012 `sourceIn` in Vorschau und Export mitrechnen
  Die angezeigte Stelle eines Videoclips wird
  `sourceIn + trimIn + (Zeit − Segmentanfang)`, in der Vorschau beim Suchen
  im Video-Element und im Backend beim Start des Dekodierlaufs;
  `trimIn`/`trimOut` bleiben relativ zum Medium (nach TASK-API-025;
  design.md D8). Erledigt, wenn ein Golden Frame aus einem Medium mit
  `sourceIn > 0` aus Vorschau und Export innerhalb der Toleranz der Spec
  movie-export übereinstimmt und die bestehenden Video-Golden-Frames
  unverändert bestehen.

## 4. Oberfläche

- [ ] TASK-WEB-082 Platzhalter-Kachel und ihre Auflösung in Szenen
  Kachel mit Dateiname, Hinweis „Szenen werden erkannt…“ und Fortschritt,
  nicht ziehbar und ohne Doppelklick-Wirkung, Ablösung durch die erkannten
  Medien ohne Neuladen, AutoMovie überspringt Medien im Zustand `detecting`,
  Texte in `de` und `en` (nach TASK-API-027; design.md D3). Erledigt, wenn
  Komponententests Platzhalter, gesperrtes Ziehen, Ablösung, das Überspringen
  in AutoMovie und beide Sprachen abdecken.
- [ ] TASK-WEB-083 Gruppe „Szenenerkennung“ im Dialog „Optionen“
  Vier Werte (Aus, Wenige Szenen, Mittel, Viele Szenen) mit „Mittel“ als
  Standard, clientseitig gespeichert, mit jedem Upload mitgeschickt, Texte in
  `de` und `en`, und der Dialog zeigt beide Gruppen (nach TASK-API-027;
  design.md D6). Erledigt, wenn Komponententests Vorbelegung, Speichern über
  ein Neuladen, das mitgeschickte Feld, Tastaturbedienung und beide Sprachen
  abdecken.

## 5. Abschluss

- [ ] TASK-INFRA-032 E2E und Doku zur Szenenerkennung beim Import
  Ein E2E-Fixture-Video mit zwei bekannten harten Schnitten, Playwright
  importiert es, wartet auf die drei Kacheln, zieht zwei davon in den
  Bildstreifen, exportiert und prüft die Dauer sowie ein Frame aus der
  zweiten Szene; dazu ein Durchlauf mit der Einstellung „Aus“;
  `docs/architecture.md`, README-Abschnitt zur Szenenerkennung und CHANGELOG
  „Unreleased“ (nach allen anderen Tasks; design.md D4, D6). Erledigt, wenn
  `pixi run test-e2e` und `pixi run check` grün sind.
