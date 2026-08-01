# 501: Implement PostgreSQL connection lifecycle

- Status: done
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 208, 311
- ADR: ADR-0007, ADR-0077

## Goal

Create and dispose a `pg` pool through a typed database service.

## Acceptance criteria

- [x] URL and existing-pool configurations are supported.
- [x] Connection verification happens during lifecycle connect.
- [x] Secrets are absent from errors and context.

## Tests

- [x] Testcontainers connect, failure, and disposal tests.

## Validation

- Package runtime and compile-time tests cover ownership, single-flight
  verification, concurrent closure, sanitized failures, and public exports.
- The root Testcontainers suite covers a real connection, injected-pool
  ownership, startup failure, and cleanup. It requires Docker and is executed by
  `yarn test:e2e` and CI; the implementation environment used for this issue did
  not provide the `docker` executable.
