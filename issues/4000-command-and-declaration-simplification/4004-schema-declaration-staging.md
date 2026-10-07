# 4004: Simplify schema declaration staging

- Status: completed
- Milestone: 40
- Packages: `@ultimabase/core`
- Depends on: 4003
- ADR: none

## Goal

Consolidate repeated schema add/claim staging mechanics inside the existing
transactional declaration registry without introducing a generic registry.

## Acceptance criteria

- [x] Add and claim share their common normalization and staging path.
- [x] Their distinct root-membership, ownership, duplicate, and diagnostic
      semantics remain unchanged.
- [x] Atomic publication and application-local schema identity remain intact.
- [x] Handwritten production lines decrease and focused tests pass.
- [x] Documentation impact is recorded.

## Out of scope

- Generalizing field, schema, model, and private-storage declarations behind
  one registry abstraction.

## Outcome

`schemas.add()` and `schemas.claim()` now call one declaration-session staging
function for open/privilege validation, plain-object checking, contribution ID
validation, static-option snapshotting, owner attribution, and immutable source
creation. The function then writes to the original distinct additions or claims
list.

Their structurally identical internal source records now share one internal
contract. Compilation still applies the existing separate rules: additions
enter staging as plugin-provided schemas, while claims must match an exact
schema already present in the application root list. Duplicate IDs, atomic
publication, provenance, and diagnostics are unchanged.

Handwritten production TypeScript contains 33 additions and 47 deletions, a net
reduction of 14 lines. The registry decreases from 441 to 433 lines. A separate
61-line regression suite protects the plain-object, contribution ID, and static
options diagnostics for both source kinds without pushing the existing registry
suite over its 700-line test budget.

## Validation

- Five focused registry, source-staging, type, patch, and application-surface
  suites passed: 25 tests with no type errors.
- The complete Core suite passed: 237 files and 1,091 tests, with no type
  errors.
- `yarn workspace @ultimabase/core typecheck` passed.
- `yarn workspace @ultimabase/core build` passed, including package export
  validation.
- Focused ESLint passed with only the two pre-existing line-budget warnings.
- `yarn check:issues` and `git diff --check` passed.

## Documentation impact

Classification: **internal engineering documentation**.

This issue and `CURRENT_PLAN.md` record the private staging consolidation.
Public registrar methods, behavior, errors, configuration, and examples are
unchanged, so package and website documentation remain accurate.
