# 4601: Consolidate Access Runtime decisions

- Status: completed
- Milestone: 46
- Packages: `@ultimabase/access-plugin`
- Depends on: 4501
- ADR: ADR-0169, ADR-0171, ADR-0189, ADR-0204

## Goal

Give Access one operation-family classifier, one fail-closed schema-plan reader,
and one item-decision dispatcher instead of repeating those invariants across
its Runtime modules.

## Acceptance criteria

- [x] Native operation families are classified once.
- [x] Runtime schema-plan lookup has one fail-closed implementation.
- [x] Item-rule identity and dispatch are assembled once.
- [x] Prepared and materialized upsert checks both remain in place.
- [x] Production TypeScript removes more lines than it adds.
- [x] Focused and repository-wide validation pass.
- [x] Documentation impact is recorded.

## Out of scope

- Changing public Access declarations, callbacks, defaults, or errors.
- Merging prepared and outcome upsert checks.
- Reordering operation, filter, item, field, or output enforcement.

## Outcome

All 13 native terminals now use one exhaustive Access-family map. Operation
defaults, filters, early item checks, and prepared mutations consume that same
classification. Runtime modules also share one fail-closed schema-plan reader
and one item-rule dispatcher with canonical identity and denial behavior.

Prepared upsert policy and post-write materialization policy deliberately remain
separate. The former protects the locked candidate before persistence; the
latter verifies the actual database-selected branch before commit.

## Quantitative audit

The complete issue changes 9 files with 263 additions and 197 deletions (net
+66). Production TypeScript contains 134 additions and 181 deletions (net -47).
The focused test adds 30 lines and removes one; issue tracking and the current
plan account for the remaining 99 additions and 15 deletions. `item-access.ts`
falls from 448 to 397 lines, so the package loses one file-budget warning.

## Validation

- `yarn typecheck`
- `yarn test`: 540 files, 2,573 tests, no type errors
- `yarn lint`: 0 errors; 50 Core, 27 package, and 2 workspace pre-existing
  file-budget warnings
- `yarn build`: every package passed build, API checks, and package linting
- `yarn workspace @ultimabase/access-plugin test`: 12 files, 36 tests

## Documentation impact

None. Public Access declarations, exports, defaults, callbacks, errors, ordering,
and supported integrations are unchanged; this issue only consolidates private
plan and Runtime implementation.
