# Test execution audit

User-requested follow-up to the affected GitHub CI: reduce unnecessary test work
without losing production coverage or adding a custom test scheduler.

## Audit scope and findings

The first pass scanned 523 runtime test files across packages, root tests, tooling,
and website tests. Comparing 2,161 test callback bodies after removing comments
and normalizing whitespace found no exact duplicates longer than 80 characters.
This is a candidate search, not proof that no semantic duplicates exist: it does
not compare parameterized inputs, imported fixtures, or behavior equivalence.

A separate scan of package, root, and tooling tests found no duplicate literal
test names within the same describe path and no standalone unawaited
`expect(...).resolves/rejects` calls. Manual review retained two apparent smells:

- The Hooks inline-contribution test verifies successful initialization and
  disposal; an awaited exception is a failure even without an explicit `expect`.
- The PostgreSQL relation-name equality calls the function twice to check
  determinism, alongside collision and byte-length assertions.

Source IntelliSense and compiled-declaration tests protect different contracts.
Global coverage alone cannot justify deleting either. The expensive Core
completion and hover matrices already reuse services for many requests; their
individual scenarios should not be collapsed merely to reduce the test count.

## Confirmed duplicate executions

Nineteen E2E files ran both in the compiled `e2e` project and in
`coverage-e2e`, despite exclusively reading built declarations or executing
package behavior in Node subprocesses. TypeScript resolves declarations through
its own language-service host; subprocesses resolve built package exports.
Vitest source aliases do not change either execution path.

The existing `coverage-e2e` exclusion list now includes these files. Every test
body and assertion remains unchanged, and the ordinary built E2E project retains
all 64 cases. The existing discovery regression checks verify both their single
built-project membership and their explicit absence from source coverage. Other
E2E remain included by default. Production coverage includes, excludes, and
thresholds are unchanged.

| Suites                                                                 | Files | Cases | Previous hosted cumulative test duration |
| ---------------------------------------------------------------------- | ----: | ----: | ---------------------------------------: |
| Packed initializer                                                     |     1 |     6 |                                119.826 s |
| Optional-product compiled public APIs                                  |     1 |    24 |                                 75.098 s |
| Core compiled types and JavaScript consumers                           |     9 |    22 |                                 43.935 s |
| Plugin Kit and pgvector compiled types                                 |     2 |     4 |                                 14.460 s |
| ACL, GraphQL, HTTP, REST, soft-delete, Validation JavaScript consumers |     6 |     8 |                                  4.604 s |
| Total                                                                  |    19 |    64 |                                257.923 s |

Durations come from the complete coverage job in
[hosted run 35465557448](https://github.com/MrEkinox/ultimadatabase/actions/runs/35465557448).
They are cumulative per-file test durations, not elapsed workflow savings;
parallel execution, collection, and instrumentation affect wall time.

The GitHub package and transversal jobs already retain built E2E in full and
affected runs. This correction uses existing Vitest configuration and its existing
discovery guard; it adds no CI script, dependency, or scheduling abstraction.

## Validation

Fresh local reference at `4657866b`: 603 files / 2,742 tests passed in 520.06 s.
Targeted compiled E2E and discovery: 20 files / 70 tests passed in 61.62 s,
including all 64 retained E2E cases and all six discovery checks.

ESLint on the two changed TypeScript files, `yarn tsc --project tsconfig.json`,
`yarn tsc --project tooling/tsconfig/test.json`, and `yarn constraints` passed.

The complete post-change run passed 584 files / 2,678 tests in 414.17 s.
Exactly 19 files / 64 redundant cases leave the source coverage execution; their
compiled E2E run above remains intact. Both complete runs used
`yarn test:coverage` with separate temporary `--coverage.reportsDirectory`
locations, preserving the before/after JSON reports.

The comparison used `istanbul-lib-coverage` to verify identical membership of all
702 production files and identical per-file totals and covered counts. It also
compared statement/function/branch location maps and the covered/uncovered state
of every statement, function, branch arm, and line, rather than relying on rounded
global percentages. There
were zero differences in those maps and covered locations.

| Metric     | Before |  After | Covered / total, both runs |
| ---------- | -----: | -----: | -------------------------: |
| Statements | 88.76% | 88.76% |            25,469 / 28,694 |
| Branches   | 81.77% | 81.77% |            15,787 / 19,305 |
| Functions  | 94.34% | 94.34% |              5,318 / 5,637 |
| Lines      | 89.31% | 89.31% |            24,751 / 27,712 |

The observed local wall-time difference is 105.89 s (8 min 40 s to 6 min 54 s).
This is one sequential before/after sample, not a controlled benchmark: the later
run benefits from warmer caches, including a reported typecheck phase of 3.20 s
instead of 24.92 s. Do not attribute the entire difference to removed executions
or project it onto GitHub. A new hosted measurement has not been run for this
change. No production build was repeated because production sources and build
configuration were unchanged; the retained E2E validated existing compiled exports.

## Documentation impact: internal engineering documentation

This handoff and `tests/README.md` explain test execution and coverage membership.
No public API, package implementation, configuration contract, or website behavior
changes, so public documentation remains accurate. The implementation stays within
the requested audit and removes only proven redundant executions.
