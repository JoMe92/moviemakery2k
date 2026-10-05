# movie-export Specification

## Purpose
Den Film als MP4-Datei exportieren: Assistent „Film speichern“, Qualitätsprofile, Fortschritt und Abbrechen, Export-Jobs im Backend und die Treue des Exports zur Vorschau.

## Requirements

### Requirement: Assistent „Film speichern“
Die Anwendung MUST einen modalen Assistenten im Y2K-Dialogstil mit den
Schritten „Dateiname“, „Qualität“, „Film wird gespeichert“ und „Fertig“
anbieten. Er MUST die Schaltflächen „Zurück“, „Weiter“ und „Abbrechen“ haben
und sich vollständig per Tastatur bedienen lassen. Der Dateiname MUST mit
„Mein Film“ vorbelegt sein, MUST die Zeichen `/ \ : * ? " < > |` ablehnen und
MUST beim Herunterladen die Endung `.mp4` tragen. Im Schritt „Fertig“ MUST
neben „Herunterladen“ die Schaltfläche „Teilen…“ erscheinen, wenn der Kontext
sicher ist, das Gerät das Teilen von Dateien unterstützt und die Datei
höchstens 200 MB groß ist. „Teilen…“ MUST bis zum vollständigen Laden der
Datei deaktiviert sein und dann den Teilen-Dialog des Geräts mit der Datei
`<Dateiname>.mp4` öffnen. Bricht der Benutzer das Teilen ab, MUST das ohne
Fehlermeldung bleiben; „Herunterladen“ MUST immer verfügbar bleiben.

#### Scenario: Film mit Standardwerten speichern
- **WHEN** ein Benutzer mit mindestens einem Bild im Bildstreifen den
  Assistenten öffnet und auf jedem Schritt „Weiter“ wählt
- **THEN** startet der Export mit dem Profil „Hohe Qualität (960×720)“, und
  nach Abschluss bietet der Schritt „Fertig“ die Datei „Mein Film.mp4“ zum
  Herunterladen an

#### Scenario: Ungültiger Dateiname
- **WHEN** ein Benutzer „Urlaub/2003“ als Dateinamen eingibt
- **THEN** ist „Weiter“ deaktiviert, und der Assistent nennt die unerlaubten
  Zeichen

#### Scenario: Assistent vor dem Start abbrechen
- **WHEN** ein Benutzer im Schritt „Qualität“ „Abbrechen“ wählt
- **THEN** schließt sich der Assistent, und es wird kein Export gestartet

#### Scenario: Film am Handy teilen
- **WHEN** ein Export von 40 MB über HTTPS auf einem Handy mit Web Share API
  fertig ist und der Benutzer nach dem Laden „Teilen…“ wählt
- **THEN** öffnet sich der Teilen-Dialog des Geräts mit der Datei
  „Mein Film.mp4“

#### Scenario: Teilen nicht verfügbar
- **WHEN** der Export über HTTP oder in einem Browser ohne Teilen von Dateien
  fertig ist
- **THEN** zeigt der Schritt „Fertig“ nur „Herunterladen“

#### Scenario: Datei zu groß zum Teilen
- **WHEN** ein fertiger Export größer als 200 MB ist
- **THEN** zeigt der Schritt „Fertig“ nur „Herunterladen“

### Requirement: Qualitätsprofile
Der Export MUST die Profile „Hohe Qualität“ (960×720), „Kleine Datei“
(640×480) und „Für E-Mail/Web“ (320×240) anbieten, alle im
Seitenverhältnis 4:3 mit 30 Bildern pro Sekunde. Die Datei MUST ein MP4
mit einer H.264-Videospur (yuv420p) und einer AAC-Tonspur (48 kHz,
Stereo) sein. Die Videospur MUST nach BT.709 umgerechnet und als BT.709
(Matrix, Primärfarben, Übertragungsfunktion, begrenzter Wertebereich)
gekennzeichnet sein. Die Tonspur MUST die Musikspur (Spec music-track) und
die Erzählungsspur (Spec narration-track) sowie, soweit vorhanden, den Ton
der Videoclips enthalten, im Verhältnis des globalen Pegels
`clipAudioBalance`, aus den Originaldateien gemischt und so lang wie die
Videospur; ohne jede dieser Tonquellen MUST sie stumm sein. Der Schritt
„Qualität“ MUST für jedes Profil, in der Reihenfolge groß zu klein, eine
geschätzte Dateigröße und einen kurzen Empfehlungstext anzeigen: „Hohe
Qualität“ — zum Ansehen auf einem großen Bildschirm; „Kleine Datei“ — zum
Weitergeben, etwa per USB-Stick; „Für E-Mail/Web“ — kleinste Datei, zum
Versenden oder Hochladen.

#### Scenario: Kleine Datei
- **WHEN** ein Benutzer ohne Musik, Erzählung oder Videoclip-Ton das Profil
  „Kleine Datei (640×480)“ wählt und den Export abschließt
- **THEN** hat die Datei eine H.264-Videospur mit 640×480 Pixeln und 30 fps
  sowie eine stumme AAC-Tonspur

#### Scenario: Film mit Musik
- **WHEN** ein Projekt mit 12,5 s Film und einem 30-s-Musikstück exportiert
  wird
- **THEN** enthält die Datei eine hörbare AAC-Tonspur von 12,5 s Länge, deren
  letzte Sekunde ausgeblendet ist

#### Scenario: Musik lässt sich nicht mischen
- **WHEN** das Mischen der Musik im Backend fehlschlägt
- **THEN** endet der Export mit Status `failed` und dem Code
  `export.audioFailed`, und es bleibt keine Teildatei zurück

#### Scenario: Farbraum gekennzeichnet
- **WHEN** ein exportierter Film mit ffprobe untersucht wird
- **THEN** meldet die Videospur `color_space`, `color_primaries` und
  `color_transfer` als `bt709` und `color_range` als `tv`, und ein reines Rot
  aus der Vorschau ist im dekodierten Film innerhalb der Toleranz rot

#### Scenario: Für E-Mail/Web exportieren
- **WHEN** ein Benutzer das Profil „Für E-Mail/Web (320×240)“ wählt und
  den Export abschließt
- **THEN** hat die Datei eine H.264-Videospur mit 320×240 Pixeln und
  30 fps, kleiner als bei den beiden anderen Profilen bei gleichem Projekt

#### Scenario: Empfehlungstext je Profil
- **WHEN** ein Benutzer den Schritt „Qualität“ öffnet
- **THEN** zeigt jedes der drei Profile neben der geschätzten Dateigröße
  seinen Empfehlungstext in der gewählten Sprache

#### Scenario: Clip-Ton und Erzählung im Export
- **WHEN** ein Projekt mit einem Videoclip mit Tonspur, einem
  Erzählungs-Clip und `clipAudioBalance` 50 exportiert wird
- **THEN** enthält die Tonspur der Datei beide Quellen gemischt, hörbar
  etwa gleich laut

#### Scenario: Reiner Clip-Ton
- **WHEN** `clipAudioBalance` auf 100 steht und das Projekt Musik, aber
  keine Videoclips mit Tonspur enthält
- **THEN** ist die Tonspur der exportierten Datei stumm (Musik ist bei
  diesem Pegel nicht hörbar, und es gibt keinen Clip-Ton)

### Requirement: Export entspricht der Vorschau
Der Export MUST dasselbe Zeitmodell wie die Vorschau verwenden (Spec
preview-player, „Zeitmodell der Diashow“) und die Übergänge mit denselben
Shader-Dateien und Katalogparametern rendern. Die Dauer des Films MUST der
Gesamtdauer der Vorschau auf ein Bild (1/30 s) genau entsprechen. Bilder MUST
wie im Monitor eingepasst und mit schwarzen Balken ergänzt werden. Ein Bild
mitten in einem Übergang MUST dem Bild der Vorschau beim selben Fortschritt
entsprechen: Abweichung je Farbkanal höchstens 2 bei mindestens 99,5 % der
Pixel.

#### Scenario: Dauer des Films
- **WHEN** ein Projekt mit drei Bildern zu je 5 s und zwei Übergängen zu je
  1,25 s exportiert wird
- **THEN** ist der Film 12,50 s lang, mit einer Abweichung von höchstens einem
  Bild

#### Scenario: Hochkant-Bild
- **WHEN** ein Hochkant-Foto exportiert wird
- **THEN** ist es vollständig sichtbar und links und rechts mit schwarzen
  Balken ergänzt, wie im Vorschaumonitor

#### Scenario: Übergang wie in der Vorschau
- **WHEN** für einen der sechs Übergänge das Bild bei Fortschritt 0,5 aus der
  Vorschau und aus dem Export verglichen wird
- **THEN** liegen die Abweichungen innerhalb der Toleranz

### Requirement: Fortschritt und Abbrechen
Während des Exports MUST der Assistent den Fortschritt in Prozent und eine
geschätzte Restzeit zeigen. Der Benutzer MUST den Export nach einer Rückfrage
abbrechen können; danach MUST keine Teildatei zurückbleiben. Schlägt der
Export fehl, MUST der Assistent eine verständliche Meldung im Y2K-Dialogstil
zeigen und einen erneuten Versuch anbieten.

#### Scenario: Export abbrechen
- **WHEN** ein Benutzer während des Exports „Abbrechen“ wählt und die
  Rückfrage bestätigt
- **THEN** endet der Export, der Assistent schließt sich, und auf dem Server
  liegt keine Teildatei dieses Exports

#### Scenario: Export schlägt fehl
- **WHEN** das Rendern im Backend fehlschlägt
- **THEN** zeigt der Assistent eine Fehlermeldung mit „Erneut versuchen“, und
  die Anwendung bleibt bedienbar

### Requirement: Schnappschuss und ein Export zur Zeit
Ein Export MUST den Stand des gespeicherten Projekts zum Startzeitpunkt
verwenden; spätere Änderungen am Bildstreifen MUST den laufenden Export nicht
beeinflussen. Es MUST höchstens ein Export gleichzeitig laufen. Der Start eines
leeren Projekts MUST abgelehnt werden.

#### Scenario: Bearbeiten während des Exports
- **WHEN** ein Benutzer während eines laufenden Exports ein Bild aus dem
  Bildstreifen entfernt
- **THEN** enthält der fertige Film das Bild weiterhin, und die Änderung ist
  im Projekt gespeichert

#### Scenario: Zweiter Export
- **WHEN** ein zweiter Export gestartet wird, während einer läuft
- **THEN** wird der zweite abgelehnt, und der erste läuft unverändert weiter

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
