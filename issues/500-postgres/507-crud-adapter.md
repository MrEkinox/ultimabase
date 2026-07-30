# 507: Implement singular PostgreSQL CRUD

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/postgres`
- Depends on: 315, 505, 506
- ADR: ADR-0004, ADR-0007

## Goal

Execute singular Runtime operations through PostgreSQL.

## Acceptance criteria

- [ ] Find/get/count/exists/create/update/delete satisfy adapter contracts.
- [ ] UUID and timestamps are generated consistently.
- [ ] Not-found and constraint errors map to FrameworkError codes.

## Tests

- [ ] Adapter conformance suite through Testcontainers.
