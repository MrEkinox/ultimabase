# 317: Implement RequestEngine transactions

- Status: completed
- Milestone: 3
- Packages: `@ultimabase/runtime`
- Depends on: 311, 313
- ADR: ADR-0015, ADR-0068

## Goal

Bind a transaction adapter while preserving context, capabilities, hooks, and metadata.

## Acceptance criteria

- [x] Commit and rollback semantics are adapter-neutral.
- [x] Transaction engines cannot escape their callback.
- [x] Nested transaction policy is explicit.

## Tests

- [x] Commit, rollback, thrown error, and nested-call tests.
