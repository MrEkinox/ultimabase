# 4107: Consolidate PostgreSQL targeted mutation planning

- Status: completed
- Milestone: 41
- Packages: `@ultimabase/postgres-plugin`
- Depends on: 4106

## Goal

Share repeated target selection, constraint combination, returning projection,
and decoding mechanics across update/delete cardinalities without merging
preparation and execution phases.

## Acceptance criteria

- [x] Singular and set-based update/delete retain exact targeting, locking,
      constraint, ordering, returning, and error behavior.
- [x] Prepared mutation and direct adapter phases remain distinct.
- [x] Transaction and protected-policy semantics remain unchanged.
- [x] Production lines decrease and PostgreSQL integration coverage passes.
- [x] Documentation impact is recorded.

## Architecture stop

Stop if the reduction requires changing Core's adapter request, persistence
plan, prepared-operation, transaction, or protected-constraint contract.

## Outcome

The four direct query-targeted mutation paths now share one private execution
mechanic for clause compilation, identifier targeting, final constraint
reapplication, returning projection, and decoding. Singular writes still select
one deterministic target, while set-based writes still reapply protected
constraints to the final statement. Prepared mutation locking and retained
target execution remain separate.

The change removes 96 net handwritten production lines. Focused adapter and
prepared-operation tests, PostgreSQL package typechecking and lint, plus the
real PostgreSQL CRUD/query/relationship/bulk vertical pass.

Documentation impact: internal engineering documentation. The package README
and public website remain accurate because adapter, transaction, constraint,
and persistence-plan contracts did not change.
