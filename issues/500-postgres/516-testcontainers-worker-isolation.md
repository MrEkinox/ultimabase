# 516: Add PostgreSQL Testcontainers worker isolation

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/testing`, `@ultimabase/postgres`
- Depends on: 004, 501, 507
- ADR: ADR-0012

## Goal

Share one container while assigning one PostgreSQL schema per Vitest worker.

## Acceptance criteria

- [ ] Worker schema names are deterministic and safe.
- [ ] Reset truncates only the current worker’s tables.
- [ ] Global setup shares connection data, not JavaScript applications.
- [ ] Parallel test files do not interfere.

## Tests

- [ ] Deliberately concurrent write/read isolation fixture.
