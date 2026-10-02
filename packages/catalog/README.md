# @mmy/catalog – Effekt-, Übergangs- und Titelkatalog

**Single Source of Truth** für Übergänge (später auch Effekte und Titel).

- `transitions.json`: Katalog, validiert durch `transitions.schema.json`
  (JSON Schema 2020-12).
- Jeder Eintrag nennt seinen Shader in `packages/shaders/transitions/`. Jeder
  Wert in `params` wird zu `uniform float <name>` in diesem Shader.
- `source` belegt die Parameter (WMM-2.x-XML bzw. SMPTE-Wipe-Nummer, siehe
  `docs/research/sources/`). `estimated` listet Werte, die nicht am Original
  prüfbar sind [E]. Sie lassen sich hier ohne Codeänderung nachjustieren.
- Das Backend lädt und validiert den Katalog beim Start und liefert ihn über
  `GET /api/catalog/transitions` aus. Die Referenz-XMLs selbst werden nie
  ausgeliefert.
