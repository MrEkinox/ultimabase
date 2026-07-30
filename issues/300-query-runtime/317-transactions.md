# 317: Implement RequestEngine transactions

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/runtime`
- Depends on: 311, 313
- ADR: ADR-0015

## Goal

Bind a transaction adapter while preserving context, capabilities, hooks, and metadata.

## Acceptance criteria

- [ ] Commit and rollback semantics are adapter-neutral.
- [ ] Transaction engines cannot escape their callback.
- [ ] Nested transaction policy is explicit.

## Tests

- [ ] Commit, rollback, thrown error, and nested-call tests.
