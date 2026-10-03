## Context

Stand: `develop` nach `add-titles-and-credits` (archiviert gemeinsam mit
den übrigen Changes der WMM-2.x-Lückenanalyse). `add-mobile-layout`/
`add-mobile-delivery` laufen auf eigenen, unintegrierten Branches und sind
hier nicht Grundlage.

Eine Architektur-Beratung (2026-10-03) hat die Spannung zwischen
`add-timeline-editing`s D5 (Videoclip-Wiedergabe per Scrubbing, kein
eigener Takt) und hörbarem Clip-Ton aufgelöst: Die Musik-Audio-Engine
(`apps/web/src/audio/AudioEngine.ts`) dekodiert Audio per Web Audio API
und plant `AudioBufferSourceNode`-„Voices“ relativ zu `AudioContext.
currentTime`; `video.currentTime` (Bild-Scrubbing) und alle Tonquellen
leiten sich aus **derselben** Uhr ab, wenn Clip-Ton genau wie ein
Musiksegment eingeplant wird — nicht über `video.play()`/`video.muted =
false` (das würde D5 aufreißen: zweiter Takt, Drift-Risiko, explizit
verworfen). Das bestehende `MusicPlan`/`MusicSegment`-Modell
(`AudioEngine.ts`) und `music_schedule`/`music_filter_graph`
(`backend/src/mmy_backend/render/music.py`, `mixdown.py`) sind bereits
spur-agnostisch genug, um auf mehrere Spuren (Musik, Erzählung, Clip-Ton)
verallgemeinert zu werden.

Die Musikspur ist sequentiell (`music-track`-Spec: „lückenlos nacheinander
ab 0:00“, keine gespeicherte Startzeit). Erzählung braucht das Gegenteil:
eine gespeicherte, absolute Startzeit pro Clip, Überlappung erlaubt.
Movie Maker 2.x hatte für Clip-Ton/Musik-Balance einen **einzigen**,
globalen Regler (Clip → „Audio Levels…“), keine Lautstärke pro Videoclip —
das vereinfacht das Datenmodell erheblich gegenüber einer Pro-Clip-Lösung.

Vorgaben des Product Owners (2026-10-03):

- Siebte von neun geplanten Changes.
- Clip-Ton-Lautstärke bleibt ein einziger globaler Regler (kein Feld pro
  Videoclip) — entspricht dem Original und vereinfacht das Datenmodell.
- Überlappende Erzählungs-Clips sind erlaubt und werden gemischt (additiv),
  kein automatisches Ersetzen — konsistent mit dem bestehenden
  „Clips sind Objekte, die der Benutzer selbst verwaltet“-Muster (wie bei
  Bild-/Musik-Elementen), keine versteckte Auto-Löschung, die Arbeit
  verlieren könnte.

## Goals / Non-Goals

**Goals:** Erzählung lässt sich während der Wiedergabe aufnehmen und
erscheint als Clip mit absoluter Startzeit; Videoclip-Ton ist hörbar und
mit Musik/Erzählung über einen globalen Regler mischbar; Vorschau und
Export verwenden dieselbe Mischung; das bestehende Ein-Taktgeber-Prinzip
bleibt unverändert.

**Non-Goals:** siehe proposal.md.

## Decisions

### D1 – Clip-Ton über die Audio-Engine, nicht über `<video>`
Die Originaltonspur eines Videoclip-Elements wird genau wie ein
Musiksegment per Web Audio dekodiert (einmal pro referenziertem
Video-Medium, wie `preload()` in `AudioEngine.ts`) und als zusätzliche
Tonquelle relativ zu `AudioContext.currentTime` eingeplant;
`source_in`/`length` ergeben sich aus `trimIn`/`trimOut` und der
Platzierung in der Timeline, nicht aus einer eigenen Sequenzierung. Das
`<video>`-Element bleibt stumm und reines Bild-Scrubbing (D5 aus
`add-timeline-editing` unverändert) — es gibt weiterhin nur eine
Masteruhr. Ein Videoclip ohne Tonspur im Original liefert keine
Clip-Ton-Quelle.

### D2 – Erzählungsspur: absolute Startzeit statt Sequenz
`NarrationClip` (neu, analog `MusicClip`): `mediaId`, `at` (absolute
Startzeit in Sekunden auf der Filmzeitachse), `trimStart`/`trimEnd`
innerhalb der Aufnahme, Lautstärke 0–200 % (Standard 100 %), Einblenden/
Ausblenden (je 1 s, Standard aus) — dieselben Felder wie bei
`MusicClip`, aber `at` ist ein gespeichertes Feld statt aus der
Kettenreihenfolge berechnet. Clips MAY sich überlappen; überlappende
Abschnitte werden zusammen gemischt (`amix`, wie mehrere gleichzeitige
Segmente heute schon in `mixdown.py` zusammenlaufen). Höchstens 100 Clips
(wie bei Musik).

### D3 – Aufnahme
Ein Aufnahme-Knopf startet `MediaRecorder` auf einem `getUserMedia({audio:
true})`-Stream im selben Benutzergesten-Klick, der auch die Wiedergabe und
`AudioEngine.unlock()` auslöst. Startzeit der Aufnahme ist die aktuelle
Wiedergabeposition (`AudioEngine.clockTime()`), nicht ein separater
Zeitstempel. Nach dem Stoppen wird die Aufnahme (WebM/Opus) wie ein
normaler Audio-Import gespeichert (Spec media-library, kein neuer
Medientyp) und automatisch ein `NarrationClip` mit `at` = Startzeit,
`trimStart = 0`, `trimEnd` = volle Aufnahmedauer angelegt.

### D4 – Globaler Pegelregler
Ein einziges Projektfeld `clipAudioBalance` (0–100, Standard 50): bei 0
ist Clip-Ton stumm (Musik/Erzählung voll), bei 100 sind Musik und
Erzählung stumm (nur Clip-Ton), bei 50 beide auf vollem Pegel. Clip →
„Audio-Pegel…“ öffnet einen Y2K-Dialog mit einem einzigen Schieberegler
zwischen „Videoclip-Ton“ und „Musik und Erzählung“. Kein Feld pro
Videoclip.

### D5 – Export: zweistufige Mischung
`music_filter_graph` (`mixdown.py`) wird für eine beliebige Liste von
Audiosegmenten (`at`/`source_in`/`length`/Lautstärke/Fades) generisch
gemacht, unabhängig von der Spur. Drei Segmentlisten entstehen:
Musik (`music_schedule`, unverändert sequentiell), Erzählung
(`narration_schedule`, neu — übernimmt `at` direkt, keine Verkettung,
erlaubt Überlappung) und Clip-Ton (`video_clip_audio_schedule`, neu —
aus Timeline-Platzierung und `trimIn`/`trimOut` abgeleitet, nur für
Videoclip-Elemente mit Tonspur). Musik und Erzählung mischen zuerst zu
einem Zwischensignal; dieses und das Clip-Ton-Zwischensignal bekommen je
einen `volume`-Filter nach `clipAudioBalance`, bevor beide in einem
letzten `amix` zusammenlaufen — Vorschau und Export verwenden dieselbe
zweistufige Struktur.
