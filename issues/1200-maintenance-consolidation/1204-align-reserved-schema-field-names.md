# 1204: Align static and runtime reserved schema field names

- Status: completed
- Milestone: 12
- Packages: `@ultimabase/core`
- Depends on: 1203
- ADR: ADR-0093, ADR-0109, ADR-0132

## Goal

Derive compile-time and runtime field-name rejection from one canonical set so
a literal field never compiles and then fails only during schema compilation.

## Acceptance criteria

- [x] System fields, Query logical keys, and schema-model member names each have one immutable canonical declaration.
- [x] Static collision types and runtime guards derive from those declarations without duplicated string unions.
- [x] Every literal name rejected at runtime is rejected by source TypeScript where the exact field map is known.
- [x] `create`, `delete`, `get`, `relation`, `then`, `toJSON`, `update`, and `upsert` have matching static and runtime behavior.
- [x] Dynamic string-indexed plugin maps retain runtime validation instead of receiving a false compile-time guarantee.
- [x] Existing valid schemas, generated registries, model methods, and error identities remain unchanged.
- [x] Schema examples are reviewed for the aligned name contract.

## Tests

- [x] Runtime and compile-time matrices cover every reserved-name family.
- [x] Language-service and packed-package tests prove literal diagnostics through the public `Schema.define` surface.
- [x] Existing schema compilation and model tests pass.

## Validation evidence

- One immutable declaration now owns each system, Query logical, and model
  capability name family; public `whereLogicalKeys`, collision types, and
  runtime guards derive from those declarations.
- Runtime matrices cover all 14 reserved names for developer and dynamic
  extension maps while preserving existing error messages.
- A source language-service matrix proves all exact developer and extension
  collisions fail, while `Record<string, GenericField>` remains a runtime-only
  boundary. Packed declarations cover one literal from each reserved family.
- The Core suite passes with 197 files and 1,445 tests; the repository suite
  passes with 281 files and 1,802 tests, including compile-time coverage.
- Constraints, typecheck, lint, formatting, build, and Changesets validation
  pass. Packed-package validation passes with 5 files and 42 tests.
- The Core README, Schema guide, FieldBuilder example, and extension example
  document the aligned contract and dynamic-map exception.

## Out of scope

- Renaming existing public schema-model methods.
- Reserving speculative future transport or database names.
- Changing class-name validation.
