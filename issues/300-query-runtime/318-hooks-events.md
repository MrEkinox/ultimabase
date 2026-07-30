# 318: Implement hooks and post-commit events

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/runtime`, `@ultimabase/core`
- Depends on: 207, 312, 317
- ADR: ADR-0015

## Goal

Implement before/after operation hooks and normalized post-commit events.

## Acceptance criteria

- [ ] Schema and global hooks follow deterministic plugin order.
- [ ] Hooks receive immutable inputs and return explicit changes.
- [ ] After-hooks may abort before commit.
- [ ] External events never fire before commit.

## Tests

- [ ] Ordering, transformation, rollback, and event timing tests.
