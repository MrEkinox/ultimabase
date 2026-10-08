# @ultimabase/shared

## 1.0.0

### Minor Changes

- d3e1a24: Export dependency-free runtime guards for plain records, unknown arrays,
  non-empty strings, and optional booleans.
- e4f93e3: Add branded values, synchronous-or-asynchronous results, exhaustive checks, and immutable collection helpers.

### Patch Changes

- 8505935: Add immutable typed schema and field extensions with duplicate detection, and allow shared immutable records to accept typed configuration objects.
- e840865: Add immutable, precisely inferred string field metadata with nested declarative validation and field extension options.

  Group field validation metadata and combine regular and unique indexing under `indexed`.

  Preserve tuple shapes when creating immutable arrays.
