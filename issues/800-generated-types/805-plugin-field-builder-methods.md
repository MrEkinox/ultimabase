# 805: Register plugin-owned FieldBuilder methods

- Status: done
- Milestone: 8
- Packages: `@ultimabase/core`, `@ultimabase/pg-vector-plugin`
- Depends on: 804
- ADR: [ADR-0173](../../docs/adr/0173-generated-schema-authoring.md)

## Goal

Let a configured plugin declare a named FieldBuilder method and its static type
generation contract before application schema fields resolve, using
`field.vector()` as the end-to-end proof.

## Acceptance criteria

- [x] Core exposes a neutral plugin declaration contract for one named builder method, its field factory, and its typegen description.
- [x] `pgVectorPlugin()` contributes `vector` without Core importing or naming pg-vector concepts.
- [x] `field.vector('embedding', { dimensions: 1536 })` creates the same immutable logical field as the existing `vectorField()` factory.
- [x] Method contributions record plugin ownership and reject built-in overrides, duplicates, incompatible options, and unstable declarations.
- [x] An application without the contributing plugin fails before field resolution completes.
- [x] Removing the plugin removes the method from the application declaration snapshot; issue 806 will remove it from generated output on the next generation. Existing runtime uses fail precisely during static compilation.
- [x] Two applications with different plugin graphs do not share runtime method registrations.
- [x] The contribution contains no adapter, Drizzle, PostgreSQL, transport, request, or transaction behavior.

## Tests

- [x] Core tests use two synthetic plugin methods to prove isolation and conflicts.
- [x] pg-vector runtime, type, language-service, and packed-package tests prove the public method and exact fixed-dimension value.

## Evidence

Core now runs owner-scoped, synchronous `declareFields` contributions in
dependency order before schema compilation. The application-local registry
rejects built-in overrides, duplicate owners, untrusted definitions, unstable
typegen references, asynchronous declarations, and mismatched factory results.
`pgVectorPlugin()` proves the contract through `field.vector()` while the base
Core `FieldBuilder` deliberately remains plugin-neutral until issue 806 emits
the application declaration.

Repository typecheck, unit/type tests (323 files and 1904 tests), formatting,
constraints, build, `attw`, `publint`, focused source language-service tests,
and packed Core/pg-vector tests pass. Targeted lint passes for every changed
source and test. Repository-wide lint remains blocked by a pre-existing
`restrict-template-expressions` failure in
`tests/e2e/packed-core-language-service.ts:159`, which this issue does not
modify.
