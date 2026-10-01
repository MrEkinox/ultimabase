# 6101: Separate local and hosted coverage parallelism

- Status: completed
- Milestone: 61
- Packages: repository tooling
- Depends on: none
- ADR: none

## Goal

Use the measured four-worker local coverage configuration without reintroducing
the memory contention that previously made GitHub coverage unreliable.

## Acceptance criteria

- [x] `yarn test:coverage` uses four workers locally.
- [x] The GitHub complete-coverage job forces Vitest to use two workers.
- [x] No test project, production file, reporter, threshold, or assertion is
      removed or skipped.
- [x] A regression test protects both worker limits.
- [x] The resolved performance project retains exactly one worker locally and
      in hosted CI; both environments are covered through the real Yarn command.
- [x] The complete run is profiled and its slowest tests are explained.
- [x] Every standard repository validation gate passes.
- [x] Documentation impact is recorded.

## Out of scope

- Raising GitHub coverage above two workers.
- Introducing a custom test scheduler or coverage-merging pipeline.
- Removing type, performance, E2E, PostgreSQL, browser, or language-service
  coverage.
- Reorganizing slow suites before their cost is measured and justified.

## Documentation impact

Internal engineering documentation. `tests/README.md` and `tooling/ci/README.md`
explain the local four-worker default, GitHub two-worker override, and serial
performance scheduling. No product behavior, package API, website contract, or
production source changes; the existing public documentation remains accurate.

## Original outcome

The existing `yarn test:coverage` command now uses four workers locally. The
GitHub complete-coverage job sets Vitest's native `VITEST_MAX_WORKERS=2`
override, preserving the bound introduced after hosted-runner memory
contention. A discovery regression test protects both values. No project,
reporter, threshold, source include, test, or assertion changed membership.

The comparable local complete run fell from 433.38 seconds with two workers to
256.34 seconds with four workers, a 177.04-second or 40.9% reduction. The
profiled run passed 621 files and 2,836 tests.

## Profile findings

Language-service tests dominate cumulative file execution time:

- 44 editor/language-service files: 385.49 seconds, 72.7% of cumulative file
  time;
- 55 PostgreSQL files: 56.04 seconds, 10.6%;
- seven tooling files: 27.53 seconds, 5.2%;
- 515 remaining files: 61.34 seconds, 11.6%.

The slowest file is Core's `field-autocomplete.test.ts` at 83.55 seconds. Its
completion and inserted-hover matrices already reuse services, but its 14
compact-signature cases each create a complete TypeScript language service.
Access and Hooks IntelliSense tests similarly rebuild a service for multiple
markers in the same source. Issue 6102 records the bounded follow-up to share
those programs without dropping any editor assertion.

The other leading costs are justified by their contracts: Typegen compiles
distinct generated application programs; Create App starts generated servers,
builds TypeScript output, and uses real PostgreSQL; performance tests retain
editor regression budgets; CI planning and discovery tests execute real Git,
Yarn, and Vitest child processes. They should not be removed merely for timing.

## Original validation

- focused worker-bound regression: 1 file, 29 tests
- `yarn typecheck`
- `yarn test`: 546 files, 2,589 tests, no type errors
- `yarn lint`: 0 errors; 76 pre-existing file-budget warnings reported
- `yarn build`: every package passed build, API checks, and package linting
- profiled `yarn test:coverage`: 621 files, 2,836 tests, no type errors,
  256.34 seconds
- coverage: 90.91% statements, 84.44% branches, 96.07% functions, 91.47% lines

## 2026-10-02 CI follow-up

The user approved reopening this issue after the post-milestone-63 run
[36936299432](https://github.com/MrEkinox/ultimadatabase/actions/runs/36936299432)
timed out the Typegen editor (60 seconds) and hybrid authoring (180 seconds)
benchmarks. All other validation jobs passed. The log timestamps prove that
both benchmarks overlapped each other and ordinary suites.

Vitest 4.1.11 applies `VITEST_MAX_WORKERS` after resolving serial projects'
one-worker limit. The native CI override therefore resolved performance to two
workers, bypassing Vitest's isolated serial scheduling group. Passing the bound
through CLI preserves two ordinary CI workers and one performance worker.
Yarn's portable shell supplies the four-worker local default without a wrapper,
additional dependency, or custom scheduler. Projects, budgets, timeouts,
assertions, coverage inclusion, and thresholds remain unchanged.

The replacement regression resolves the actual coverage command and project
configuration using public Vitest APIs, rather than checking script strings
alone. It fails on the original configuration and checks both local and CI
limits plus complete project membership.

### Follow-up validation and audit

- Discovery regression: 1 file, 30 tests; the new cases fail against the original
  command/workflow and pass after the correction.
- Both previously failing Typegen benchmarks pass with CLI `maxWorkers=2`:
  2 files, 2 tests, 180.66 seconds combined. Their individual 60/180-second
  timeouts and all budgets are unchanged.
- `ULTIMABASE_COVERAGE_WORKERS=2 yarn validate:full` passes with the necessary
  local Docker/browser/network permissions supplied from its first launch.
  Ordinary tests: 558 files, 2,658 tests, 264.42 seconds, no type errors.
  Complete coverage: 637 files, 2,922 tests, 633.00 seconds, no type errors.
  Format, typecheck, lint, build, API/package checks, dependency constraints,
  issue metadata (1 file, 9 tests), and website validation (17 files, 66 tests)
  pass. Lint retains 53 Core, 29 package, and 1 workspace warnings, with zero
  errors and no new warning.
- Coverage matches the saved pre-fix control exactly across all 729 production
  files: unchanged statement/function/branch maps and zero changed or lost
  covered locations. Statements: 23,789/26,146 (90.98%); branches:
  14,693/17,384 (84.52%); functions: 4,999/5,202 (96.09%); lines:
  23,065/25,192 (91.55%).
- No production TypeScript, public API, dependency, custom wrapper/scheduler,
  existing suite membership, coverage threshold, or timeout changes. The one extra test
  is the split local/CI resolved-configuration regression. Historical profile
  measurements above are not compared with this newer two-worker run.
- No implementation exceeds the original worker-safety and regression criteria.
  Hosted confirmation remains pending the next explicitly authorized push;
  local success with CI worker settings is not a claim of green hosted CI.

Local evidence: `/private/tmp/ultimabase-6101-performance.log`,
`/private/tmp/ultimabase-6101-validation-full.log`, and the saved raw control
`/private/tmp/ultimabase-6101-coverage-before.json`.
