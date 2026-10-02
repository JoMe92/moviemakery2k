## MODIFIED Requirements

### Requirement: Qualitätsprofile
Der Export MUST die Profile „Hohe Qualität“ (960×720) und „Kleine Datei“
(640×480) anbieten, beide im Seitenverhältnis 4:3 mit 30 Bildern pro Sekunde.
Die Datei MUST ein MP4 mit einer H.264-Videospur (yuv420p) und einer
AAC-Tonspur (48 kHz, Stereo) sein. Die Videospur MUST nach BT.709 umgerechnet
und als BT.709 (Matrix, Primärfarben, Übertragungsfunktion, begrenzter
Wertebereich) gekennzeichnet sein. Die Tonspur MUST die Musikspur des
Projekts nach Spec music-track enthalten, aus den Originaldateien gemischt
und so lang wie die Videospur; ohne Musik MUST sie stumm sein. Der Schritt
„Qualität“ MUST für jedes Profil eine geschätzte Dateigröße anzeigen.

#### Scenario: Kleine Datei
- **WHEN** ein Benutzer ohne Musik das Profil „Kleine Datei (640×480)“ wählt
  und den Export abschließt
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
