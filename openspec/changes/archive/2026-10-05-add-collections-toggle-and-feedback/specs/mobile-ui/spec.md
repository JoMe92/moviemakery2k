## MODIFIED Requirements

### Requirement: Hinzufügen aus der Sammlung per Auswahl
Das Sammlungs-Sheet MUST die Reiter „Meine Bilder“, „Meine Musik“ und
„Videoübergänge“ sowie „Importieren“ anbieten. In „Meine Bilder“ und „Meine
Musik“ MUST Tippen eine Kachel zur Auswahl hinzufügen oder aus ihr entfernen
(sichtbares Häkchen, `aria-pressed`). Die Schaltfläche „Zum Bildstreifen
hinzufügen (n)“ bzw. „Zur Musikleiste hinzufügen (n)“ MUST die gewählten
Elemente in Auswahlreihenfolge einfügen, Bilder hinter dem gewählten Bild oder
am Ende, Musik am Ende, und danach das Sheet schließen. Nach dem Schließen
MUST die Anwendung das Hinzufügen bestätigen, wie in der Anforderung
Kurzhinweis und Bestätigung beim Hinzufügen der Spec app-shell beschrieben:
Kurzhinweis mit Anzahl und Art, sichtbar gescrolltes letztes Element und,
wenn das Gerät es kann und der Schalter „Vibration“ an ist, eine kurze
Vibration. Langes Drücken auf eine Kachel MUST „Eigenschaften“ und „Löschen“
anbieten.

#### Scenario: Drei Bilder hinzufügen
- **WHEN** ein Benutzer bei leerem Bildstreifen im Sammlungs-Sheet drei
  Bilder in der Reihenfolge C, A, B antippt und „Zum Bildstreifen hinzufügen
  (3)“ wählt
- **THEN** enthält der Bildstreifen C, A, B mit Standarddauer, das Sheet ist
  geschlossen, und ein Kurzhinweis meldet „3 Bilder hinzugefügt“

#### Scenario: Keine Auswahl
- **WHEN** im Sammlungs-Sheet kein Element gewählt ist
- **THEN** ist die Schaltfläche zum Hinzufügen deaktiviert

#### Scenario: Hinzufügen bei weit gescrolltem Bildstreifen
- **WHEN** ein Benutzer bei einem Bildstreifen mit zwanzig Bildern, der am
  Anfang steht, im Sammlungs-Sheet zwei Bilder wählt und hinzufügt
- **THEN** sind die beiden neuen Bilder am Ende des Bildstreifens zu sehen,
  ohne dass der Benutzer scrollen muss

### Requirement: Haptische Rückmeldung
Wenn das Gerät Vibration unterstützt, MUST die Anwendung kurz vibrieren, wenn
ein langes Drücken auslöst, ein Element abgelegt wird, ein Ablegen abgelehnt
wird und etwas aus der Sammlung zum Bildstreifen oder zur Musikleiste
hinzugefügt wird. „Extras → Optionen…“ MUST dann einen Schalter „Vibration“
(Standard an) enthalten, der lokal gespeichert wird. Ohne Vibrations-API MUST
der Schalter fehlen und nichts vibrieren; die Rückmeldung beim Hinzufügen
MUST NOT allein aus der Vibration bestehen.

#### Scenario: Vibration ausschalten
- **WHEN** ein Benutzer in „Optionen…“ „Vibration“ ausschaltet und danach ein
  Bild per langem Drücken zieht
- **THEN** vibriert das Gerät nicht, und die Einstellung gilt auch nach dem
  Neuladen

#### Scenario: Vibration beim Hinzufügen
- **WHEN** ein Benutzer auf einem Gerät mit Vibration und eingeschaltetem
  Schalter im Sammlungs-Sheet zwei Bilder wählt und hinzufügt
- **THEN** vibriert das Gerät einmal kurz mit demselben Muster wie beim
  Ablegen eines Elements

#### Scenario: Ausgeschaltete Vibration beim Hinzufügen
- **WHEN** ein Benutzer mit ausgeschaltetem Schalter „Vibration“ aus dem
  Sammlungs-Sheet hinzufügt
- **THEN** vibriert das Gerät nicht, und der Kurzhinweis meldet das
  Hinzufügen trotzdem
