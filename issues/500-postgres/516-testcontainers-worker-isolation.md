# 516: Add PostgreSQL Testcontainers worker isolation

- Status: completed
- Milestone: 5
- Packages: `@ultimabase/testing`, `@ultimabase/postgres-plugin`
- Depends on: 004, 501, 507
- ADR: ADR-0012, ADR-0086

## Goal

Share one container while assigning one PostgreSQL schema per Vitest worker.

## Acceptance criteria

- [x] Worker schema names are deterministic, length-bounded, and safe.
- [x] Reset drops and recreates only the current worker’s schema.
- [x] Global setup shares a serializable connection URI, not JavaScript infrastructure or applications.
- [x] Fork workers receive independent `search_path` namespaces and reusable worker slots reset before each file fixture.

## Tests

- [x] Deliberately concurrent equal-table write/read/reset isolation fixture.

The local environment does not provide the `docker` executable. Unit, type,
lint, build, and Docker-free E2E checks pass locally; the live fixture is
executed by the CI Docker runner with issue 518's complete public flow.
