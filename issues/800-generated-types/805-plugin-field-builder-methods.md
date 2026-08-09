# 805: Register plugin-owned FieldBuilder methods

- Status: planned
- Milestone: 8
- Packages: `@ultimabase/core`, `@ultimabase/pg-vector-plugin`
- Depends on: 804
- ADR: [ADR-0173](../../docs/adr/0173-generated-schema-authoring.md)

## Goal

Let a configured plugin declare a named FieldBuilder method and its static type
generation contract before application schema fields resolve, using
`field.vector()` as the end-to-end proof.

## Acceptance criteria

- [ ] Core exposes a neutral plugin declaration contract for one named builder method, its field factory, and its typegen description.
- [ ] `pgVectorPlugin()` contributes `vector` without Core importing or naming pg-vector concepts.
- [ ] `field.vector('embedding', { dimensions: 1536 })` creates the same immutable logical field as the existing `vectorField()` factory.
- [ ] Method contributions record plugin ownership and reject built-in overrides, duplicates, incompatible options, and unstable declarations.
- [ ] An application without the contributing plugin fails before field resolution completes.
- [ ] Removing the plugin removes the generated method on the next generation and leaves a precise compile-time and startup error at existing uses.
- [ ] Two applications with different plugin graphs do not share runtime method registrations.
- [ ] The contribution contains no adapter, Drizzle, PostgreSQL, transport, request, or transaction behavior.

## Tests

- [ ] Core tests use two synthetic plugin methods to prove isolation and conflicts.
- [ ] pg-vector runtime, type, language-service, and packed-package tests prove the public method and exact fixed-dimension value.
