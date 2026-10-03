# @mmy/fonts – bundled title font

`LiberationSans-Regular.ttf`: the default font for every title and credits
style (design.md D1 of `add-titles-and-credits`). Chosen because it is
metric-compatible with Arial/Verdana (pixel parity between the Canvas2D
preview rasterisation and the backend `FrameRenderer` export) and openly
licensed (SIL Open Font License 1.1, see `OFL.txt`) — no system font is
relied on.

Copied unmodified from the `fonts-liberation` package
(https://github.com/liberationfonts). Not a Microsoft asset.

Consumers:

- `apps/web` (Canvas2D `fillText` via a bundled `FontFace`, see
  `apps/web/src/render/titleText.ts`)
- `backend` (same file, loaded with Pillow's `ImageFont.truetype`, see
  `TASK-RENDER-008`)
