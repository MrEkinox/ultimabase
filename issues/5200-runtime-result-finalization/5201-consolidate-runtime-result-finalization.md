# 5201: Consolidate Runtime result finalization

- Status: completed
- Milestone: 52
- Package: `@ultimabase/core`
- Depends on: 5101
- ADR: ADR-0189, ADR-0243, ADR-0259

## Goal

Make one private Core function own the terminal result order shared by native
Runtime operations and plugin schema mutations without merging their logical
and physical execution paths.

## Acceptance criteria

- [x] One private helper owns protected database-result projection, result
      behaviors, inclusion hydration, model metadata, virtual resolution,
      protected final output, commit, and post-commit delivery.
- [x] Native Runtime and plugin schema mutations both use that helper.
- [x] Plugin schema mutation stages continue to observe only the logical
      `plugin-schema-mutation` identity while snapshots and virtual fields use
      the physical update/delete operation.
- [x] Cancellation remains checked immediately before commit.
- [x] Existing ordering, boundary, virtual-field, inclusion, model metadata,
      and schema-mutation regression suites pass.
- [x] No public export, capability, stage, or behavior changes.
- [x] Production TypeScript removes more lines than it adds.
- [x] Focused and repository-wide validation pass.
- [x] Documentation impact is recorded.

## Out of scope

- Nested-write graph normalization or scheduling.
- Mutation preparation, persistence plans, effects, or inclusion-source policy.
- Public Runtime stage or plugin-author API changes.
- Generalizing eager-inclusion finalization, which intentionally omits root
  result behaviors and commit effects.

## Documentation impact

Internal engineering documentation. The milestone, issue, invariants, and line
audit are recorded here and in `CURRENT_PLAN.md`. No package README, public
website page, schema example, or ADR changes because the public Runtime stages,
plugin authoring surface, operation semantics, and accepted architecture remain
unchanged.

## Outcome

`finalizeRuntimeOperationResult()` now owns protected pre-hydration projection,
database-result behavior, inclusion hydration, model metadata retention,
virtual-field resolution, final result behavior and restrictions, cancellation,
commit, and post-commit delivery. Each caller still owns persistence and
inclusion-source selection. Plugin schema mutation stages retain the logical
`plugin-schema-mutation` identity while physical snapshots and virtual fields
retain the exact update/delete operation.

The native pipeline fell from 599 to 503 lines and the schema-mutation pipeline
from 578 to 504. Production TypeScript added 211 lines and removed 239, a net
reduction of 28. Focused validation passed 13 files and 56 tests. Repository-wide
typecheck, 545 files with 2,581 tests, lint with zero errors, and the complete
build pass.
