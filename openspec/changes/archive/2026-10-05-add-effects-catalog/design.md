## Context

Stand: `develop` nach `add-transition-catalog` (archiviert gemeinsam mit den
übrigen Changes der WMM-2.x-Lückenanalyse). `add-mobile-layout`/
`add-mobile-delivery` laufen auf eigenen, unintegrierten Branches und sind
hier nicht Grundlage.

`Renderer.ts` (Vorschau) kompiliert „ein Programm pro Übergang“ (Prelude +
Shader + Epilog), jeweils mit zwei Eingabetexturen (`from`/`to`) und einem
Fortschritts-Uniform; `FrameRenderer` (Backend, `render/frames.py`) spiegelt
das mit einem eigenen `ctx.framebuffer` und denselben GLSL-Dateien — Vorschau
und Export rendern nachweislich dieselben Shader (siehe die bereits
vorhandene GL/EGL-Pipeline für Übergänge). Ein Effekt ist dieselbe Art
Shader-Programm, aber mit **einer** Eingabetextur statt zwei. `slideshow-project`
sieht bereits „einen deaktivierten Effekt-Platz“ pro Kachel vor — Singular,
also ein Effekt je Element, keine Liste.

`docs/research/movie-maker-reference.md` §3 listet rund 30 Original-Effekte
([V] verifiziert). Sie zerfallen in drei technisch verschiedene Gruppen:
zustandslose Bild-Effekte (eine Textur hinein, eine heraus), zeitabhängige
Effekte am Element-Rand (Fade/Ease — eine Rampe über die Zeit, kein
Pixel-Shader allein) und Geschwindigkeits-Effekte auf Videoclips (eine
Zeitabbildung, keine Pixel-Operation). Nur die erste Gruppe passt in diese
Change; die anderen beiden brauchen einen jeweils eigenen Mechanismus (siehe
proposal.md Nicht-Ziele).

Vorgaben des Product Owners (2026-10-03):

- Fünfte von neun geplanten Changes; baut nicht zwingend auf den anderen
  acht auf (unabhängig), nutzt aber dieselbe Render-Pipeline wie
  `add-timeline-editing` (Videoclips) und `add-transition-catalog`
  (Shader-Katalog-Muster).
- Scope auf die 21 zustandslosen Bild-Effekte begrenzt.

## Goals / Non-Goals

**Goals:** Ein neuer, zu `transitions.json` analoger Katalog mit 21
Bild-Effekten; jedes Bildstreifen-Element kann genau einen davon tragen,
sichtbar in Vorschau und Export identisch; der bestehende Übergangs-Pass
bleibt unverändert, Effekte laufen als zusätzlicher, vorgeschalteter
Rendering-Durchgang.

**Non-Goals:** siehe proposal.md.

## Decisions

### D1 – Effekt-Katalog
`packages/catalog/effects.json` (+ `effects.schema.json`), Einträge mit
`id`, zweisprachigem Namen, `shader`, festen `params` und `source`
(Movie-Maker-XML-GUID bzw. Hinweis auf Unsicherheit wie beim bestehenden
Übergangskatalog). Dieselbe Validierung beim Start wie bei
`transitions.json`. Die 21 Einträge: Sepia, Negative, Posterisieren,
Schwellenwert, Schwarzweiß, Helligkeit+, Helligkeit−, Unschärfe, Verpixeln
(als Effekt, eigener Eintrag von der gleichnamigen Übergangs-Form
unterschieden), Film-Alterung Alt/Älter/Am ältesten (`Age` 30/60/90),
Filmkörnung, Kohlestift, Federzeichnung, Aquarell, Spiegeln horizontal,
Spiegeln vertikal, Rotieren 90°, Rotieren 180°, Rotieren 270°.

Die Zahl 21 ist die Rechnung aus `docs/research/movie-maker-reference.md`
§3: 30 Effekte in der Original-XML minus die neun ausdrücklich
zurückgestellten zeitabhängigen (Hue Cycle, Fade In/Out von/zu
Schwarz/Weiß, Ease In/Out) und Geschwindigkeits-Effekte (Speed Up Double,
Slow Down Half). Die Aufzählung oben nennt genau 21 Einträge. Eine frühere
Fassung dieser Change schrieb an mehreren Stellen „22“, ohne einen 22.
Effekt zu nennen — ein Zählfehler aus der Planung, korrigiert in der
Triage-Sitzung vom 2026-10-05 (Discovery auf mmy-9p8); `effects.json`
wurde von Anfang an mit 21 Einträgen gebaut und getestet.

### D2 – Ein-Textur-Shader und zusätzlicher Rendering-Durchgang
Ein Effekt-Shader hat genau eine Eingabetextur und ein Fortschritts-loses
Ausgabebild (kein `progress`-Uniform, anders als Übergänge). Vorschau und
Export rendern ihn in eine Zwischentextur in Bildschirmgröße, **bevor** das
Ergebnis in den bestehenden Still- bzw. Übergangs-Durchgang geht: Hat ein
Element einen gesetzten Effekt, liefert dieser Durchgang die Eingabe für
`from`/`to` (oder den Still-Fall) statt der unveränderten Quelltextur. Ohne
gesetzten Effekt entfällt der Durchgang (keine Kopie). `Renderer.ts` bekommt
dafür ein zusätzliches Framebuffer-Objekt; `FrameRenderer` (Backend) eine
zweite `ctx.framebuffer`-Instanz für denselben Zweck — kein neues
Rendering-Konzept, derselbe Programm-Cache wie bei Übergängen.

### D3 – Datenmodell: Effekt-Platz aktiv
Jedes Bildstreifen-Element (Bild- oder Videoclip-Element, Spec
slideshow-project) bekommt ein optionales Feld `effectId` (Katalog-ID oder
`null`). Keine Parameter-Overrides pro Instanz — wie bei Übergängen kommen
alle Werte aus dem Katalog-Eintrag. Schema-Version 4 (nach Version 3 aus
`add-timeline-editing`); Migration von Version 3: jedes Element bekommt
`effectId: null`.

### D4 – Effekt-Platz und Sammlung in der Oberfläche
Der bereits vorgesehene, bisher deaktivierte Effekt-Platz auf jeder
Storyboard-Kachel wird aktiv: Ziehen eines Effekts aus der neuen Sammlung
„Videoeffekte“ auf den Platz setzt ihn; ein Kontextmenü-Eintrag „Keinen
Effekt“ entfernt ihn wieder; die Kachel zeigt ein kleines Symbol auf dem
Effekt-Platz, solange einer gesetzt ist. Die Sammlung „Videoeffekte“ zeigt
alle Katalogeinträge als Kacheln; ein Doppelklick demonstriert den Effekt am
selbst erzeugten Beispielbild (dieselbe Interaktion wie bei
„Videoübergänge“, aber mit einem Bild statt einer Überblendung zwischen
zweien).
