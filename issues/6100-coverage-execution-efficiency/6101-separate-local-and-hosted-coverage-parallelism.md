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

Internal engineering documentation. `tests/README.md` now explains the local
four-worker default and the GitHub two-worker override. No product behavior,
package API, website contract, or production source changes.

## Outcome

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

## Validation

- focused worker-bound regression: 1 file, 29 tests
- `yarn typecheck`
- `yarn test`: 546 files, 2,589 tests, no type errors
- `yarn lint`: 0 errors; 76 pre-existing file-budget warnings reported
- `yarn build`: every package passed build, API checks, and package linting
- profiled `yarn test:coverage`: 621 files, 2,836 tests, no type errors,
  256.34 seconds
- coverage: 90.91% statements, 84.44% branches, 96.07% functions, 91.47% lines
