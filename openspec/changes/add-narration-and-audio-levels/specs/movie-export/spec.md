## MODIFIED Requirements

### Requirement: Qualitätsprofile
Der Export MUST die Profile „Hohe Qualität“ (960×720) und „Kleine Datei“
(640×480) anbieten, beide im Seitenverhältnis 4:3 mit 30 Bildern pro Sekunde.
Die Datei MUST ein MP4 mit einer H.264-Videospur (yuv420p) und einer
AAC-Tonspur (48 kHz, Stereo) sein. Die Videospur MUST nach BT.709 umgerechnet
und als BT.709 (Matrix, Primärfarben, Übertragungsfunktion, begrenzter
Wertebereich) gekennzeichnet sein. Die Tonspur MUST die Musikspur (Spec
music-track) und die Erzählungsspur (Spec narration-track) sowie, soweit
vorhanden, den Ton der Videoclips enthalten, im Verhältnis des globalen
Pegels `clipAudioBalance`, aus den Originaldateien gemischt und so lang wie
die Videospur; ohne jede dieser Tonquellen MUST sie stumm sein. Der Schritt
„Qualität“ MUST für jedes Profil eine geschätzte Dateigröße anzeigen.

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
