# 807: Drive public schema APIs from generated contracts

- Status: planned
- Milestone: 8
- Packages: `@ultimabase/core`
- Depends on: 806
- ADR: [ADR-0173](../../docs/adr/0173-generated-schema-authoring.md)

## Goal

Make generated application contracts the concise public typing source for
schema models, Query, mutations, Access, hooks, objects, pointers, and relations
without changing their runtime semantics.

## Acceptance criteria

- [ ] Classes returned by `Schema.define()` resolve exact item, draft, create, update, where, select, order, include, and result types from the generated registry.
- [ ] Schema and field Access receive exact selected item dependencies and reject unknown sibling fields.
- [ ] Schema hooks retain exact materialized item and original-item contracts without exposing adapter or internal AST types beyond accepted relation metadata.
- [ ] Embedded field Access and resolveInput retain exact nested value, path, and occurrence typing.
- [ ] Pointer and relation predicates, inclusion, handles, and mutation methods retain exact target schemas.
- [ ] Contextual schema extensions and indexes consume the generated sibling field contract without manual application generics.
- [ ] Missing or stale generated application entries produce an actionable diagnostic instead of silently widening to a string index or `any`.
- [ ] Runtime normalization, validation, Access, hooks, Query AST, transactions, and adapter execution remain unchanged.

## Tests

- [ ] Compile-time and language-service tests cover every public schema surface against source and packed package exports.
- [ ] Runtime regression suites prove that replacing the typing source does not alter persisted behavior.
