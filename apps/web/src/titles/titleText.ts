/**
 * The limit on one line of title text (limit-title-text-length design.md D1).
 *
 * The backend is the single source of truth: `TITLE_LINE_MAX_LENGTH` in
 * `backend/src/mmy_backend/project.py` rejects a longer line, and the
 * generated API contract carries the same number as `maxLength`. This module
 * is the one place in the web app that mirrors it - every field for title
 * text takes its limit from here instead of repeating the number, and
 * `titleText.test.ts` fails if the two sides ever drift apart.
 */

/** Characters one line of title text may hold (the backend's `TITLE_LINE_MAX_LENGTH`). */
export const TITLE_LINE_MAX_LENGTH = 200;

/**
 * One line of title text, cut to the limit (design.md D2).
 *
 * The input fields carry the native `maxLength`, which already blocks typing
 * at the limit; this keeps the value correct for everything the attribute
 * does not cover - a paste in an environment that does not enforce it, and
 * the credits textarea, whose limit is per entry rather than per field.
 */
export function limitTitleLine(line: string): string {
  if (line.length <= TITLE_LINE_MAX_LENGTH) return line;
  const cut = line.slice(0, TITLE_LINE_MAX_LENGTH);
  // Never end on half a surrogate pair: a lone surrogate is not valid text.
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/**
 * The credits textarea's text with every entry cut to the limit.
 *
 * One line of the textarea is one credits entry, so the limit applies per
 * line: a full entry stops taking characters while the entries around it stay
 * exactly as they are (spec titles-and-credits "Nachspann-Eintrag am Limit").
 */
export function limitCreditsText(text: string): string {
  if (text.length <= TITLE_LINE_MAX_LENGTH) return text;
  return text.split("\n").map(limitTitleLine).join("\n");
}
