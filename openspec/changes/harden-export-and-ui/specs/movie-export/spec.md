## MODIFIED Requirements

### Requirement: Qualitätsprofile
Der Export MUST die Profile „Hohe Qualität“ (960×720) und „Kleine Datei“
(640×480) anbieten, beide im Seitenverhältnis 4:3 mit 30 Bildern pro Sekunde.
Die Datei MUST ein MP4 mit einer H.264-Videospur (yuv420p) und einer
AAC-Tonspur (48 kHz, Stereo) sein. Die Videospur MUST nach BT.709 umgerechnet
und als BT.709 (Matrix, Primärfarben, Übertragungsfunktion, begrenzter
Wertebereich) gekennzeichnet sein. Solange das Projekt keinen Ton hat, MUST die
Tonspur stumm sein. Der Schritt „Qualität“ MUST für jedes Profil eine
geschätzte Dateigröße anzeigen.

#### Scenario: Kleine Datei
- **WHEN** ein Benutzer das Profil „Kleine Datei (640×480)“ wählt und den
  Export abschließt
- **THEN** hat die Datei eine H.264-Videospur mit 640×480 Pixeln und 30 fps
  sowie eine stumme AAC-Tonspur

#### Scenario: Farbraum gekennzeichnet
- **WHEN** ein exportierter Film mit ffprobe untersucht wird
- **THEN** meldet die Videospur `color_space`, `color_primaries` und
  `color_transfer` als `bt709` und `color_range` als `tv`, und ein reines Rot
  aus der Vorschau ist im dekodierten Film innerhalb der Toleranz rot

### Requirement: Export-Schnittstelle im Backend
Das Backend MUST Export-Jobs anbieten: Starten mit Profil und Dateiname,
Abfragen von Status (`queued`, `running`, `done`, `failed`, `cancelled`) und
Fortschritt, Herunterladen des Ergebnisses und Abbrechen bzw. Löschen. Fertige
Dateien MUST atomar erscheinen (keine halb geschriebene Datei unter dem
endgültigen Namen). Das Backend MUST höchstens die letzten 5 fertigen Exporte
aufbewahren; ein Export MUST erst dann als `done` sichtbar werden, wenn die
Aufbewahrung bereits angewendet ist. Fertige Exporte MUST einen Neustart des
Backends überstehen; beim Start MUST das Backend Teildateien und Reste
unvollständiger Exporte entfernen. Die Schnittstelle MUST Teil des
OpenAPI-Vertrags sein.

#### Scenario: Herunterladen vor dem Ende
- **WHEN** die Datei eines Exports abgerufen wird, der noch läuft
- **THEN** antwortet das Backend mit einem Fehler, der den Status nennt, und
  liefert keine unvollständige Datei

#### Scenario: Aufbewahrung
- **WHEN** ein sechster Export fertig wird
- **THEN** wird der älteste fertige Export gelöscht, und zu keinem Zeitpunkt
  liefert die Liste mehr als 5 fertige Exporte

#### Scenario: Neustart
- **WHEN** das Backend nach einem fertigen und einem abgebrochenen laufenden
  Export neu startet
- **THEN** ist der fertige Export weiter abrufbar und herunterladbar, und vom
  laufenden Export bleiben weder Job noch Teildatei übrig

### Requirement: Plattformunterstützung des Exports
Der Export MUST unter Linux (x86_64 und aarch64) ohne Grafikkarte über
Software-Rendering funktionieren, in CI und im Docker-Image. Die
Entwicklungsumgebung MUST beide Linux-Architekturen als Pixi-Plattform führen.
Unter macOS und Windows ist er nicht zugesichert; kann dort kein GL-Kontext
erzeugt werden, MUST der Assistent eine verständliche Meldung statt eines
Absturzes zeigen.

#### Scenario: Export in CI
- **WHEN** die CI auf ubuntu-latest ohne GPU die Export-Tests ausführt
- **THEN** laufen Rendern und Kodieren erfolgreich durch

#### Scenario: Export auf ARM
- **WHEN** die Render-Umgebung auf Linux aarch64 (ARM-Runner oder Raspberry Pi)
  geprüft und ein Film exportiert wird
- **THEN** meldet `pixi run check-render-env` llvmpipe und beide Encoder, und
  der Film entsteht wie unter x86_64

#### Scenario: Kein GL-Kontext
- **WHEN** das Backend keinen GL-Kontext erzeugen kann
- **THEN** endet der Export mit Status `failed` und der Meldung, dass der
  Export auf diesem System nicht verfügbar ist
