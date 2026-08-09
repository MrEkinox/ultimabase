# 807: Drive public schema APIs from generated contracts

- Status: completed
- Milestone: 8
- Packages: `@ultimabase/core`, `@ultimabase/codegen`
- Depends on: 806
- ADR: [ADR-0173](../../docs/adr/0173-generated-schema-authoring.md)

## Goal

Make generated application contracts the concise public typing source for
schema models, Query, mutations, Access, hooks, objects, pointers, and relations
without changing their runtime semantics.

## Acceptance criteria

- [x] Classes returned by `Schema.define()` resolve exact item, draft, create, update, where, select, order, include, and result types from the generated registry.
- [x] Schema Access receives exact generated item, create, update, where, and order contracts; field Access retains its exact current field-value contract.
- [x] Schema hooks retain exact materialized item and original-item contracts without exposing adapter or internal AST types beyond accepted relation metadata.
- [x] Embedded field Access and resolveInput retain exact nested value, path, and occurrence typing.
- [x] Pointer and relation predicates, inclusion, handles, and mutation methods retain exact target schemas.
- [x] Contextual schema extensions and indexes consume the generated sibling field contract without manual application generics.
- [x] Missing or stale generated application entries produce an actionable diagnostic instead of silently widening to a string index or `any`.
- [x] Runtime normalization, validation, Access, hooks, Query AST, transactions, and adapter execution remain unchanged.

Field Access does not gain sibling-item dependencies in this typing migration.
That capability requires a real Runtime loading contract rather than a
type-only promise and is tracked separately by
[issue 439](../400-access/439-field-access-sibling-dependencies.md).

## Tests

- [x] Compile-time and language-service tests cover every public schema surface against source and packed package exports.
- [x] Runtime regression suites prove that replacing the typing source does not alter persisted behavior.

## Evidence

Generated declarations now augment Core with one application-owned schema and
FieldBuilder registry. Literal schema names select compact model, operation,
Access, hook, extension, object-path, pointer, and relation contracts while
field-map declarations retain their existing local inference. Generated
pointer handles and relation mutation inputs correlate targets by stable class
name; the unchanged Runtime still verifies concrete schema identity.

Language-service tests exercise the actual public Core APIs against source and
packed exports, including plugin methods, nested field rules, numeric update
operators, relationship reads and mutations, stale schema diagnostics, and
index rejection. Repository typecheck, unit/type tests, lint, formatting,
constraints, build, and the focused packed-package E2E test pass.
