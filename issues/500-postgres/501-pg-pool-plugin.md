# 501: Implement PostgreSQL connection lifecycle

- Status: ready
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 208, 311
- ADR: ADR-0007

## Goal

Create and dispose a `pg` pool through a typed database service.

## Acceptance criteria

- [ ] URL and existing-pool configurations are supported.
- [ ] Connection verification happens during lifecycle connect.
- [ ] Secrets are absent from errors and context.

## Tests

- [ ] Testcontainers connect, failure, and disposal tests.
