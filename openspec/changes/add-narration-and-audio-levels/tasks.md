Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man
sieht, dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei. Diese
Change ist die siebte von neun geplanten WMM-2.x-Lücken-Changes.

## 1. Datenmodell

- [x] TASK-API-021 Projektmodell Version 6: `narration: list[NarrationClip]`
  (`mediaId`, `at`, `trimStart`/`trimEnd`, Lautstärke, Fades), Feld
  `clipAudioBalance` (0–100, Standard 50), Validierung (Überlappung
  erlaubt, Grenzen, höchstens 100 Clips), Migration von Version 5,
  `gen-api` (design.md D2, D4). Erledigt, wenn pytest Anlegen, Verschieben
  und überlappende Erzählungs-Clips, die Ablehnung eines ungültigen
  `clipAudioBalance`-Werts und die Migration abdeckt.

## 2. Export-Mischung

- [ ] TASK-RENDER-009 Export-Mischung erweitert: `narration_schedule`
  (`at` direkt übernommen, keine Verkettung, Überlappung erlaubt),
  `video_clip_audio_schedule` (aus Timeline-Platzierung und
  `trimIn`/`trimOut` abgeleitet), `music_filter_graph` generisch für eine
  beliebige Segmentliste, zweistufige Mischung (Musik+Erzählung vs.
  Clip-Ton nach `clipAudioBalance`, dann `amix`) (nach TASK-API-021;
  design.md D5). Erledigt, wenn pytest Musik+Erzählung gemischt,
  Clip-Ton bei verschiedenen `clipAudioBalance`-Werten, überlappende
  Erzählung und ein Videoclip ohne Tonspur (keine Clip-Ton-Quelle)
  abdeckt, und die bestehenden Musik-Export-Tests unverändert grün
  bleiben.

## 3. Vorschau

- [x] TASK-WEB-067 Audio-Engine für mehrere Spuren: `MusicPlan` zu einem
  spur-unabhängigen `AudioPlan` verallgemeinert, Clip-Ton als zusätzliche,
  aus `trimIn`/`trimOut` und Platzierung abgeleitete Tonquelle (D1, nicht
  über `<video>`), globaler Pegelregler-Dialog „Audio-Pegel…“ im
  Clip-Menü (nach TASK-API-021; design.md D1, D4). Erledigt, wenn
  Komponententests Clip-Ton-Wiedergabe ohne zweiten Takt (Bild-Scrubbing
  unverändert über `video.currentTime`), den Pegelregler bei 0/50/100 und
  Pause/Suchen mit Clip-Ton abdecken.
- [ ] TASK-WEB-068 Erzählungsleiste und Aufnahme: Aufnahme-Knopf
  (`getUserMedia`/`MediaRecorder`, Start im selben Benutzergesten-Klick
  wie die Wiedergabe), automatisches Anlegen eines `NarrationClip` nach
  dem Stoppen, Erzählungsleiste unter der Musikleiste mit Verschieben,
  Kürzen, Lautstärke, Blenden und Entfernen (nach TASK-WEB-067; design.md
  D2, D3). Erledigt, wenn Komponententests eine erfolgreiche Aufnahme,
  verweigerten Mikrofonzugriff, Verschieben eines Clips und überlappende
  Clips in der Leiste abdecken.

## 4. Abschluss

- [ ] TASK-INFRA-024 E2E und Doku: Playwright-Smoke erweitert um Erzählung
  aufnehmen (mit simuliertem Mikrofon-Stream) → Export enthält sie an der
  richtigen Stelle; Pegelregler verändert das Mischverhältnis im Export
  messbar; README/CHANGELOG „Unreleased“ (nach TASK-WEB-068,
  TASK-RENDER-009). Erledigt, wenn `pixi run test-e2e` grün ist.
