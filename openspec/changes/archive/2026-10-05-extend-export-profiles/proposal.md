## Why

Der Assistent „Film speichern“ bietet heute zwei Qualitätsprofile (Hohe
Qualität 960×720, Kleine Datei 640×480). Movie Maker 2.x bot dazu ein
eigenes Ziel „Per E-Mail senden“ mit einer deutlich kleineren, für den
Versand gedachten Datei — diese Lücke bleibt relevant, auch wenn die
übrigen Original-Ziele (DV-Kamera, CD, Web-Hosting-Assistent) für eine
Browser-Anwendung ohne Bedeutung sind: Herunterladen ist hier der einzige
Weg, und „für E-Mail/Web“ ist dabei nur ein weiteres Qualitätsprofil, kein
eigener Vertriebsweg. Die Feature-Lückenanalyse (Orchestrator,
2026-10-03) hat das als „teilweise“ vorhanden markiert und eine geführte
dritte Option vorgeschlagen.

## What Changes

- **Drittes Qualitätsprofil „Für E-Mail/Web“** (320×240, dieselbe
  Kodierung wie die bestehenden Profile, nur kleinere Auflösung): die
  kleinste der drei Dateien, gedacht für den Versand per E-Mail oder das
  Hochladen auf eine Webseite.
- **Kurze Empfehlung je Profil** im Schritt „Qualität“ des Assistenten
  (z. B. „Hohe Qualität — zum Ansehen auf einem großen Bildschirm“, „Kleine
  Datei — zum Weitergeben, etwa per USB-Stick“, „Für E-Mail/Web — kleinste
  Datei, zum Versenden oder Hochladen“), damit die Wahl geführt statt
  bloß nach Pixelzahl erfolgt.

## Capabilities

### Modified Capabilities

- `movie-export`: drittes Qualitätsprofil, Empfehlungstext je Profil im
  Assistenten

## Nicht-Ziele

- Export auf eine DV-Kamera, CD oder über einen eigenen Web-Hosting-
  Assistenten — ohne Bedeutung für eine Browser-Anwendung; Herunterladen
  bleibt der einzige Weg.
- Ein direkter E-Mail- oder Upload-Versand aus der Anwendung heraus — nur
  die Datei wird kleiner und passender benannt/beschrieben, der Versand
  bleibt Sache des Benutzers.
- Einstellbare, benutzerdefinierte Auflösungen oder Bitraten — weiterhin
  feste, benannte Profile wie bisher.
- Änderungen an der Kodierung (Codec, Farbraum, Bildrate) der bestehenden
  zwei Profile.
