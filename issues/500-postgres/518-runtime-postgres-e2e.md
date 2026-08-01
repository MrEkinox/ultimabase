# 518: Verify the first Runtime-to-PostgreSQL E2E

- Status: planned
- Milestone: 5
- Packages: `@ultimabase/testing`, `@ultimabase/postgres`, `@ultimabase/runtime`
- Depends on: 323, 504, 505, 506, 507, 512, 516
- ADR: ADR-0004, ADR-0007, ADR-0012

## Goal

Execute the first complete access-free path from a static schema through the
assembled Runtime engine into a live PostgreSQL Testcontainer.

## Acceptance criteria

- [ ] The test application uses only built public package exports.
- [ ] `postgresPlugin({ schemaPolicy: 'override' })` creates tables from the static schema without handwritten application DDL.
- [ ] Bound Queries create, find, filter, select, update, and delete live rows.
- [ ] UUID v7, `createdAt`, and `updatedAt` values cross the adapter boundary correctly.
- [ ] No role, CLP, ACL, field-permission, migration, HTTP, REST, or GraphQL plugin is installed.
- [ ] Application disposal releases the pool and Testcontainers resources.
- [ ] The scenario passes locally and on the GitHub CI Docker runner.

## Tests

- [ ] Root `tests/e2e` scenario covers the complete public flow.
- [ ] A second concurrent application or worker proves database isolation.

## Out of scope

- Bulk, upsert, and explicit transaction conformance belong to issue 508.
- The first transport-complete vertical remains issue 617.
