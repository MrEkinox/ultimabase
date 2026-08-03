# 743: Execute transactional relation mutations

- Status: done
- Milestone: 7+
- Packages: `@ultimabase/core`
- Depends on: 418, 742
- ADR: ADR-0099, ADR-0100, ADR-0118

## Goal

Add `connect`, `disconnect`, `set`, and `clear` as transactional Runtime
operations instead of exposing mutable arrays or join-table commands.

## Acceptance criteria

- [x] Relation handles accept exact target Pointer values for `connect`, `disconnect`, and `set`; `clear` requires no synthetic input.
- [x] Every mutation is immutable, validates duplicate and incompatible targets, and executes through one automatic or inherited transaction.
- [x] Owning relation changes use the source schema's update lifecycle and field update Access with one typed immutable relation delta available to compatible hooks.
- [x] Inverse-pointer mutations become target pointer updates and therefore execute target validation, Access, hooks, and referential behavior.
- [x] Missing or inaccessible sources and targets do not leak object existence.
- [x] Failures in validation, Access, hooks, adapter execution, or finalization roll back the complete relationship change and nested writes.
- [x] Core never exposes direct join-row create, update, or delete operations.

## Tests

- [x] Runtime fixture-adapter matrices cover owning, inverse, replace, clear, duplicates, denial, master, hook deltas, nested execution, and rollback.

## Out of scope

- PostgreSQL storage, relation predicates, transports, and relationship-edge metadata.
