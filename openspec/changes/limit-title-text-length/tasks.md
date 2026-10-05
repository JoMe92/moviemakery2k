Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man
sieht, dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei.
Diese Change behebt einen heute erreichbaren Fehler und ist absichtlich
klein.

## 1. Oberfläche

- [x] TASK-WEB-078 Titeltext in jedem Eingabefeld begrenzen
  Eine gemeinsame Konstante in `apps/web/src/titles/`, die die Grenze des
  Backends spiegelt, und ein `maxLength` daraus an den Zeilenfeldern und
  den Nachspann-Einträgen des Titel-Assistenten sowie am Filmtitel-Feld
  des AutoMovie-Dialogs (design.md D1, D2). Erledigt, wenn
  Komponententests für alle drei Feldarten zeigen, dass am Limit keine
  weiteren Zeichen angenommen werden, und ein Test die Konstante gegen
  `maxLength` einer Titelzeile in `apps/web/src/generated/openapi.json`
  prüft.

## 2. Abschluss

- [ ] TASK-INFRA-029 E2E und Doku zum begrenzten Titeltext
  Playwright gibt im Titel-Assistenten und im AutoMovie-Dialog einen zu
  langen Text ein und prüft, dass der Film entsteht und das Projekt ohne
  Fehler gespeichert wird; dazu CHANGELOG „Unreleased“ (nach
  TASK-WEB-078). Erledigt, wenn `pixi run test-e2e` und `pixi run check`
  grün sind.
