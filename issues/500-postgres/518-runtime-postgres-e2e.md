# 518: Verify the first Runtime-to-PostgreSQL E2E

- Status: completed
- Milestone: 5
- Packages: `@ultimabase/testing`, `@ultimabase/postgres-plugin`, `@ultimabase/runtime`
- Depends on: 323, 504, 505, 506, 507, 512, 516
- ADR: ADR-0004, ADR-0007, ADR-0012, ADR-0087

## Goal

Execute the first complete access-free path from a static schema through the
assembled Runtime engine into a live PostgreSQL Testcontainer.

## Acceptance criteria

- [x] The test application uses only built public package exports.
- [x] `postgresPlugin({ schemaPolicy: 'override' })` creates tables from the static schema without handwritten application DDL.
- [x] Bound Queries create, find, filter, select, update, and delete live rows.
- [x] UUID v7, `createdAt`, and `updatedAt` values cross the adapter boundary correctly.
- [x] No role, CLP, ACL, field-permission, migration, HTTP, REST, or GraphQL plugin is installed.
- [x] Application disposal releases the pool and Testcontainers resources.
- [x] The scenario passes locally and on the GitHub CI Docker runner.

## Tests

- [x] Root `tests/e2e` scenario covers the complete public flow.
- [x] A second concurrent application or worker proves database isolation.

The implementation, unit tests, typecheck, lint, build, and Docker-free checks
pass locally. [GitHub CI run 148](https://github.com/MrEkinox/ultimadatabase/actions/runs/30697245025)
passes the complete Docker-backed suite with 42 E2E tests, including the live
Runtime-to-PostgreSQL flow and concurrent worker isolation.

## Out of scope

- Bulk, upsert, and explicit transaction conformance belong to issue 508.
- The first transport-complete vertical remains issue 617.
