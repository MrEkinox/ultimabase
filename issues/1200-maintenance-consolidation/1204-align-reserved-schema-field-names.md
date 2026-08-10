# 1204: Align static and runtime reserved schema field names

- Status: planned
- Milestone: 12
- Packages: `@ultimabase/core`
- Depends on: 1203
- ADR: ADR-0093, ADR-0109, ADR-0132

## Goal

Derive compile-time and runtime field-name rejection from one canonical set so
a literal field never compiles and then fails only during schema compilation.

## Acceptance criteria

- [ ] System fields, Query logical keys, and schema-model member names each have one immutable canonical declaration.
- [ ] Static collision types and runtime guards derive from those declarations without duplicated string unions.
- [ ] Every literal name rejected at runtime is rejected by source TypeScript where the exact field map is known.
- [ ] `create`, `delete`, `get`, `relation`, `then`, `toJSON`, `update`, and `upsert` have matching static and runtime behavior.
- [ ] Dynamic string-indexed plugin maps retain runtime validation instead of receiving a false compile-time guarantee.
- [ ] Existing valid schemas, generated registries, model methods, and error identities remain unchanged.
- [ ] Schema examples are reviewed for the aligned name contract.

## Tests

- [ ] Runtime and compile-time matrices cover every reserved-name family.
- [ ] Language-service and packed-package tests prove literal diagnostics through the public `Schema.define` surface.
- [ ] Existing schema compilation and model tests pass.

## Out of scope

- Renaming existing public schema-model methods.
- Reserving speculative future transport or database names.
- Changing class-name validation.
