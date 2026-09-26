# 4107: Consolidate PostgreSQL targeted mutation planning

- Status: planned
- Milestone: 41
- Packages: `@ultimabase/postgres-plugin`
- Depends on: 4106

## Goal

Share repeated target selection, constraint combination, returning projection,
and decoding mechanics across update/delete cardinalities without merging
preparation and execution phases.

## Acceptance criteria

- [ ] Singular and set-based update/delete retain exact targeting, locking,
      constraint, ordering, returning, and error behavior.
- [ ] Prepared mutation and direct adapter phases remain distinct.
- [ ] Transaction and protected-policy semantics remain unchanged.
- [ ] Production lines decrease and PostgreSQL integration coverage passes.
- [ ] Documentation impact is recorded.

## Architecture stop

Stop if the reduction requires changing Core's adapter request, persistence
plan, prepared-operation, transaction, or protected-constraint contract.
