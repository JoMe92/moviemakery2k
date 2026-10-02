# @mmy/fixtures – shared test vectors

Language-neutral fixtures that more than one implementation is tested against.

## `timeline-vectors.json` – slideshow time model

The overlapping time model of the slideshow (spec `preview-player`,
requirement "Zeitmodell der Diashow" (slideshow time model); design rationale in
`openspec/changes/add-movie-export/design.md` D3) exists twice: in TypeScript
for the preview (`apps/web/src/timeline/timeline.ts`) and in Python for the
export. Both are checked against this file, so they cannot drift apart.

The model: a transition belongs to its target slide (`transitionIn`) and
overlaps the end of the previous slide with the start of the target slide.
Its effective duration is `t_i = min(T_i, d_{i-1} / 2, d_i / 2)` (0 for the
first slide and for hard cuts). Slide `i` starts at
`start_{i-1} + d_{i-1} - t_i`; the total is the sum of slide durations minus
the sum of effective transition durations.

### Format

```jsonc
{
  "version": 1,          // bump on any incompatible format change
  "tolerance": 1e-9,     // absolute tolerance for every number comparison
  "cases": [
    {
      "name": "unique-kebab-name",
      "description": "free text, ignored by the tests",
      "slides": [        // input, same shape as the API/TS TimelineSlide
        { "id": "a", "mediaId": "m-a", "duration": 5, "transitionIn": null },
        { "id": "b", "mediaId": "m-b", "duration": 5,
          "transitionIn": { "transitionId": "fade", "duration": 1.25 } }
      ],
      "expected": {
        "totalDuration": 8.75,
        // one entry per slide, in order; transitionIn = effective duration
        "placed": [ { "index": 0, "start": 0, "end": 5, "transitionIn": 0 } ],
        // gapless, in time order; a still segment is omitted if it would be empty
        "segments": [
          { "kind": "still", "slideIndex": 0, "start": 0, "end": 3.75 },
          { "kind": "transition", "fromIndex": 0, "toIndex": 1,
            "transitionId": "fade", "start": 3.75, "end": 5 }
        ],
        // what to draw at time t (seconds)
        "samples": [
          { "t": 4.375, "frame": { "kind": "transition", "fromIndex": 0, "toIndex": 1,
                                   "transitionId": "fade", "progress": 0.5 } }
        ]
      }
    }
  ]
}
```

`frame` is one of:

- `{ "kind": "empty" }` – the project has no slides;
- `{ "kind": "still", "slideIndex": n }`;
- `{ "kind": "transition", "fromIndex", "toIndex", "transitionId", "progress" }`
  with `progress` in `[0, 1]`, `(t - start) / (end - start)` of the segment.

Sampling rules the vectors pin down:

- Segments are half-open `[start, end)`: an instant on a boundary belongs to
  the segment that starts there (transition start has `progress` 0; the end of
  a transition already shows the target slide as a still).
- `t` is clamped to `[0, totalDuration]`; at and after the end the last
  segment is shown (the last slide stays visible), before 0 the first one.

### Comparing

Numbers are compared with the absolute `tolerance`; strings, `null` and the
set of object keys must match exactly; arrays must have the same length and
order. All values are chosen to be exact in binary floating point.

Consumers: `apps/web/src/timeline/timelineVectors.test.ts` (Vitest); the
Python port is checked by pytest against the same file.
