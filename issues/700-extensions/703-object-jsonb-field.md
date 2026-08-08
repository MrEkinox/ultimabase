# 703: Compile object fields to JSONB

- Status: done
- Milestone: 7+
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Depends on: 108, 503
- ADR: ADR-0021, ADR-0032, ADR-0124, ADR-0165

## Goal

Compile the structured object fields introduced by issue 108 to PostgreSQL JSONB
with validation and selection semantics.

## Acceptance criteria

- [x] Nested inference and validation are preserved.
- [x] PostgreSQL storage is JSONB by default.
- [x] Nested temporal, bigint, binary, and plugin values round-trip through
      schema-guided adapter codecs.
- [x] Nested indexes compile explicitly or fail setup.
- [x] Partial update behavior is an explicit deep object patch while object
      lists retain replacement semantics.

## Tests

- [x] Core compile-time and Runtime tests cover nested inference, validation,
      defaults, and partial updates.
- [x] PostgreSQL compiler tests prove JSONB storage and setup rejection for
      unsupported nested indexes.
- [x] PostgreSQL value-codec tests cover nested structured encoding, decoding,
      defaults, temporal values, bigint, binary, and malformed database values.
