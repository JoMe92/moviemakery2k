## Context

Stand: `develop` nach `add-automovie` (archiviert gemeinsam mit den
übrigen Changes der WMM-2.x-Lückenanalyse). `add-mobile-layout`/
`add-mobile-delivery` laufen auf eigenen, unintegrierten Branches und sind
hier nicht Grundlage.

Die bestehenden Profile (`backend/src/mmy_backend/render/encode.py`,
`ExportProfile`/`ProfileSpec`) unterscheiden sich nur in Breite und Höhe;
beide kodieren mit demselben festen `-crf 20` (kein eigener
Bitraten-Parameter). Ein drittes, kleineres Profil ist deshalb eine reine
Erweiterung derselben Tabelle, keine neue Kodierungslogik. Der Assistent
„Film speichern“ (`movie-export`-Spec) zeigt im Schritt „Qualität“ je
Profil bereits eine geschätzte Dateigröße — ein drittes Profil reiht sich
dort automatisch ein.

Vorgaben des Product Owners (2026-10-03):

- Neunte und letzte der neun geplanten WMM-2.x-Lücken-Changes.
- Nur ein zusätzliches Profil plus Empfehlungstext, keine
  benutzerdefinierten Auflösungen.

## Goals / Non-Goals

**Goals:** Ein drittes, kleineres Qualitätsprofil mit klarer
Nutzungsempfehlung steht im Assistenten zur Wahl; bestehende Profile und
ihre Tests bleiben unverändert.

**Non-Goals:** siehe proposal.md.

## Decisions

### D1 – Drittes Profil
`ExportProfile.EMAIL_WEB` (Anzeige „Für E-Mail/Web“), `ProfileSpec(width=320,
height=240, fps=30)`, dieselbe Kodierung (H.264 `yuv420p`, `-crf 20`,
AAC 48 kHz Stereo, BT.709) wie die bestehenden zwei Profile — keine neuen
Kodierungsparameter.

### D2 – Empfehlungstext
Jedes der drei Profile bekommt einen kurzen, übersetzten Empfehlungstext
(`de`/`en`), der im Schritt „Qualität“ unter der geschätzten Dateigröße
erscheint: „Hohe Qualität“ — zum Ansehen auf einem großen Bildschirm;
„Kleine Datei“ — zum Weitergeben, etwa per USB-Stick; „Für E-Mail/Web“ —
kleinste Datei, zum Versenden oder Hochladen. Die Reihenfolge der Profile
im Assistenten bleibt nach Größe (groß → klein).
