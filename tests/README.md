# Cross-package tests

- `e2e`: complete application behavior across multiple packages.
- `fixtures`: schemas and application configurations shared by tests.
- `performance`: guarded performance regression suites.
- `types`: compile-time public API and inference tests.

Package-local unit tests live under each package's `tests` directory.

## File conventions

- `packages/*/tests/**/*.test.ts`: package-local unit tests.
- `tests/e2e/**/*.e2e.test.ts`: cross-package end-to-end tests.
- `tests/types/**/*.test-d.ts`: compile-time type tests.

Vitest runs these conventions as distinct projects named `unit`, `e2e`, and `types`. Runtime files use isolated fork workers and may execute in parallel.

## Commands

- `yarn test`: run package unit tests and compile-time type tests.
- `yarn test:all`: run unit, type, build, cross-package E2E, and package archive checks.
- `yarn test:e2e`: build every package, then run cross-package E2E tests.
- `yarn test:pack`: build and validate every publishable package archive.
- `yarn test:coverage`: run package unit tests with V8 coverage.
- `yarn test:types`: run compile-time type tests only.
- `yarn test:watch [path]`: watch package-local unit tests, optionally filtered by path.
