# 518: Verify the first Runtime-to-PostgreSQL E2E

- Status: implemented — live verification pending
- Milestone: 5
- Packages: `@ultimabase/testing`, `@ultimabase/postgres`, `@ultimabase/runtime`
- Depends on: 323, 504, 505, 506, 507, 512, 516
- ADR: ADR-0004, ADR-0007, ADR-0012, ADR-0087

## Goal

Execute the first complete access-free path from a static schema through the
assembled Runtime engine into a live PostgreSQL Testcontainer.

## Acceptance criteria

- [x] The test application uses only built public package exports.
- [ ] `postgresPlugin({ schemaPolicy: 'override' })` creates tables from the static schema without handwritten application DDL.
- [ ] Bound Queries create, find, filter, select, update, and delete live rows.
- [ ] UUID v7, `createdAt`, and `updatedAt` values cross the adapter boundary correctly.
- [x] No role, CLP, ACL, field-permission, migration, HTTP, REST, or GraphQL plugin is installed.
- [ ] Application disposal releases the pool and Testcontainers resources.
- [ ] The scenario passes locally and on the GitHub CI Docker runner.

## Tests

- [x] Root `tests/e2e` scenario covers the complete public flow.
- [x] A second concurrent application or worker proves database isolation.

The implementation, unit tests, typecheck, lint, build, and Docker-free checks
pass locally. This machine has no Docker-compatible runtime, so the live
Testcontainers acceptance item remains open until the GitHub CI Docker runner
executes the committed scenario.

## Out of scope

- Bulk, upsert, and explicit transaction conformance belong to issue 508.
- The first transport-complete vertical remains issue 617.
