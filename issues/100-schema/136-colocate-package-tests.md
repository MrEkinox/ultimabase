# 136: Colocate Schema tests with their sources

- Status: completed
- Milestone: 1
- Packages: schema, tooling
- Depends on: 135
- ADR: ADR-0036

## Goal

Place focused Schema runtime and compile-time tests beside the source they
protect while keeping cross-domain tests in the package-level test directory.

## Acceptance criteria

- [x] Focused tests share the directory and stem of their source file.
- [x] Public-export and cross-domain tests remain under `packages/schema/tests`.
- [x] Package and root Vitest commands discover both supported locations.
- [x] Publishable TypeScript projects and coverage exclude colocated tests.
- [x] Repository documentation explains the ownership convention.
- [x] Typecheck, tests, lint, build, package validation, and coverage pass.

## Tests

- [x] Schema workspace tests discover every moved runtime and type test.
- [x] Root test and coverage commands preserve the existing test count and production coverage contract.
- [x] Built package archives contain no test files.

## Out of scope

- Moving tests in packages other than Schema.
