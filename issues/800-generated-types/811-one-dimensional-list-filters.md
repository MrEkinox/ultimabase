# 811: Generate one-dimensional field-list filters

- Status: done
- Milestone: 8
- Packages: `@ultimabase/core`, `@ultimabase/codegen`, `@ultimabase/postgres-plugin`
- Depends on: 809
- Blocks: 810
- ADR: [ADR-0176](../../docs/adr/0176-one-dimensional-field-lists.md)

## Goal

Replace nested list-depth declarations with one boolean list option and expose
compact generated filters that understand the exact element type of each
one-dimensional field list.

## Acceptance criteria

- [x] `list` accepts only `true`, `false`, or omission in TypeScript and at runtime.
- [x] Field values, defaults, validation plans, Access, and hooks preserve one list wrapper.
- [x] Multidimensional examples and current documentation use `jsonField()` instead.
- [x] The portable Query AST supports complete-list equality, element membership, candidate-set membership, emptiness, and nullability.
- [x] Codegen emits concrete filters such as `ArrayStringFilter` and exact enum, object, and plugin variants.
- [x] PostgreSQL compiles every list predicate through parameterized JSONB operations and the field storage codec.
- [x] The generated-contract and generator fingerprint versions invalidate stale declarations.

## Tests

- [x] Runtime and compile-time Core tests cover list declaration, immutable AST normalization, object paths, and builder autocomplete.
- [x] Codegen snapshots and language-service tests cover exact generated array filters.
- [x] PostgreSQL compiler and codec tests cover scalar and codec-backed list values.
- [x] Relevant package typecheck, test, lint, formatting, and build checks pass.

## Evidence

Repository typecheck, all 1,934 unit and type tests, lint, formatting, and build
pass. A live PostgreSQL regression was added for complete equality, `has`,
`hasSome`, `hasEvery`, and `isEmpty`; it could not execute in the current
environment because Testcontainers found no container runtime.
