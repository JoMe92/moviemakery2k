# Reference sources (not in the repository)

This directory used to hold raw copies of the original Movie Maker
transition, effect and title definitions (XML). They are Microsoft or
community material, so they are **not** part of this repository or its
history. This file lists what each copy contained and where the original
can still be found.

Our own catalog (`packages/catalog/`) was written from scratch from the
documented parameters; nothing from these files is shipped.

## Keeping local copies

Maintainers may keep local reference copies in this directory for
development. The pattern `docs/research/sources/*.xml` is listed in
`.gitignore`, so such copies are never committed. Do not force-add them
(`git add -f`).

## Former files

| Former file | Contents | Original source |
| --- | --- | --- |
| `wmm2x_builtin_from_msdn.xml` | Movie Maker 2.0 built-in transitions and effects as `TransitionDLL`/`EffectDLL` entries (DirectShow/DXTransform GUIDs, `nameID`, icon IDs, parameters such as `MaskNum`, `GradientSize`, `wipeStyle`), taken from the sample XML in the MSDN article. | MSDN, *Creating Custom Effects and Transitions in Windows Movie Maker 2* (WMM 2.0, January 2005): https://learn.microsoft.com/en-us/previous-versions/ms867186(v=msdn.10) |
| `wmm6_builtin_transitions.xml` | Movie Maker 6.0 (Vista) built-in transitions, schema version 2.8 (shader-based `TFX` entries with `Animation`, `Mesh`, `Edge`, `GradientWidth` and similar parameters). | Vista SDK, *Built-in Transitions*: https://learn.microsoft.com/en-us/previous-versions/windows/desktop/wmmdvdm/built-in-transitions (schema changes: https://learn.microsoft.com/en-us/previous-versions/windows/desktop/wmmdvdm/changes-to-the-xml-schema) |
| `wmm6_builtin_effects.xml` | Movie Maker 6.0 (Vista) built-in effects, schema version 2.8 (shader-based `TFX` entries such as Film Age, which reference Microsoft's `Parity.fx`). | Vista SDK, *Built-in Effects*: https://learn.microsoft.com/en-us/previous-versions/windows/desktop/wmmdvdm/built-in-effects |
| `wmm2x_titles1_rehanfx.xml` | Movie Maker 2.x title animations, part 1 (`TitleDLL` entries such as *Fade, In and Out*, using the `TitleStandard`/`TitleMultiTitles` engines with Entrance/Main/Exit parameters). Extracted from `moviemk.exe` by the rehanfx community site in 2005. | Rehan's custom titles and credits page on rehanfx.org (offline); archived copies: https://web.archive.org/web/*/rehanfx.org/customtctext.htm |
| `wmm2x_titles2_rehanfx.xml` | Movie Maker 2.x title animations, part 2 (for example *Stretch* and other zoom and fly-in variants). Same origin as part 1. | Same rehanfx page (archived): https://web.archive.org/web/*/rehanfx.org/customtctext.htm |
| `wmm2x_credits_rehanfx.xml` | Movie Maker 2.x credit animations (`CreditStandard` engine, for example *Credits: Scroll, Up Stacked*). Same origin as the title files. | Same rehanfx page (archived): https://web.archive.org/web/*/rehanfx.org/customtctext.htm |

The community FX archive at https://archive.org/details/FXArchiveWMM
collects further Movie Maker add-on material from that era.

See [the research notes](../movie-maker-reference.md), section 7, for the
legal background, and
[`docs/maintainers/purge-history.md`](../../maintainers/purge-history.md)
for how the files are removed from the git history.
