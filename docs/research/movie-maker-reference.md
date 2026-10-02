# Research: recreating the classic Movie Maker (web app + FFmpeg backend)

As of 2026-10-02 (updated for the web app + FFmpeg direction).

**Legend:** **[V]** = *verified* by a cited source · **[E]** = *estimated*,
an assessment or an uncertain value that could not be checked against the
original.

Raw copies of the original definitions are not kept in this repository;
[`docs/research/sources/README.md`](sources/README.md) lists each former file
and links to the original (see section 7 for their status).

## 1. Summary

- The reference is **Movie Maker 2.1 (Windows XP SP2)**. 2.6 is practically
  identical; 6.0 (Vista) moved the effects to GPU shaders and therefore looks
  different. [V]
- **A 1:1 recreation is realistic:** the XML definitions of all built-in
  transitions and effects are publicly documented with their parameters (2.x:
  MSDN article, 6.0: Vista SDK). The 2.x title XML was extracted from
  `moviemk.exe` in 2005 and survives via archive.org. [V]
- **Stack (decided, see [ADR 0001](../adr/0001-architecture.md)):** web app
  (Vite/React/TS, WebGL2 preview) and a Python/FastAPI backend with FFmpeg.
  The GLSL ES shaders are shared between preview and export. The earlier
  KMP/Android recommendation (§5, historical) is obsolete.
- **Name:** "Windows" must not appear in the name; "Movie Maker" is risky. An
  original name is better, possibly with a tagline such as "inspired by the
  classic Movie Maker". Original icons, sounds and shaders must not be
  reused. [V/E]

## 2. Versions

| Version | Platform | Significance |
|---|---|---|
| 1.0 / 1.1 | ME / XP | Few features, no effects yet |
| 2.0 | XP update, Nov 2002 | Introduces effects, transitions, titles and AutoMovie |
| **2.1** | **XP SP2** | **Reference for this project** |
| 2.6 | Vista | Same as 2.1, CPU only |
| 6.0 | Vista | Direct3D 9 + HLSL (`Parity.fx`), new pan/zoom effects, different look |

Sources: https://en.wikipedia.org/wiki/Windows_Movie_Maker ·
https://learn.microsoft.com/en-us/previous-versions/ms867186(v=msdn.10)

## 2a. Interaction model of the original (2.x)

This is part of the look & feel and should be recognisable in the
recreation:

- **Main window:** on the left the **task pane** ("Movie Tasks") with three
  steps: *1. Capture Video* (import), *2. Edit Movie* (transitions, effects,
  titles), *3. Finish Movie* (export). In the middle the **collections**
  (imported clips as tiles, or the catalog of effects and transitions); on the
  right the **preview monitor** with play, split and frame step. [V]
- **At the bottom, switchable:** the **storyboard** (tiles with an effect slot
  per clip and a transition slot between clips) or the **timeline** (tracks
  for video, transition, audio, audio/music, title overlay; zoom; trimming via
  handles). [V]
- **Interaction:** effects and transitions are dragged from the collection
  onto a slot. In the catalog, a double-click previews the item with sample
  pictures. [V]
- **Clips:** videos are automatically split into clips by scene on import.
  Pictures get a default duration and transitions a default overlap (both
  configurable in the options). [V]
- **Title wizard:** first choose the placement (at the beginning, before or on
  the selected clip, at the end), then text, animation, font and colour. [V]
- **AutoMovie:** automatic editing with a style (e.g. "Music Video", "Old
  Movie"). [V]
- **Save Movie wizard:** destination (My Computer, CD, e-mail, web, DV camera)
  and quality profile. [V] In the recreation this becomes file + profile.

Source: https://en.wikipedia.org/wiki/Windows_Movie_Maker and the MSDN
articles below. The exact UI wording cannot be verified without a reference
installation (§8). [E]

## 3. 2.x catalog (reference)

### Transitions: 60 [V]
- **Basic (9):** Bars, Checkerboard, Dissolve, Fade, Iris, Pixelate, Wheel
  (4 spokes), 6 wipes (Wide/Normal/Narrow × Down/Right; `GradientSize`
  0.6/0.5/0.2)
- **SMPTE wipes (34)**, by `MaskNum`:
  - Reveal Right/Down (1, 2)
  - Inset ×4 (3–6)
  - Split V/H (21, 22)
  - Diagonal Down Right (41)
  - Bow Tie V/H (43, 44)
  - Diagonal Cross/Box Out (47, 48)
  - Filled V ×4 (61–64)
  - Zig Zag V/H (73, 74)
  - Rectangle (101), Diamond (102)
  - Circle / Circles (119, Circles with Replicate 8×6)
  - Star / Stars (128)
  - Heart (130), Key Hole (131), Eye (122)
  - Sweep Diagonal/Horizontal (226, 228)
  - Fan In (231)
  - Swinging Door (253)
  - Windshield ×2 (262, 263)
- **3D/particles, WMTFX (13):** Flip, Slide Up, Slide Up Center, Roll, Spin
  Out, Page Curl ×2, Shatter ×4, Whirlwind, Shrink

### Video effects: 30 in the XML, probably 28 in the UI [V]
- Sepia, Negative*, Posterize, Threshold, Hue Cycle, Grayscale
- Brightness ±
- Blur, Pixelate
- Film Age Old/Older/Oldest (`Age` 30/60/90)
- Film Grain, Smudge Stick, Graphic Pen*, Watercolor
- Fade In/Out from/to Black/White
- Ease In/Out, Mirror H/V, Rotate 90/180/270
- Speed Up Double / Slow Down Half

\* Possibly not visible in 2.1. Needs to be checked on a real installation. [E]

### Titles and credits: 43 [V]
- **One line (25):** including Fly In, Typewriter, Ticker Tape, News Banner,
  Scroll Perspective, Flashing, Zoom In/Out, Spin In/Out, Video In Text,
  Wow!, Paint Drip, Basic Title, Subtitle
- **Two lines (9):** including Fade In and Out, Fly In Fades, Exploding
  Outline, Sports Scoreboard, Newspaper
- **Credits (9):** Scroll Up Stacked, Scroll Up Side-by-Side, Zoom In, Fade In
  and Out, Mirror, Exploding, Fly In L/R, Video Left, Video Top
- **Structure of an animation:** three phases, Entrance → Main → Exit. Each
  phase has Effect, Position, Zoom and VideoRect. Possible effect values: Fade,
  Blur, OverZoom, Rotate, TypeWriter, FadeEllipse, FadeWipe, BounceWipe,
  Perspective, SpotLight, Flashing, Inverse, Multi, Mirror, OutlineExplode.
  In addition there are banner types and colours.

### Additions in 6.0 [V]
- 3 new transitions: Dissolve Rough/Vertical, Whirlwind from top. The 6.0
  catalog counts 63 transitions.
- 49 effects, including 17 pan/zoom effects, Spin 360, 3D Ripple, Sharpen,
  Dream, Edge Detection. Smudge Stick, Graphic Pen and Negative were dropped.

## 4. Original technology → recreation

| Original (2.x) | Recreation |
|---|---|
| DirectX Transforms (COM, `IDXEffect`) in DirectShow, one XML file per effect with GUID and `<Param>` | One GLSL ES 3.0 shader per effect. Parameters are read from our own catalog (JSON), which is derived 1:1 from the original XML. |
| SMPTE wipes (`MaskNum`, `BorderSoftness`, `ReplicateX/Y`) | Geometry per the W3C SMIL table: https://www.w3.org/TR/SMIL3/smil-transitions.html. Soft edge and replicate are implemented ourselves. |
| WMTFX `Simple3D` (Move/Rotate/Scale/PageCurl, camera) | Small 3D quad renderer with a vertex shader |
| WMTFX `ParticleSystem` (Shatter, Whirlwind) | Own particle system. There is no open template. |
| Film Aging (`Age` → 10 individual parameters) | Shader with noise, scratches, flicker, jitter, posterize and vignette |
| Artistic filters (`EffectID` 16 FilmGrain, 40 Watercolor …) | One shader per filter (Watercolor e.g. as Kuwahara) |
| Title engine (TitleStandard/MultiTitles/CreditStandard) | Own text animation engine following the Entrance/Main/Exit phase model |

- **Helper source gl-transitions** (MIT, check the license per file): Fade,
  Dissolve, Pixelize, Heart, StarWipe, BowTie, Swirl, InvertedPageCurl … give
  a quick start. Their geometry differs, though; for real fidelity the WMM
  parameters have to be implemented ourselves.
- **Timing curves:** adopt `ExponentialProgressDuration/Scale` from WMTFX. The
  default transition duration is probably 1.25 s [E, to be checked].

## 5. Tech stack

> **Decided in [ADR 0001](../adr/0001-architecture.md):** web app and FFmpeg
> backend. The earlier evaluation (KMP/Compose, Flutter, Qt, Rust core) was
> for a Linux → Android target and is obsolete. It is preserved in the Git
> history of this file (formerly `docs/research/movie-maker-klon.md`).

### Pipeline
```
apps/web (browser)                         backend/ (Python, FastAPI)
 ├─ Movie Maker UI (React, Y2K theme)       ├─ Project model (Pydantic) ─► OpenAPI ─► TS types
 ├─ Preview: <video>/frames ─► WebGL2       ├─ Media import: ffprobe, thumbnails, proxies
 │            └─ packages/shaders           ├─ Export: ffmpeg decode ─► headless GL (EGL)
 └─ Project JSON ◄──────── REST ──────────► │          └─ packages/shaders ─► ffmpeg encode
                                            └─ Audio mix (amix, level audio ↔ music)
packages/catalog: effect/transition/title catalog, shared
```

### FFmpeg as a quick intermediate step
`xfade` (since FFmpeg 4.3, considerably extended in 7.x) approximates several
2.x transitions [V: https://ffmpeg.org/ffmpeg-filters.html#xfade]:

| WMM 2.x | xfade | Fidelity [E] |
|---|---|---|
| Fade / Dissolve | `fade` / `dissolve` | good / medium |
| Wipe Right/Down | `wiperight`/`wipedown` (without soft edge) | medium |
| Iris / Circle | `circleopen` | medium |
| Pixelate | `pixelize` | medium |
| Reveal Right/Down | `slideright`/`slidedown` | medium |
| Split V/H | `vertopen`/`horzopen` | medium |
| Wheel, Star, Heart, 3D, particles | – (only a `custom` expression or GL) | – |

Effects that can be approximated with filters: Grayscale (`hue=s=0`), Sepia
(`colorchannelmixer`), Brightness (`eq`), Blur (`gblur`), Mirror
(`hflip`/`vflip`), Rotate (`transpose`), Fade from/to Black/White (`fade`),
Speed (`setpts`/`atempo`). Titles: `drawtext` (without the phase animations).

### Risks
- WebGL2 and desktop GL differ (precision, `#version` header, texture upload).
  Golden-frame tests compare browser and backend. [E]
- Export without a GPU needs Mesa llvmpipe and is slow, but sufficient for
  small projects. [E]
- Frame-accurate preview in the browser is hard with `<video>`. Later this
  needs WebCodecs or backend proxies. [E]
- Only FFmpeg 4.3 was available locally. It has `xfade`, but with few modes.
  The target is FFmpeg ≥ 7 (now provided by Pixi). [V]

## 6. MVP scope (web)

**In:**
- Import of video, pictures (with a default duration) and music
- Storyboard with drag & drop, simple timeline with trimming and splitting
- Movie Maker layout: task pane (Capture/Edit/Finish), collections, preview
  monitor, switchable storyboard/timeline
- ~5 transitions (Fade, Dissolve, Wipe, Circle, Pixelate)
- ~5 effects (Grayscale, Sepia, Film Age Old, Blur, Fade In/Out from Black)
- Titles/credits with 3 animations (Basic Title, Fly In, Scroll Up Stacked)
- Music track with the audio ↔ music level slider
- Export as MP4 (H.264/AAC), save and load projects

**Later:**
- Rest of the catalog: 3D, particles, all titles
- Narration, AutoMovie
- Speed effects, pan/zoom (6.0)

> The first milestone actually implemented is narrower: the clickable
> slideshow prototype of change `add-slideshow-mvp` (pictures only, six
> transitions, preview without export).

## 7. Legal notes (not legal advice)

- **Microsoft trademarks:** Microsoft's guidelines prohibit Microsoft
  trademarks in product names. "Windows" is a trademark; "Movie Maker" is
  weak but could cause confusion. [V/E] Source:
  https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks
- **Do not reuse:** icons, bitmaps, sounds, help texts, `Parity.fx` or any
  Microsoft binaries.
- **Uncritical:** workflow, interaction model and our own effect
  implementations based on the documented parameters. [E]
- **The original XML definitions** are Microsoft or community material and
  only a reference for development. They are **not** in this repository or
  its history; [`sources/README.md`](sources/README.md) links to the
  originals, and local copies in `sources/` are git-ignored. **Never commit
  or ship them.** Our own catalog is derived from the documented parameters
  and written from scratch.
- **FFmpeg:** LGPL only without `--enable-gpl`/`nonfree` and with dynamic
  linking. libx264 makes the app GPL. [V] Decide on the app's license: GPL
  (then x264 is fine) or proprietary (then openh264 or hardware encoders).
- **gl-transitions:** check the license line of each file.

## 8. Open questions

1. ~~Name~~ → decided: **moviemakerY2K** (2026-10-02). Note: it contains
   "Movie Maker"; check the trademark situation briefly before a public
   release.
2. ~~License~~ → decided: **GPL / open source**. FFmpeg with libx264 is
   therefore allowed.
3. ~~Look~~ → decided: **own Y2K look**, inspired by XP/Luna, without original
   assets or a pixel-exact copy.
4. ~~Reference installation~~ → **none available.** The recreation follows
   only the documented parameters (XML, SMIL). Golden-frame tests only check
   the consistency of our own engines, not fidelity to the original. Still
   open: the exact UI names, the number of effects in 2.1 and the default
   durations (assumption: 1.25 s).

## Sources (selection)

- MSDN WMM2 custom effects/transitions: https://learn.microsoft.com/en-us/previous-versions/ms867186(v=msdn.10)
- Vista SDK: https://learn.microsoft.com/en-us/previous-versions/windows/desktop/wmmdvdm/built-in-transitions · …/built-in-effects · …/changes-to-the-xml-schema
- Title XML (Rehan): https://www.rehanfx.org/customtctext.htm (archived)
- FX archive: https://archive.org/details/FXArchiveWMM
- SMIL wipes: https://www.w3.org/TR/SMIL3/smil-transitions.html
- gl-transitions: https://github.com/gl-transitions/gl-transitions
- libmswmm (reads .MSWMM): https://github.com/Jeinzi/libmswmm
- Media3 1.9: https://android-developers.googleblog.com/2025/12/media3-190-whats-new.html
- ffmpeg-kit discontinued: https://github.com/arthenica/ffmpeg-kit
- FFmpeg license: https://ffmpeg.org/legal.html
