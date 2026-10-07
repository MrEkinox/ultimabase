# Package test ownership follow-up

User-requested second pass, 2026-09-19, following ADR-0250 and the
[first ownership handoff](2026-09-19-package-test-ownership.md).

## Delivered scope

- Core owns the direct community-option rejection and explicit relationship
  PostgreSQL suites. Their original scenarios and shared worker isolation remain.
- Hooks and Access own their manifest, Typegen, behavior, and malformed-provider
  conformance checks, with separate package fixtures. The compatible-provider
  composition scenario remains at the root and reuses the Access fixture.
- GraphiQL owns bootstrap lifecycle, browser policy, and production-disabled
  checks. Apollo Sandbox owns the explicit production override check. The former
  combined production test is split without removing any assertion. Explorer
  collisions and cross-application isolation remain at the root.
- Typegen owns its editor performance suite and probe. The package exposes
  `test:performance` and includes that suite in `test`. Root and package Vitest
  configurations discover package performance tests in a serial `performance`
  project, excluding them from unit discovery.
- Shared conformance assertions, database support, and provider-neutral explorer
  fixtures remain in `tests/fixtures`. Fixture imports never execute another suite.
- The archive command retains all extracted built-export checks. Discovery
  guards verify performance membership and Typegen package/root parity.

The root now contains 21 E2E suites and one cross-package performance suite.
Production source, exports, dependency edges, coverage thresholds, and selective
CI scheduling are unchanged. No work exceeds the approved second-pass scope.

## Validation

- All 121 top-level scenario statements from the five original suites are
  preserved exactly after parsing and normalizing formatting. The combined
  explorer production scenario becomes two tests; no assertion is removed.
- Root `yarn typecheck` and test typechecks for Core, Hooks, Access, GraphiQL,
  Apollo Sandbox, and Typegen pass.
- Focused built-export E2E: 8 files / 16 tests pass, including live PostgreSQL.
  GraphiQL's package command passes its 3 extracted tests.
- Typegen's package `test` passes 25 files / 51 tests, including the moved
  performance probe and compile-time checks. Its standalone performance command
  also passes in the isolated checkout.
- Discovery guards pass all 6 tests, including Typegen package/root parity and
  exactly-once performance selection. Active documentation checks also pass.
- `yarn build` passes in the isolated checkout containing the same implementation;
  all archive type and publication checks pass.
- All three lint stages pass with 90 existing line-budget warnings and no errors.
  The initial package lint exhausted Node's default 4 GiB heap; rerunning the
  package and workspace stages with `NODE_OPTIONS=--max-old-space-size=8192`
  succeeds without changing repository rules or configuration.
- `yarn constraints`, formatting of changed files, and `git diff --check` pass.

The coverage reference is the unchanged parent commit `260213de`: 596 files /
2,695 tests pass. The complete final `yarn test:coverage` passes 600 files /
2,698 tests, with no type errors. The three additional tests are the explorer
scenario split and two discovery guards; the original scenarios are retained.

All 702 production files retain exactly the same totals and covered counts for
each metric. No file enters or leaves the report, and no per-file metric changes.

| Metric     | Before | After  | Covered / total |
| ---------- | ------ | ------ | --------------- |
| Lines      | 89.31% | 89.31% | 24,751 / 27,712 |
| Statements | 88.76% | 88.76% | 25,469 / 28,694 |
| Functions  | 94.34% | 94.34% | 5,318 / 5,637   |
| Branches   | 81.77% | 81.77% | 15,787 / 19,305 |

The complete runs select unit, type, performance, source-aliased E2E, and
PostgreSQL E2E projects with the same two-worker coverage configuration.

## Documentation impact: internal engineering documentation

Test ownership and development commands are updated in `tests/README.md`, the
Typegen README, and the benchmark README. The affected public website pages and
source metadata need no edit: no public behavior, package export, application
configuration, installation instruction, or linked evidence path changes.
