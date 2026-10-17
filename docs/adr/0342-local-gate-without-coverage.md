# ADR-0342: Validate locally without coverage, once

- Status: accepted
- Date: 2026-10-17
- Refines: ADR-0291 (validation cadence)
- Approval: proposed after measuring the gate and approved by the user on 2026-10-17

## Context

Before a merge into `main`, the local gate ran `yarn validate:full` and then `yarn test:e2e:built`. Measured on a calm
machine on 2026-10-17 (`main` with ADR-0341 merged):

| Step                                                         | Time    |
| ------------------------------------------------------------ | ------- |
| format, typecheck, lint, build, performance budgets          | 277 s   |
| `test:coverage`: unit, types, E2E and PostgreSQL E2E sources | 570 s   |
| constraints and public documentation                         | 63 s    |
| `test:e2e:built`: E2E against the built packages             | ~260 s  |
| Total                                                        | ~19 min |

The E2E suites ran twice: instrumented from sources for coverage, then against the built packages. One uninstrumented
run of unit, types, E2E, PostgreSQL E2E and isolated E2E against the built packages took 394 s and passed the same
suites (782 files, 4,265 tests). GitHub CI already runs complete coverage on every push to `main` and every pull request,
so the local coverage run duplicated it.

## Decision

- `yarn validate:full` runs format, typecheck, lint, build, performance budgets, then one uninstrumented run of the
  unit, types, E2E, PostgreSQL E2E and isolated E2E projects against the built packages, then dependency constraints
  and public documentation. It replaces `yarn validate:full` followed by `yarn test:e2e:built`.
- `yarn test:coverage` remains available and stays a GitHub CI check. Coverage is no longer part of the local gate.
- Cadence is otherwise unchanged: focused tests and `yarn validate:affected` before intermediate commits,
  `yarn validate:full` before every merge into `main`, GitHub CI as the final check.

## Consequences

- The local gate takes about 12 minutes instead of about 19, and runs each suite once.
- E2E suites are checked against the built packages, as users receive them, and no longer against instrumented sources
  locally.
- A drop in coverage is found by GitHub CI after a push instead of before the merge; it is fixed at once.
- `yarn website:test`, `yarn typecheck:typescript-7` and `yarn install --immutable` stay separate checks, as before.
- **Documentation impact:** internal engineering documentation (this record, `CLAUDE.md`, `CONTRIBUTING.md` where
  they describe the gate).

## Amendment (2026-10-17): coverage per package

Decided by the user on 2026-10-17. The `Complete coverage` GitHub job (11 to 29 minutes on hosted runners, the longest
job of every complete run) measured one global figure from every suite, transversal ones included, and ran unit and
E2E suites a second time beside the package jobs. It is removed, with the root `yarn test:coverage` script.

- Each package's coverage is measured from its own suites only: its unit tests and its package-owned E2E and
  PostgreSQL E2E, run from sources through the `coverage-e2e` and `coverage-postgres-e2e` projects, which now include
  package suites only. Suites under `tests/` and other packages' tests never count. The denominator is the package's
  `src/**`.
- `tooling/vitest/package-coverage.ts` holds each package's lines, statements, functions and branches thresholds, set to
  the measured coverage floored to the integer, and stricter thresholds for single files
  (`packages/core/src/query/filters/relation.ts`). The global 80/90/88/88 thresholds are removed. The former
  `access-plugin` and `hooks-plugin` thresholds still pass and are replaced by the stricter measured floors.
- The package job runs each suite once: type tests; then unit tests and source-coverable E2E, instrumented, with
  `--coverage.include=packages/<name>/src/**/*.ts` and that package's thresholds; then performance budgets and
  built-only E2E (`tooling/vitest/built-only-e2e.ts`) uninstrumented. A package below its thresholds fails its own job.
  A package selected only because one of its suites consumes another change runs those suites without coverage.
- Source-coverable package E2E therefore run from sources in GitHub CI and no longer also against the built packages;
  `yarn validate:full` still runs every E2E against the built packages before a merge, and built-only suites keep their
  built run everywhere.
- `yarn validate:package <name...>` runs the same package job locally; `yarn validate:affected` now measures the
  coverage of each affected package. `yarn validate:full` still runs no coverage.

Measured on 2026-10-17 (lines, statements, functions, branches, in %): `core` 92.35, 91.86, 96.13, 85.93 (12,038 lines);
`access-plugin` 87.21, 86.15, 91, 76.89; `hooks-plugin` 93.8, 92.93, 96.98, 84.37; `rest-plugin` 92.29, 90.05, 93.68,
81.82; `postgres-plugin` 90.17, 89.87, 95.26, 79.76; `graphql-plugin` 93.04, 91.77, 96.57, 81.38. The fourteen other
packages are between 83 and 100 on lines. The lowest are `auth-plugin` 60.52, 58.84, 53.92, 41.83, `testing` 67.91,
67.18, 70.79, 56.32 and `plugin-kit` 70.7, 69.09, 65.71, 67.17: their behaviour is mostly exercised by other packages'
and transversal suites, which no longer count. `shared`, `api-server`, `pg-vector-plugin` and `graphql-explorer-plugin`
are at 100 with few lines; `graphql-http` has 21 lines.

**Documentation impact:** internal engineering documentation (this amendment, `tests/README.md`,
`tooling/ci/README.md`, `CLAUDE.md`).
