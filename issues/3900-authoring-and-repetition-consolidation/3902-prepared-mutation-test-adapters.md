# 3902: Consolidate prepared-mutation test adapters

- Status: completed
- Milestone: 39
- Depends on: 3901

## Goal

Replace the repeated database-adapter and transaction plumbing in the Access,
Hooks, REST, and GraphQL schema-mutation fixtures with one repository-internal
test utility while keeping each product scenario explicit.

## Acceptance criteria

- [x] One internal fixture owns the shared adapter capabilities, transaction
      lifecycle, preparation capture, and direct-execution rejection.
- [x] Package fixtures retain their own rows, mutation outcomes, and trace
      semantics instead of moving product behavior into generic tooling.
- [x] Existing Access, Hooks, REST, and GraphQL schema-mutation assertions pass
      without losing observable coverage.
- [x] No public package export, Runtime contract, or production dependency
      changes.
- [x] Repeated test lines decrease and documentation impact is recorded.

## Outcome

One 135-line repository test utility now owns the common adapter capability,
transaction lifecycle, preparation capture, trace, and single-use update
outcome. The four package fixtures keep their product-specific records and
effects in 257 lines instead of repeating 516 lines of adapter plumbing, a net
fixture-support reduction of 124 lines after the shared utility is included.

The complete issue diff contains 475 added and 535 deleted lines, a net
reduction of 60 lines after tracking, lint, and TypeScript configuration are
included.

The five consuming suites moved from `src` to their existing package `tests`
directories. Test-only support no longer enters the publishable TypeScript
projects or inflates production coverage input. No Runtime code, package export,
dependency, or public behavior changed.

## Validation

- The five focused suites passed: 22 tests with no type errors.
- Access passed 12 files and 35 tests; Hooks 20 files and 83 tests; REST 18 files
  and 103 tests; GraphQL 21 files and 106 tests.
- `yarn typecheck`, the 536-file/2,554-test repository suite, `yarn lint`, and
  `yarn build` passed.
- `yarn test:coverage` passed with the same 611 files and 2,801 tests. Coverage
  increased to 90.56% statements, 83.99% branches, 95.88% functions, and
  91.17% lines because test support is no longer measured as production.

## Documentation impact

Classification: **internal engineering documentation**.

The issue and active milestone record the internal fixture boundary and
validation. Public behavior and authoring APIs are unchanged, so package and
website documentation remain accurate without edits.
