# Cross-package tests

- `e2e`: complete application behavior across multiple packages.
- `fixtures`: schemas and application configurations shared by tests.
- `performance`: guarded performance regression suites.

Focused package unit and compile-time tests live beside their source. A package's
`tests` directory contains only public-export and cross-domain behavior.

## File conventions

- `packages/*/src/**/*.test.ts`: focused package runtime tests.
- `packages/*/src/**/*.test-d.ts`: focused package compile-time tests.
- `packages/*/tests/**/*.test.ts`: package-level integration and public-export tests.
- `packages/*/tests/**/*.test-d.ts`: package-level compile-time integration tests.
- `tests/e2e/**/*.e2e.test.ts`: Docker-free cross-package end-to-end tests.
- `tests/e2e/**/*.postgres.e2e.test.ts`: worker-isolated PostgreSQL end-to-end tests.
- `tests/performance/**/*.performance.test.ts`: deterministic performance budgets.

Vitest runs these conventions as distinct projects named `unit`, `e2e`,
`postgres-e2e`, `performance`, and `types`. Runtime files use isolated fork
workers and may execute in parallel. Performance budgets run serially and use
structural counters rather than elapsed-time thresholds. The PostgreSQL project starts one global Testcontainer,
shares only its connection URI, and assigns a reset schema to every worker
slot. The ordinary E2E project remains Docker-free for focused package archive
checks.

`tests/tsconfig.json` associates root E2E files with the same strict TypeScript
settings used by the test runner. Editors should discover this nearby project
automatically, which preserves contextual autocomplete for schema-dependent
Access, query, and mutation APIs.

`runtime-postgres.postgres.e2e.test.ts` verifies CRUD, transactions, bulk, and
upsert persistence. `hooks-plugin-postgres.postgres.e2e.test.ts` adds the live
optional Hooks schema, field, plugin, policy, rollback, output, and post-commit vertical.
`pointer-postgres.postgres.e2e.test.ts` proves pointer CRUD, inclusion, Access,
hooks, atomicity, circular targets, and referential actions against PostgreSQL.
`relation-postgres.postgres.e2e.test.ts` proves owning and inverse relations,
all edge mutations, predicates, target Access, hooks, rollback, and cleanup.
`explicit-relationship-postgres.postgres.e2e.test.ts` proves that business-data
edges remain ordinary schemas with composite uniqueness and transactions.
`graphql-cross-transport-parity.postgres.e2e.test.ts` runs the public minimal
application through direct TypeScript, REST, networkless GraphQL, and Yoga. It
proves shared Runtime semantics plus Password Auth, HTTP session, Master
provenance, exposure, and safe application-selection boundaries.
`nested-write-public-vertical.postgres.e2e.test.ts` uses that same public
application to create, include, update, and disconnect one recursive aggregate
through all four entry points, then compares their persisted PostgreSQL graphs.
The focused nested-write suites retain the policy, lifecycle, limits, rollback,
cancellation, application-isolation, and transport-safe failure matrix.
These suites use only built public package exports and worker-isolated schemas
without transport plugins.

PostgreSQL E2E suites start real Testcontainers and therefore require a working
Docker-compatible container runtime. Package unit and type tests never require
Docker.

## Commands

- `yarn test`: run package unit tests, compile-time type tests, and deterministic performance budgets.
- `yarn test:all`: run unit, type, build, cross-package E2E, and package archive checks.
- `yarn test:e2e`: build every package, then run ordinary and PostgreSQL E2E tests.
- `yarn test:pack`: build and validate every publishable package archive.
- `yarn test:performance`: run deterministic performance regression budgets.
- `yarn test:coverage`: run unit, type, performance, ordinary E2E, and PostgreSQL
  E2E projects with V8 coverage.
- `yarn test:types`: run compile-time type tests only.
- `yarn test:watch [path]`: watch package-local unit tests, optionally filtered by path.
