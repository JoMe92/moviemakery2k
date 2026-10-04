## Why

Zwei kleine Lücken in der Bedienung der App-Hülle, die der Product Owner am
2026-10-04 gemeldet hat (Bead mmy-0v0).

**Erstens** gibt es keine Möglichkeit, den Sammlungsbereich loszuwerden.
Die Symbolleiste hat heute nur die Sammlungsauswahl
(`apps/web/src/shell/Toolbar.tsx`), und der Sammlungsbereich steht im breiten
wie im mittleren Layout fest in der Mitte der Arbeitsfläche
(`.workspace` in `apps/web/src/shell/AppWindow.module.css`). Wer am
Bildstreifen oder am Monitor arbeitet, kann den Platz nicht umwidmen. Der
Product Owner: „In der Leiste braucht es unbedingt einen Sammlungs-Button.“

**Zweitens** bleibt das Hinzufügen aus der Sammlung stumm. Im kompakten
Layout wählt man im Sammlungs-Sheet mehrere Bilder und tippt auf „Zum
Bildstreifen hinzufügen (n)“; das Sheet schließt sich, und sonst passiert
sichtbar nichts (`apps/web/src/media/CollectionSheet.tsx`). Liegt der
Bildstreifen hinter dem Sheet weit gescrollt, sieht man die neuen Bilder
nicht. Der Product Owner: „kann ich kein haptisches Feedback, ob das wirklich
passiert ist oder nicht. Ich weiss als Nutzer nicht, ob sie jetzt hinzugefügt
wurden.“ Am Desktop ist es dasselbe: Doppelklick und „Zum Storyboard
hinzufügen“ im Kontextmenü der Sammlung melden nichts zurück.

Beides gehört in eine Change, weil beides dieselbe Stelle betrifft — die
Hülle und ihre Rückmeldekanäle — und beides ohne Datenmodell, Backend oder
Shader auskommt.

## What Changes

- **Schaltfläche „Sammlungen“ in der Symbolleiste:** eine einzelne
  Umschaltfläche, die den Sammlungsbereich **ein- und ausblendet**. Der
  Aufgabenbereich links bleibt dabei unverändert stehen; der frei werdende
  Platz geht an den Vorschaumonitor. Sie gilt im breiten und im mittleren
  Layout — das kompakte Layout hat keine Symbolleiste und bleibt, wie es ist.
- **Jede Aktion, die auf die Sammlung zielt, blendet sie wieder ein:** die
  Sammlungsauswahl der Symbolleiste, „Sammlungen anzeigen“, „Videoübergänge
  anzeigen“ und der Import. Nichts kann mit ausgeblendetem Bereich ins Leere
  laufen.
- **Der Zustand wird nicht gemerkt.** Nach jedem Neuladen ist der
  Sammlungsbereich sichtbar; das Versprechen der Anforderung
  Movie-Maker-Layout, beim Start alle Bereiche gleichzeitig zu sehen, bleibt
  damit wörtlich gültig (design.md D3).
- **Kurzhinweis als gemeinsamer Rückmeldekanal:** Der heutige Hinweisstreifen
  der kompakten und mittleren Layouts (`StatusNotices`) wird um einen
  Kanal für ausdrückliche Aktionsmeldungen erweitert und auch im breiten
  Layout sichtbar gemacht — dort als vorübergehende Angabe in der
  Statusleiste statt als eingeblendeter Streifen (design.md D4). Eine
  Aktionsmeldung hat Vorrang vor den Zustandsmeldungen „Gespeichert“ und
  Backend-Wechsel, damit das automatische Speichern die Bestätigung nicht
  nach einem Sekundenbruchteil überschreibt.
- **Bestätigung beim Hinzufügen aus der Sammlung:** Wer Bilder oder
  Musikstücke aus der Sammlung hinzufügt — über die Schaltfläche des
  Sammlungs-Sheets, per Doppelklick oder über das Kontextmenü —, bekommt
  einen Kurzhinweis mit der Anzahl („3 Bilder hinzugefügt“), und die neu
  hinzugefügten Elemente werden im Bildstreifen bzw. in der Musikleiste
  sichtbar gescrollt.
- **Haptik als Zugabe, nicht als Ersatz:** Unterstützt das Gerät Vibration
  und ist der Schalter „Vibration“ an, vibriert es beim Hinzufügen kurz mit
  dem vorhandenen Muster für „abgelegt“. Ohne Vibration bleibt der
  Kurzhinweis die vollständige Rückmeldung.

## Capabilities

### Modified Capabilities

- `app-shell`: Umschaltfläche „Sammlungen“ in der Symbolleiste und der
  ausblendbare Sammlungsbereich in der Anforderung Movie-Maker-Layout; neue
  Anforderung für den Kurzhinweis und die Bestätigung beim Hinzufügen aus der
  Sammlung
- `mobile-ui`: Bestätigung nach „Zum Bildstreifen hinzufügen (n)“ bzw. „Zur
  Musikleiste hinzufügen (n)“ im Sammlungs-Sheet; das Hinzufügen kommt zu den
  Anlässen für eine kurze Vibration dazu

## Nicht-Ziele

Vom Product Owner ausdrücklich ausgeschlossen (2026-10-04):

- **Das Movie-Maker-2.x-Verhalten mit zwei Schaltflächen** („Aufgaben“ und
  „Sammlungen“), die den linken Bereich gegeneinander austauschen. Der
  Product Owner hat auf Nachfrage die einzelne Umschaltfläche gewählt.
- **Ein bloßer Fokussprung** in den Sammlungsbereich ohne Ein- und
  Ausblenden.

Weitere Nicht-Ziele dieser Change:

- **Andere Bereiche ausblenden.** Aufgabenbereich, Vorschaumonitor,
  Bildstreifen, Musikleiste und Statusleiste bleiben, wie sie sind; nur der
  Sammlungsbereich lässt sich ausblenden.
- **Verschiebbare Trenner, einstellbare Breiten oder gemerkte Layouts.**
- **Ein Eintrag im Menü „Ansicht“ und ein Tastenkürzel** für die
  Umschaltfläche. Beides ist naheliegend, aber nicht gefordert; die
  Schaltfläche ist per Tastatur erreichbar und erfüllt die Anforderung
  Grundlegende Barrierefreiheit (design.md D2).
- **Ein allgemeines Benachrichtigungssystem** (Toast-Bibliothek, Stapel
  mehrerer Hinweise, Verlauf, Schließen-Schaltfläche). Es bleibt bei einem
  Kurzhinweis zur Zeit, der nach kurzer Zeit von selbst verschwindet.
- **Eine Aktion „Rückgängig“ im Kurzhinweis.**
- **Bestätigung beim Ziehen und Ablegen** in den Bildstreifen. Dort sieht man
  die Wirkung an der Stelle, an der man loslässt, und es vibriert bereits.
- **Bestätigung beim Importieren, beim Entfernen oder beim Setzen eines
  Übergangs.** Diese Change bestätigt genau das Hinzufügen aus der Sammlung.
- **Neue Vibrationsmuster** oder Haptik am Desktop.
- **Das Aufnehmen der Auswahl selbst.** Dass ein Tippen über 400 ms als
  langes Drücken galt und die Auswahl verwarf, ist ein eigener Fehler und
  wird getrennt behoben (Beads mmy-edq, mmy-43e). Diese Change bestätigt nur
  die gelungene Aktion.
