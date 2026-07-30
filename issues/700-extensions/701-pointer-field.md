# 701: Add pointer fields

- Status: planned
- Milestone: 7+
- Packages: schema, query, postgres, transports
- Depends on: 617
- ADR: new ADR required

## Goal

Add typed single-object pointers with lazy schema targets, PostgreSQL foreign keys, include selection, and access-aware serialization.

## Acceptance criteria

- [ ] Circular schema declarations are supported safely.
- [ ] Foreign-key actions are explicit.
- [ ] Inaccessible targets serialize without existence leakage.
