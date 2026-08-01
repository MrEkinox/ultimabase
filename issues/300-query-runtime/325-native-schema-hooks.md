# 325: Declare native schema hooks

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/schema`, `@ultimabase/runtime`
- Depends on: 324
- ADR: ADR-0089

## Goal

Add immutable, directly declared schema hook configuration with exact
operation-specific inference and documentation.

## Acceptance criteria

- [ ] Schemas declare `resolveInput`, `validate`, CRUD, save, find, general operation, `beforeCommit`, `afterCommit`, `afterRollback`, and `onError` phases through the boundary selected by issue 324.
- [ ] One phase handler may cover every compatible operation without requiring a family map.
- [ ] Specialized family handlers retain an exact terminal `kind` discriminant and broad-to-specific before / specific-to-broad after order.
- [ ] Create, update, object, query, operation, and result values use public inference contracts without exposing internal AST helper expansions in hovers.
- [ ] Hook declarations are immutable snapshots but never participate in database schema hashes, migration plans, or physical diffs.
- [ ] Runtime guards reject unknown phases, malformed handlers, and incompatible return shapes with path-aware errors.
- [ ] Every public option and handler argument has concise English JSDoc and focused examples.
- [ ] The package README shows the implemented schema-hook DX.

## Tests

- [ ] Runtime declaration, immutability, unknown-key, and malformed-handler tests.
- [ ] Compile-time operation narrowing, autocomplete, hover, and invalid-return tests.
- [ ] Public-export and packed-declaration tests.

## Out of scope

- Inline field hooks.
- Runtime execution order.
