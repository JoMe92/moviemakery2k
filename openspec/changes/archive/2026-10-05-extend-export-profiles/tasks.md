Jeder Task ist höchstens etwa einen halben Tag groß und nennt, woran man
sieht, dass er erledigt ist. Abhängigkeiten stehen als „nach …“ dabei.
Diese Change ist rein additiv (keine neue Kodierungslogik) und die letzte
der neun geplanten WMM-2.x-Lücken-Changes.

## 1. Backend

- [x] TASK-API-022 Drittes Qualitätsprofil: `ExportProfile.EMAIL_WEB`
  (320×240, dieselbe Kodierung wie die bestehenden Profile), Empfehlungs-
  Textschlüssel je Profil in der API-Antwort, geschätzte Dateigröße für
  das neue Profil, `gen-api` (design.md D1, D2). Erledigt, wenn pytest
  den Export mit dem neuen Profil (Auflösung, Dateigröße kleiner als
  „Kleine Datei“ bei gleichem Projekt) sowie die unveränderten
  bestehenden zwei Profile abdeckt.

## 2. Oberfläche

- [x] TASK-WEB-070 Assistent um drittes Profil und Empfehlungstexte
  erweitert: Schritt „Qualität“ zeigt alle drei Profile groß zu klein mit
  Empfehlungstext in `de`/`en` (nach TASK-API-022; design.md D2).
  Erledigt, wenn Komponententests alle drei Profile mit Dateigröße und
  Empfehlungstext in beiden Sprachen sowie die unveränderte Auswahl der
  bestehenden zwei Profile abdecken.

## 3. Abschluss

- [x] TASK-INFRA-026 E2E und Doku: Playwright-Smoke erweitert um einen
  Export mit dem Profil „Für E-Mail/Web“; README/CHANGELOG „Unreleased“
  (nach TASK-WEB-070). Erledigt, wenn `pixi run test-e2e` grün ist.
