# 6316: Reconcile the historical covered-point difference

Date: 2026-10-01. Product revision: `3a5874d7`. No production change.

## Historical evidence

The task's retained command aggregate for 6320's successful `yarn validate:full`
at `2026-10-01T15:17:33.137Z` contains the complete text coverage table, even
though its separate tool response was truncated. Comparing its 516 numeric
table rows against the latest pre-correction full run finds exactly three
different rows: the global total, the Password Auth package total, and
`packages/password-auth-plugin/src/operation-handlers.ts`. Every other file
row is identical. The historical raw coverage JSON remains unavailable; this
is recovered per-file text evidence, not an invented old location map.

| Handler coverage |   6320 | Pre-correction audit |
| ---------------- | -----: | -------------------: |
| Statements       | 85.96% |               85.08% |
| Branches         | 81.81% |               80.51% |
| Lines            | 85.58% |               84.68% |

The historical uncovered-line list excludes line 374; the newer list includes
it. Current raw coverage confirms that statement 107 at line 374 has zero hits
and branch 35 at line 368 has `[0, 20]`. The global counters differ by exactly
one covered statement, branch, and line, with unchanged denominators/functions.
Password Auth's production handler and concurrent PostgreSQL test are unchanged
against 6320.

## Cause and correction

Line 374 rejects a refresh when the credential-generation compare-and-swap
loses after a successful credential read. This is the intended ADR-0268
security boundary: a refresh must not restore an invalidated generation.

The existing concurrent refresh/logout-everywhere PostgreSQL test synchronizes
entry into the operations, not the intermediate read and compare-and-swap.
It correctly accepts either legal outcome; scheduling therefore does not
guarantee this specific handler branch will execute. Its concurrent security
assertions remain intact. The old run's precise interleaving was not recorded.

The new `packages/password-auth-plugin/tests/operation-handlers.test.ts`
installs the real refresh contribution through public Core APIs, reuses the
existing deterministic transaction adapter, and supplies nominal principal/
session values. Only credential lookup and the lost compare-and-swap outcome
are controlled. It requires `PASSWORD_AUTH_INVALID_SESSION`, checks the exact
credential passed to compare-and-swap, and asserts no session rotation or
transaction commit. No adapter, Core, plugin contract, production implementation,
coverage exclusion, threshold, or existing concurrency test is changed.

## Validation

The targeted regression passes. Its first fixture iteration omitted the
existing operation type-reference privilege; declaring its reason fixed the
fixture. Root typing then identified that a `src` test must not import a
root-level test helper into the package production project; moving the test
to the existing package `tests` project fixes that boundary without changing
TypeScript configuration or adding another helper.

`yarn validate:full` passes with the required permissions from the start:
558 ordinary files/2,657 tests, 637 coverage files/2,921 tests, one metadata
file/nine tests, 17 website files/66 tests, constraints, root typing, build,
and lint with 53 existing warnings and zero errors. The new test adds 113
lines, zero production lines, zero exports, and zero declaration bytes.

| Global coverage | Covered / total | Percentage |
| --------------- | --------------: | ---------: |
| Statements      | 23,789 / 26,146 |     90.98% |
| Branches        | 14,693 / 17,384 |     84.52% |
| Functions       |   4,999 / 5,202 |     96.09% |
| Lines           | 23,065 / 25,192 |     91.55% |

All 516 final text table rows now exactly match the recovered 6320 table.
Comparing the new raw report against the saved successful pre-correction
candidate checks identical statement/function/branch maps in all 729 production
files. The only covered-status changes are statement 107 at line 374 and
branch 35's first arm at line 368: both change from uncovered to covered,
with one hit each. The latter's hits are now `[1, 20]`. There are no losses,
and the same statement adds the missing covered line. This closes the finding
without claiming access to the unavailable historical raw JSON or its precise
thread interleaving.

The second complete `yarn test:coverage` passes all 637 files/2,921 tests.
All 516 table rows, global counters, and covered locations match the first
successful full run. The targeted statement receives two hits instead of one,
and its branch hits are `[2, 19]` instead of `[1, 20]`: scheduling still varies,
but the deterministic regression guarantees the rejection remains covered.
The 2026-10-02 closure full gate provides a third complete run: 637 files/2,921
tests, identical counters and all 516 text rows, unchanged location maps and
the same two covered-point gains against the raw control, with zero losses.
Complexity/performance costs are separate from this resolved coverage finding.
The user's subsequent 2026-10-02 acceptance is recorded in
[ADR-0286](../../../docs/adr/0286-accept-source-authoring-milestone-costs.md);
coverage and current test failures are not waived. No push is authorized.
