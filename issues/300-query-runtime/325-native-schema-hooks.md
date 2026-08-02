# 325: Declare native schema hooks

- Status: done
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 324
- ADR: ADR-0089, ADR-0096

## Goal

Add immutable, directly declared schema hook configuration with exact
operation-specific inference and documentation.

## Acceptance criteria

- [x] Schemas declare `resolveInput`, `validate`, CRUD, save, find, general operation, `beforeCommit`, `afterCommit`, `afterRollback`, and `onError` phases through the boundary selected by issue 324.
- [x] One phase handler may cover every compatible operation without requiring a family map.
- [x] Specialized family handlers retain an exact terminal `kind` discriminant and broad-to-specific before / specific-to-broad after order.
- [x] Create, update, object, query, operation, and result values use public inference contracts without exposing internal AST helper expansions in hovers.
- [x] Hook declarations are immutable snapshots but never participate in database schema hashes, migration plans, or physical diffs.
- [x] Declaration guards reject unknown phases and malformed handlers with path-aware errors; TypeScript rejects incompatible returns, while issue 330 validates values returned during execution.
- [x] Every public option and handler argument has concise English JSDoc and focused examples.
- [x] The package README shows the implemented schema-hook DX.

## Tests

- [x] Runtime declaration, immutability, unknown-key, and malformed-handler tests.
- [x] Compile-time operation narrowing, autocomplete, hover, and invalid-return tests.
- [x] Public-export and packed-declaration tests.

## Out of scope

- Inline field hooks.
- Runtime execution order.

## Result

`new Schema({ hooks })` now validates and retains immutable native schema hook
declarations outside structural metadata. The constructor never executes user
callbacks. Runtime dispatch, dynamic transform-result validation, and lifecycle
ordering remain owned by issue 330.
