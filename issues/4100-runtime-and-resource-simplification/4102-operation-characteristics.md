# 4102: Centralize operation characteristics

- Status: completed
- Milestone: 41
- Packages: `@ultimabase/core`
- Depends on: 4101

## Goal

Derive repeated closed-operation classifications from one private canonical
description while retaining each consumer's focused predicate.

## Acceptance criteria

- [x] Mutation, automatic-transaction, result-cardinality, nullability, and
      query-backed classifications have one internal source of truth where
      their current semantics are identical.
- [x] Distinct classifications remain distinct instead of being flattened.
- [x] No public operation kind, AST, result, or Runtime stage changes.
- [x] Production lines decrease and exhaustive tests cover every operation kind.
- [x] Documentation impact is recorded.

## Outcome

Runtime now owns one private operation-characteristics module for mutation,
record/scalar and collection cardinality, nullable results, eager-inclusion
eligibility, and direct Query ownership. Consumers keep narrowly named
predicates, so classifications that only look similar are not merged.

The redundant pipeline mutation switch and automatic-transaction selector were
removed. Automatic transactions now consume the same mutation predicate as the
database pipeline. Handwritten production code decreases by 13 lines, and the
replacement exhaustive test covers all 13 operation kinds and every retained
trait in 62 lines; it also replaces the former 57-line transaction-only test.

## Validation

- `yarn workspace @ultimabase/core typecheck`
- focused unit suite: 7 files and 45 tests passed across characteristics,
  Runtime boundaries, virtual projections, enforcement, and request engines
- focused ESLint passed with only four pre-existing `max-lines` warnings
- `git diff --check`

## Documentation impact

Internal engineering documentation. This is a private Runtime consolidation;
public operation kinds, results, transactions, and package exports are
unchanged, so existing package and website documentation remains accurate.
