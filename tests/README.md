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

Vitest runs these conventions as distinct projects named `unit`, `e2e`,
`postgres-e2e`, and `types`. Runtime files use isolated fork workers and may
execute in parallel. The PostgreSQL project starts one global Testcontainer,
shares only its connection URI, and assigns a reset schema to every worker
slot. The ordinary E2E project remains Docker-free for focused package archive
checks.

`runtime-postgres.postgres.e2e.test.ts` is the first complete persistence
vertical. It uses only built public package exports and verifies schema
preparation plus singular CRUD without access or transport plugins.

PostgreSQL E2E suites start real Testcontainers and therefore require a working
Docker-compatible container runtime. Package unit and type tests never require
Docker.

## Commands

- `yarn test`: run package unit tests and compile-time type tests.
- `yarn test:all`: run unit, type, build, cross-package E2E, and package archive checks.
- `yarn test:e2e`: build every package, then run ordinary and PostgreSQL E2E tests.
- `yarn test:pack`: build and validate every publishable package archive.
- `yarn test:coverage`: run package unit tests with V8 coverage.
- `yarn test:types`: run compile-time type tests only.
- `yarn test:watch [path]`: watch package-local unit tests, optionally filtered by path.
