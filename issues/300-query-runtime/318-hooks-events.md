# 318: Implement hooks and post-commit events

- Status: done
- Milestone: 3
- Packages: `@ultimabase/runtime`, `@ultimabase/core`
- Depends on: 207, 312, 317
- ADR: ADR-0015, ADR-0070

## Goal

Implement before/after operation hooks and normalized post-commit events.

## Acceptance criteria

- [x] Schema and global hooks follow deterministic plugin order.
- [x] Hooks receive immutable inputs and return explicit changes.
- [x] After-hooks may abort before commit.
- [x] External events never fire before commit.

## Tests

- [x] Ordering, transformation, rollback, and event timing tests.
