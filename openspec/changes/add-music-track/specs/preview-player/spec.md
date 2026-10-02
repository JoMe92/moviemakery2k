## ADDED Requirements

### Requirement: Musik in der Wiedergabe
Der Vorschaumonitor MUST die Musikspur zur Wiedergabe der Bilder abspielen,
mit derselben Planung wie der Export (Spec music-track „Musik am Filmende“).
Solange Musik geplant ist, MUST die Audiouhr des Browsers die Wiedergabezeit
vorgeben, sodass Bild und Ton auch nach mehreren Minuten nicht
auseinanderlaufen. Pause, Stopp, Suchen und Änderungen an Projekt oder
Musikspur MUST die Musik sofort an der aktuellen Zeit fortsetzen bzw.
anhalten. Der Ton MUST erst nach einer Benutzeraktion starten. Während der
Demo eines Übergangs MUST die Musik stumm sein.

#### Scenario: Wiedergabe mit Musik
- **WHEN** ein Benutzer ein Projekt mit Bildern und einem Musikstück abspielt
- **THEN** beginnt die Musik bei 0:00 zusammen mit dem ersten Bild, und bei
  jedem Zeitpunkt entspricht die Stelle in der Musik der Zeitanzeige

#### Scenario: Suchen
- **WHEN** ein Benutzer während der Wiedergabe die Suchleiste auf 0:01:30
  zieht
- **THEN** spielt die Musik ab der Stelle, die nach der Musikspur zu 0:01:30
  gehört

#### Scenario: Pause
- **WHEN** ein Benutzer während der Wiedergabe Pause drückt
- **THEN** verstummt die Musik sofort, und Wiedergabe setzt sie an derselben
  Stelle fort
