# 4101: Consolidate operation execution selection

- Status: completed
- Milestone: 41
- Packages: `@ultimabase/core`
- Depends on: none
- ADR: ADR-0153

## Goal

Make single operations, atomic batches, and static schema mutations share one
private active-or-explicit application selection boundary.

## Acceptance criteria

- [x] Explicit owner validation, active-application conflicts, missing-context
      failures, root executor creation, and result binding retain their exact
      behavior.
- [x] One private selection result replaces repeated WeakMap and active-scope
      resolution.
- [x] Hook leases, authority options, batch transactions, and schema-mutation
      dispatch remain unchanged.
- [x] Handwritten production lines decrease and focused parity tests pass.
- [x] Documentation impact is recorded.

## Out of scope

- Changing `OperationOptions` or application selection semantics.
- Adding a global/default application.
- Moving authority or execution ownership into Query ASTs.

## Outcome

One private immutable selection now resolves and validates the ambient and
explicit owners for single operations, atomic batches, and static schema
mutations. The three public paths retain their existing dispatch, executor, and
result-binding behavior while the production implementation decreases by 32
lines.

The regression test exercises the same foreign-owner rejection through all
three paths while an application is active.

## Validation

- `yarn workspace @ultimabase/core typecheck`
- `yarn vitest run --project unit packages/core/src/query/operations`
- `yarn eslint packages/core/src/query/operations/execution.ts packages/core/src/query/operations/execution.test.ts`
  (passes with the pre-existing `max-lines` warning; the file decreased from
  534 to 502 lines)
- `yarn check:issues`
- `git diff --check`

## Documentation impact

Internal engineering documentation. Application ownership and operation
behavior are unchanged, so the public website and package README remain
accurate; this issue and the milestone plan record the private consolidation.
