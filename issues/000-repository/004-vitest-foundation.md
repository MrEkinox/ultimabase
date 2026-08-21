# 004: Configure Vitest projects

- Status: completed
- Milestone: 0
- Packages: all
- Depends on: 001
- ADR: ADR-0012

## Goal

Provide fast isolated unit, integration, and type-test projects.

## Acceptance criteria

- [x] Unit and integration patterns are distinct.
- [x] Tests run in parallel processes.
- [x] Coverage uses V8 and excludes generated output.
- [x] Watch mode works for package-local tests.

## Tests

- [x] Add one smoke test in a foundational package.
- [x] Verify failures return a non-zero status.

## Implementation notes

- Native Vitest projects separate package-local unit tests, cross-package E2E tests, and compile-time type tests.
- Every package owns a local `tests` directory and can run its suite independently; root E2E tests compose multiple public packages.
- The first E2E smoke test loads the built Schema and Runtime packages through their public export maps.
- Runtime test files execute in isolated fork workers with file-level parallelism enabled.
- V8 coverage targets package source files and excludes declarations, generated files, and build output.
- Vitest is pinned because its native type-testing feature is experimental.
- A temporary failing fixture returned status code `1` and was reverted after verification.
- `yarn test:watch packages/shared/tests/index.test.ts` keeps the unit project active for package-local changes.
