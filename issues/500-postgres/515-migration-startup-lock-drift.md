# 515: Apply migrations with lock and drift protection

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres-migrations`
- Depends on: 513, 514
- ADR: ADR-0008

## Goal

Claim schema preparation, serialize concurrent startup, enforce policies, and detect drift.

## Acceptance criteria

- [ ] PostgreSQL advisory locking prevents concurrent application.
- [ ] Other instances wait then verify.
- [ ] Files, metadata, and live-schema disagreement fails safely.
- [ ] Repair requires an explicit future command.

## Tests

- [ ] Concurrent starts and drift fixtures.
