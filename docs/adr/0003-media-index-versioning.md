# 0003 – The media index migrates by shape, not by version

- **Status:** accepted (2026-10-04), Bead `mmy-nlk`
- **Relates to:** [ADR 0001](0001-architecture.md) (the two stores in the data
  directory)

## Context

The data directory holds two independently written JSON documents, and until
now they disagreed about whether data from an earlier version is supported.

`project.json` is **one** document with an explicit `schemaVersion` and a
migration chain (`1 → 2 → 3` in `migrate_project_data`). A project written by
an older version is raised on read, and a project that still cannot be read is
logged and replaced by an empty one, the file kept until the next save.

`media.json` is a **list** of heterogeneous entries, discriminated by `kind`,
with no version field and — until this ADR — no named migration: a single
list comprehension in `_read_index_payload` injected `kind: "image"` into
entries written before audio existed, and that was the whole story.

The asymmetry shipped a P0. `add-timeline-editing` added the **required**
`videoUrl` to `VideoItem` (D5). Every video imported before that upgrade has no
`videoUrl` in `media.json`, so `_read_index_payload` raised a Pydantic
`ValidationError` inside `MediaStore.__init__`, inside `create_app()` — the
backend of 0.2.0 did not start at all on any installation that had ever
imported a video, with no message an operator could act on. Tests did not catch
it because every test writes its index with the current code, so no test had
old data in it.

The obvious reflex is to give `media.json` a `schemaVersion` too. That reflex
is wrong, and this ADR records why.

## Decision

**`media.json` gets no version counter. Its migration is shape-directed,
per entry, and idempotent** — `_migrate_index_entry` in
`backend/src/mmy_backend/media.py`.

1. **Shape, not version.** A version counter added now cannot help the data
   this incident was about: entries already in the field carry no version, so
   reading them would still require asking what an entry is *missing*. Shape
   detection answers that question directly and needs no bookkeeping about
   which release wrote what. For a list of self-describing entries it is
   strictly more robust than a counter, and it keeps working for an index that
   mixes entries written by three different versions — which is the normal
   case, because entries are never rewritten on import.
2. **Reconstruct from the ID.** Every required `*Url` field of a media item is
   a pure function of the entry's ID: the same URL the import path builds and
   the API actually serves. There is no information in those fields to lose, so
   reconstructing one is always safe and always correct. `_DERIVED_URLS` is the
   single table of them, per kind, and the import path and the migration build
   their URLs the same way.
3. **The table is a guard rail, enforced by a test.**
   `tests/test_media_index_migration.py::test_every_required_url_field_has_a_derivation`
   reflects over `ImageItem`, `AudioItem` and `VideoItem` and fails if a
   required `*Url` field has no entry in `_DERIVED_URLS`. The next field added
   the way `videoUrl` was fails in CI instead of on a user's installation.
4. **A new required field that is *not* derivable from the ID may not be
   added.** Make it optional with a default, or derive it (re-probe the file on
   import, backfill on write), or write a real migration step beside the URL
   table. This is the rule the asymmetry was missing; it is the point of this
   ADR.
5. **Reading stays side-effect free.** The migration is not written back on
   startup. The repaired shape reaches disk on the next index write (an import
   or a delete), exactly as the project store behaves. A read path that writes
   would fail on a read-only data directory and would rewrite a user's index
   before they have done anything.
6. **An index that migration cannot repair is fatal, with a legible error.**
   `MediaStore` raises `MediaIndexError` naming the file and the validation
   reason, instead of letting a raw `ValidationError` out of `create_app()`.
   It deliberately does **not** degrade to an empty index the way the project
   store does: the project refers to media by ID, so an empty index would both
   invalidate the project and let the next import overwrite the index of a
   library that is still on disk. For the project store, starting empty loses
   an arrangement that the user can see is gone; for the media index it would
   silently orphan the user's files. Loud failure is the safer default here.

A regression test covers the startup path itself — `create_app()` against a
fixture `media.json` in the pre-0.2.0 shape, then `GET /api/media` — because a
unit test on `_read_index_payload` would not have reproduced the incident,
which was a startup failure.

## Consequences

- (+) Any `media.json` from any earlier version is read in one pass, including
  one that mixes shapes, and no entry is rewritten until it has to be.
- (+) The repeat of this class of bug is a CI failure, not a field failure.
- (+) The two stores no longer disagree by accident. They still differ —
  `project.json` is versioned, `media.json` is shape-migrated — but the
  difference is now a decision with a reason, and the reason is the documents'
  different shapes (one versioned document vs. an append-only list of
  self-describing entries) and different blast radius on failure.
- (−) The migration's knowledge lives in code (`_DERIVED_URLS`,
  `_migrate_index_entry`), not in the data. Reading an old `media.json` tells
  you nothing about which version wrote it; only the code knows what to fill.
  Accepted: the alternative buys that readability at the price of a counter
  that is wrong for all existing data.
- (−) Rule 4 is a review obligation, enforced only for `*Url` fields. A new
  required *probed* field (a frame rate, say) would pass the completeness test
  and still break old data. Such a field needs its own migration step and its
  own fixture test; the ADR says so, the test cannot.
