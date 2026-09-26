# 4701: Consolidate Access mutation traversal

- Status: completed
- Milestone: 47
- Packages: `@ultimabase/access-plugin`
- Depends on: 4601
- ADR: ADR-0169, ADR-0171, ADR-0189, ADR-0204

## Goal

Use Core's canonical field-input traversal throughout Access mutation checks,
index materialized field values once, and remove repeated transition scans
without changing any authorization result or Runtime stage.

## Acceptance criteria

- [x] Access no longer decodes normalized update expressions independently.
- [x] Bulk upsert update values remain isolated by item index.
- [x] Materialized field values are indexed once per snapshot.
- [x] Affected fields and static transition rules use one pass each.
- [x] Prepared and materialized upsert checks both remain in place.
- [x] Production TypeScript removes more lines than it adds.
- [x] Focused and repository-wide validation pass.
- [x] Documentation impact is recorded.

## Out of scope

- Changing public Access declarations, callbacks, defaults, or errors.
- Changing Core's public update-expression contract.
- Merging prepared and outcome upsert checks.
- Reordering operation, filter, item, field, or output enforcement.

## Outcome

Access no longer parses update-expression records beside Core. It derives the
same top-level changes from `collectOperationFieldInputs`, preserving bulk item
indexes and the last-operation-per-field behavior. Materialized values are
indexed by their canonical schema field identity and concrete value path, so
transition evaluation traverses the compiled field plan once instead of
filtering every collected value for every updated field. Relation fields and
static rules now also use one pass.

Prepared-candidate checks and database-selected upsert outcome checks remain
separate. Their callbacks, defaults, errors, ordering, and fail-closed behavior
are unchanged.

## Quantitative audit

Production TypeScript adds 116 lines and removes 157 (net -41). The focused
regression test adds 28 lines. `mutation-transitions.ts` falls from 410 to 370
lines and loses its file-budget warning; `item-access.ts` falls from 397 to 396.
The complete issue diff, including issue tracking and this audit, is recorded
in the commit statistics.

## Validation

- `yarn workspace @ultimabase/access-plugin test`: 12 files, 37 tests
- `yarn typecheck`
- `yarn test`: 540 files, 2,574 tests, no type errors
- `yarn lint`: 0 errors; 50 Core, 26 package, and 2 workspace pre-existing
  file-budget warnings
- `yarn build`: every package passed build, API checks, and package linting

## Documentation impact

None. Public Access declarations, exports, defaults, callbacks, errors,
ordering, and supported integrations are unchanged; the package now reuses an
existing Core traversal internally.
