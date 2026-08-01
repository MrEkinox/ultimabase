# ADR-0086: PostgreSQL E2E worker isolation

- Status: accepted
- Date: 2026-08-01
- Extends: ADR-0012, ADR-0050, ADR-0077

## Decision

PostgreSQL E2E tests run in a dedicated `postgres-e2e` Vitest project. Its
global setup starts one PostgreSQL Testcontainer and provides only the
serializable connection URI to fork workers. The mutable container, pools,
framework applications, schemas, and registries are never shared JavaScript
objects. The ordinary `e2e` project remains Docker-free, so package archive
verification does not start infrastructure.

Each Vitest fork receives `VITEST_POOL_ID`, the reusable worker-slot identifier.
`@ultimabase/testing` exposes the immutable `PostgresTestWorker` class and
`readVitestPoolId()` helper. They derive a deterministic, length-bounded SQL
identifier, reset only that namespace with `DROP SCHEMA ... CASCADE` followed
by `CREATE SCHEMA`, and expose a libpq `search_path` option for worker-owned
pools.

`PostgresTestWorker` accepts an administrative query callback rather than a
`pg`, Testcontainers, or `@ultimabase/postgres` object. This keeps concrete test
infrastructure at the root E2E boundary and preserves the Testing package's
dependency direction toward foundational contracts. The callback receives only
fixed SQL assembled from validated generated identifiers.

Each E2E file creates its own application and worker pool. A reset may destroy
every table inside its assigned namespace but cannot name or mutate another
worker namespace. Cleanup closes worker pools before dropping their namespace,
then closes the administrative pool. Global teardown stops the shared
container after all fork workers finish.

## Consequences

PostgreSQL test files can run in parallel while using identical logical table
names. Sequential files reused by one worker slot start from an empty namespace.
The shared container removes repeated startup cost without introducing mutable
application singletons.

Local PostgreSQL E2E execution still requires a Docker-compatible runtime. The
CI Docker runner is the authoritative live gate when a developer machine has
no container runtime.
