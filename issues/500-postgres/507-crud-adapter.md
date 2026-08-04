# 507: Implement singular PostgreSQL CRUD

- Status: done
- Milestone: 5
- Packages: `@ultimabase/postgres-plugin`
- Depends on: 315, 505, 506
- ADR: ADR-0004, ADR-0007, ADR-0085

## Goal

Execute singular Runtime operations through PostgreSQL.

## Acceptance criteria

- [x] Find/first/get/count/exists/create/update/delete satisfy adapter contracts.
- [x] Runtime-generated UUID and timestamp values cross the PostgreSQL codec boundary unchanged.
- [x] No-match results follow nullable terminal semantics; driver no-data and constraint failures map to stable `FrameworkError` codes.
- [x] Unknown access constraints fail closed until their owning compilers exist.

## Tests

- [x] Deterministic driver-boundary conformance covers every singular operation, SQL parameters, result codecs, and failures.

Live PostgreSQL conformance was moved to issue 518 after the shared worker
isolation harness in issue 516; this issue does not duplicate container setup.
