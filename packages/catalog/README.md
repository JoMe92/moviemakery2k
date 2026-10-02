# @mmy/catalog – Effekt-, Übergangs- und Titelkatalog

**Single Source of Truth** für alle Übergänge, Videoeffekte und Titelanimationen.
Frontend (Vorschau) und Backend (Export) lesen denselben Katalog.

- Ein Eintrag beschreibt ID, Anzeigename (eigene Benennung), Kategorie,
  Standarddauer, Parameter samt Wertebereich und das zugehörige Shader-Programm
  in `packages/shaders`.
- Die Werte werden aus den dokumentierten Original-Parametern abgeleitet
  (`docs/research/sources/`, MSDN/Vista-SDK, W3C SMIL) und **neu geschrieben**.
  Die Referenz-XMLs selbst werden nie ausgeliefert.
- Format (JSON + JSON Schema) und Umfang werden über einen OpenSpec-Change
  festgelegt. Bis dahin ist dieses Paket leer.
