# 2503: Add output-only value descriptors

- Status: planned
- Milestone: 25
- Packages: `@ultimabase/core`
- Depends on: 2502
- ADR: [ADR-0244](../../docs/adr/0244-contextual-fields-and-virtual-results.md)

## Goal

Introduce one public `OutputBuilder` that describes values returned by Core
without pretending they are stored fields or mutation inputs.

## Acceptance criteria

- [ ] The output builder exposes built-in scalar, enum, temporal, decimal,
      binary, JSON, list, and object shapes with exact inferred values.
- [ ] Output options use output vocabulary such as nullability rather than
      persisted-input meanings such as required create presence.
- [ ] `output.object({ fields })` recursively uses the same output builder and
      retains exact named object structure and stable `typeName` metadata.
- [ ] Defaults, immutability, indexes, generators, input Hooks, relationships,
      columns, mutation validation, and persistence options are absent from
      autocomplete and rejected at Runtime.
- [ ] Output descriptors are immutable, snapshot-safe, deterministic,
      transport-neutral, and sufficient for Core structural validation plus
      REST and GraphQL representation.
- [ ] Public exports and JSDoc make the distinction between stored fields,
      embedded values, and output-only values explicit.

## Tests

- [ ] Runtime tests cover declaration normalization, recursive snapshots,
      nullability, lists, invalid options, and structural output validation.
- [ ] Type and language-service tests cover exact primitive and object values
      through source and built package exports.

## Out of scope

- Resolving a virtual value or exposing output descriptors as standalone
  operation contracts.
