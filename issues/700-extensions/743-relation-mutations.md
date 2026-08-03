# 743: Execute transactional relation mutations

- Status: planned
- Milestone: 7+
- Packages: `@ultimabase/core`
- Depends on: 418, 742
- ADR: ADR-0099, ADR-0100, ADR-0118

## Goal

Add `connect`, `disconnect`, `set`, and `clear` as transactional Runtime
operations instead of exposing mutable arrays or join-table commands.

## Acceptance criteria

- [ ] Relation handles accept exact target Pointer values for `connect`, `disconnect`, and `set`; `clear` requires no synthetic input.
- [ ] Every mutation is immutable, validates duplicate and incompatible targets, and executes through one automatic or inherited transaction.
- [ ] Owning relation changes use the source schema's update lifecycle and field update Access with one typed immutable relation delta available to compatible hooks.
- [ ] Inverse-pointer mutations become target pointer updates and therefore execute target validation, Access, hooks, and referential behavior.
- [ ] Missing or inaccessible sources and targets do not leak object existence.
- [ ] Failures in validation, Access, hooks, adapter execution, or finalization roll back the complete relationship change and nested writes.
- [ ] Core never exposes direct join-row create, update, or delete operations.

## Tests

- [ ] Runtime fixture-adapter matrices cover owning, inverse, replace, clear, duplicates, denial, master, hook deltas, nested execution, and rollback.

## Out of scope

- PostgreSQL storage, relation predicates, transports, and relationship-edge metadata.
