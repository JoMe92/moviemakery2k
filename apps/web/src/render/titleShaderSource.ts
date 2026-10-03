/**
 * Title shader sources from `packages/shaders` (see that package's README,
 * "Title shaders"; design.md D1–D3 of `add-titles-and-credits`). Not part of
 * the transition `prelude`/`epilogue` contract in `shaderSource.ts` — a
 * title is its own, self-contained program.
 */
import titleFragment from "../../../../packages/shaders/title-fragment.glsl?raw";
import titleVertex from "../../../../packages/shaders/title-vertex.glsl?raw";

export const TITLE_VERTEX_SOURCE: string = titleVertex;
export const TITLE_FRAGMENT_SOURCE: string = titleFragment;
