# ADR-0087: Runtime-to-PostgreSQL E2E boundary

- Status: accepted
- Date: 2026-08-01
- Extends: ADR-0004, ADR-0007, ADR-0026, ADR-0072, ADR-0073, ADR-0085, ADR-0086

## Decision

The first live persistence vertical is verified from built public package
exports. A root PostgreSQL E2E test defines a static schema, starts an
application containing only `postgresPlugin({ schemaPolicy: 'override' })`,
assembles its Runtime engine, and executes singular CRUD through a bound
`Query`. Application code neither imports Drizzle nor creates its table with
SQL.

The scenario covers creation, filtering, projection, update, deletion, and
empty-state reads. It also verifies that Runtime-generated UUID v7 identifiers
and operation-clock timestamps survive the adapter boundary. Application
disposal must close the URL-owned pool; the worker fixture then removes its
isolated schema, and global teardown stops the shared Testcontainer.

PostgreSQL textual `timestamp` and `time` results are not themselves valid
UltimaBase temporal values: PostgreSQL may use a space separator, omit
millisecond zeroes, and shorten timezone offsets. The private PostgreSQL codec
normalizes those driver values before reapplying Schema's scalar snapshot
capability. Zoned date-times are returned as canonical UTC ISO strings because
PostgreSQL stores their represented instant rather than their original offset.
JSONB temporal strings remain unchanged because PostgreSQL does not reinterpret
their representation.

The Docker-backed test stays in the dedicated `postgres-e2e` Vitest project.
The CI Docker runner is the authoritative live gate when a contributor's local
machine has no compatible container runtime.

## Consequences

The implemented public flow now has one executable integration specification
across Schema, Core, Runtime, Query, Drizzle, and PostgreSQL. The test does not
install or imply roles, CLP, ACL, field permissions, migrations, HTTP, REST, or
GraphQL.

Bulk operations, upserts, explicit Runtime transactions, access enforcement,
and transports remain later milestones. A green unit suite cannot substitute
for the Docker-backed CI result of this scenario.
