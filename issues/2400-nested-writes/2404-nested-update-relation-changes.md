# 2404: Execute nested update and relation changes

- Status: planned
- Milestone: 24
- Packages: `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Depends on: 2403
- ADR: ADR-0243

## Goal

Complete singular nested writes with pointer `update`/`disconnect` and relation
`update`/`disconnect`/`set`/`clear`, then project the final root result.

## Acceptance criteria

- [ ] Pointer update targets only the currently linked visible object and runs
      its complete standalone update lifecycle; pointer disconnect respects
      requiredness and accepted referential semantics.
- [ ] Relation update targets only an object currently visible through the
      source relation; unrelated, absent, and hidden IDs have the same protected
      failure.
- [ ] Disconnect changes only membership. Set atomically replaces exact visible
      membership, clear removes membership, and none deletes target objects.
- [ ] Combined incremental commands follow ADR-0243's fixed order while all
      duplicates and contradictions fail before the first Runtime effect;
      replacement commands remain exclusive.
- [ ] Owning, inverse-relation, and inverse-pointer fields retain exact source
      field Access, target mutation Access, Hooks, ACL, constraint, and relation
      delta semantics.
- [ ] Root `include` projection occurs at the accepted transaction point after
      the graph completes and applies existing target read Access and output
      restrictions without replaying root mutation Hooks.
- [ ] Recursive mixed create/update graphs remain bounded, deterministic,
      atomic, isolated, and rollback-safe across multiple applications.

## Tests

- [ ] Fixture-adapter and PostgreSQL matrices cover every command, legal
      combination, conflict, required pointer, inverse mapping, target policy,
      Hook order, projection, recursive limit, concurrent application, and
      rollback boundary.

## Out of scope

- Nested delete/upsert, root bulk nesting, transport decoding, and new adapter
  statement families.
