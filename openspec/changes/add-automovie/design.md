## Context

Stand: `develop` nach `add-narration-and-audio-levels` (archiviert
gemeinsam mit den übrigen Changes der WMM-2.x-Lückenanalyse).
`add-mobile-layout`/`add-mobile-delivery` laufen auf eigenen,
unintegrierten Branches und sind hier nicht Grundlage.

Diese Change führt keine neue Render-Technik ein: Sie ruft ausschließlich
bereits geplante bzw. bestehende Mechanismen auf — den Übergangskatalog
(`add-transition-catalog`), den Effekt-Katalog (`add-effects-catalog`),
den Titel-Katalog (`add-titles-and-credits`) und `apps/web/src/timeline/
fitToMusic.ts` („Film an Musik anpassen“, bereits implementiert). Dadurch
ist AutoMovie rein kombinatorisch und braucht keine eigene
Architektur-Beratung. `fitToMusic` passt ausschließlich die Dauer von
Bild-Elementen an (Videoclip-Dauer folgt aus `trimIn`/`trimOut`,
Titel-Dauer ist fest) — das ist durch das Slide-Datenmodell aus
`add-timeline-editing` bereits vorgegeben, keine neue Einschränkung dieser
Change.

Extras → „AutoMovie…“ ist laut `app-shell`-Spec („Menüs mit funktionalem
Kern“) heute ein sichtbarer, aber deaktivierter Menüeintrag.

Vorgaben des Product Owners (2026-10-03):

- Achte von neun geplanten Changes.
- MVP von drei Stilen (Klassisch, Alter Film, Musikvideo) statt der
  vollständigen Original-Stil-Bibliothek.

## Goals / Non-Goals

**Goals:** Aus der Mediensammlung lässt sich mit einem Klick ein
vollständiges, normal weiterbearbeitbares Projekt in einem von drei
Stilen erzeugen, inklusive Übergängen, ggf. einem Effekt, Start-/
Endtitel und — bei vorhandener Musik — an die Musiklänge angepasst.

**Non-Goals:** siehe proposal.md.

## Decisions

### D1 – AutoMovie-Katalog
`packages/catalog/automovie.json` (neu, analog den anderen Katalogen): 3
Einträge, jeder mit `id`, zweisprachigem Namen, Kurzbeschreibung,
`transitionId` (Katalog-ID aus `transitions`), `effectId` (Katalog-ID aus
`video-effects` oder `null`), `titleStyleId` (Katalog-ID aus
`titles-and-credits`), `requiresMusic` (bool). Einträge: `classic`
(Übergang `fade`, kein Effekt, Titel-Stil `basic-title`,
`requiresMusic: false`), `old-movie` (Übergang `dissolve`, Effekt
„Film-Alterung Älter“, Titel-Stil `basic-title`, `requiresMusic: false`),
`music-video` (Übergang `circle`, kein Effekt, Titel-Stil `zoom-in`,
`requiresMusic: true`).

### D2 – Algorithmus
1. Alle Bild- und Videoclip-Medien aus der Mediensammlung in
   Importreihenfolge (Audio und bereits vorhandene Titel-Elemente bleiben
   außen vor).
2. Für jedes Element außer dem ersten: eingehender Übergang =
   `transitionId` des gewählten Stils, mit seiner Katalog-Standarddauer.
3. Für jedes Bild- und Videoclip-Element: `effectId` des gewählten Stils
   (falls gesetzt).
4. Ein Titel-Element mit dem eingegebenen Filmtitel, Stil `titleStyleId`,
   am Anfang; ein Titel-Element mit „Ende“ (`de`) bzw. „The End“ (`en`),
   derselbe Stil, am Schluss. Ist das Filmtitel-Feld leer oder enthält es
   nur Leerzeichen, entfällt der Titel am Anfang ganz — der Film beginnt
   dann mit dem ersten Bild, das folglich auch keinen eingehenden Übergang
   trägt. Der Titel am Schluss hat einen eigenen Text und wird immer
   eingefügt. Die Alternative wäre ein stilles, leeres Titel-Element von
   fünf Sekunden am Anfang jedes AutoMovie, dessen Benutzer das Feld
   übersprungen hat: sichtbar fehlerhaft statt bloß unbestimmt. Der Dialog
   verlangt den Filmtitel deshalb auch nicht („Erstellen“ hängt allein am
   Stil). Entschieden in der Umsetzung (mmy-0pz) und hier nachgetragen,
   weil weder dieser Schritt noch die Spec den leeren Fall nannte.
5. Hat das Projekt eine Musikspur, wird `fitToMusic` (unverändert) auf das
   Ergebnis angewendet; bei `requiresMusic: true` ohne Musikspur ist der
   Stil im Dialog nicht wählbar.
Das Ergebnis ist ein gewöhnliches Projekt (keine Markierung „von AutoMovie
erzeugt“); es ersetzt den bisherigen Bildstreifen vollständig.

### D3 – Dialog und Ersetzen
Der AutoMovie-Dialog (Y2K-Stil) fragt zuerst den Filmtitel ab, dann den
Stil (Kacheln mit Kurzbeschreibung, Stile mit `requiresMusic: true` ohne
Musikspur deaktiviert), dann „Erstellen“. Ist der Bildstreifen nicht leer,
MUST vor dem Ersetzen eine Rückfrage erscheinen (dasselbe Muster wie
Datei → „Neues Projekt“); die Mediensammlung selbst bleibt in jedem Fall
unverändert.
