# 2503: Add output-only value descriptors

- Status: completed
- Milestone: 25
- Packages: `@ultimabase/core`
- Depends on: 2502
- ADR: [ADR-0244](../../docs/adr/0244-contextual-fields-and-virtual-results.md)

## Goal

Introduce one public `OutputBuilder` that describes values returned by Core
without pretending they are stored fields or mutation inputs.

## Acceptance criteria

- [x] The output builder exposes built-in scalar, enum, temporal, decimal,
      binary, JSON, list, and object shapes with exact inferred values.
- [x] Output options use output vocabulary such as nullability rather than
      persisted-input meanings such as required create presence.
- [x] `output.object({ fields })` recursively uses the same output builder and
      retains exact named object structure and stable `typeName` metadata.
- [x] Defaults, immutability, indexes, generators, input Hooks, relationships,
      columns, mutation validation, and persistence options are absent from
      autocomplete and rejected at Runtime.
- [x] Output descriptors are immutable, snapshot-safe, deterministic,
      transport-neutral, and sufficient for Core structural validation plus
      REST and GraphQL representation.
- [x] Public exports and JSDoc make the distinction between stored fields,
      embedded values, and output-only values explicit.

## Tests

- [x] Runtime tests cover declaration normalization, recursive snapshots,
      nullability, lists, invalid options, and structural output validation.
- [x] Type and language-service tests cover exact primitive and object values
      through source and built package exports.

## Completion evidence

- `yarn typecheck` passed.
- The full `yarn test` run passed 448 unaffected files and 2,157 tests; after
  updating the explicit public export manifest, its 2 focused tests passed, and
  the three listener-backed files blocked by sandbox `listen EPERM` passed all
  15 tests outside the sandbox.
- `yarn lint` passed with only the repository's existing file-size warnings.
- `yarn build` passed for every workspace, including `attw` and `publint`.
- Focused output Runtime, type, source language-service, public API, and packed
  package tests passed; `yarn test:pack:built` passed 26 files and 150 tests.
- `yarn check:issues`, the active documentation contract suite,
  `yarn format:check`, and `git diff --check` passed.

## Out of scope

- Resolving a virtual value or exposing output descriptors as standalone
  operation contracts.
