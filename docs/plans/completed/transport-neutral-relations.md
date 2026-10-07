# Completed plan: transport-neutral pointers and relations

- Status: completed
- Started: 2026-08-03
- Completed: 2026-08-04
- Objective owner: `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Governing decision: [ADR-0118](../../adr/0118-transport-neutral-relations.md)
- Previous completed objective: [Fundamental Access system](fundamental-access-system.md)

## Objective

Add precisely typed pointers and queryable relations as foundational Core
concepts, then prove their complete Runtime, Access, hook, transaction, and
PostgreSQL behavior without involving REST or GraphQL.

## Verified contract

- `Pointer<TSchema>` and `Relation<TSource, TTarget>` are immutable, exactly
  typed domain values with compact packed-package hovers.
- Unique pointers model one-to-one, inverse pointers model one-to-many, and one
  owning relation plus an inverse models many-to-many.
- Relation fields never become embedded model arrays; their handles query and
  mutate independently through normal Runtime terminals.
- `connect`, `disconnect`, `set`, and `clear` share source and target Access,
  hooks, validation, and automatic or explicit transactions.
- `some`, `none`, and `every` are portable bounded Query predicates whose
  target Access constraints remain private and monotonic.
- PostgreSQL owns deterministic foreign keys, joins, indexes, synchronization,
  parameterized traversal, referential cleanup, and adapter capabilities.
- Relationship edges with application data remain ordinary two-pointer schemas
  with normal fields, indexes, Access, hooks, queries, and transactions.
- Missing and inaccessible targets are observationally identical, and no
  relationship operation materializes unbounded collections for enforcement.
- Core imports no database or transport implementation; PostgreSQL consumes
  only public Core contracts.

## Completed execution order

1. [701 — Resolve lazy relationship schema targets](../../../issues/700-extensions/701-lazy-relationship-targets.md)
2. [702 — Add pointer fields and immutable Pointer values](../../../issues/700-extensions/702-pointer-field.md)
3. [737 — Add pointer Query contracts and inclusion](../../../issues/700-extensions/737-pointer-query-contracts.md)
4. [738 — Execute pointer reads and inclusion through Runtime](../../../issues/700-extensions/738-pointer-runtime.md)
5. [739 — Compile and execute PostgreSQL pointers](../../../issues/700-extensions/739-postgres-pointer-storage.md)
6. [740 — Verify the pointer vertical against PostgreSQL](../../../issues/700-extensions/740-pointer-postgres-e2e.md)
7. [741 — Add owning and inverse relation fields](../../../issues/700-extensions/741-relation-field-contracts.md)
8. [742 — Add immutable Relation handles and scoped queries](../../../issues/700-extensions/742-relation-handle-and-query.md)
9. [743 — Execute transactional relation mutations](../../../issues/700-extensions/743-relation-mutations.md)
10. [744 — Compile and execute PostgreSQL relations](../../../issues/700-extensions/744-postgres-relation-storage.md)
11. [745 — Add portable relation predicates](../../../issues/700-extensions/745-relation-predicates.md)
12. [746 — Document explicit relationship models](../../../issues/700-extensions/746-explicit-relationship-models.md)
13. [747 — Verify and audit the complete relations vertical](../../../issues/700-extensions/747-relations-postgres-e2e.md)

## Final verification

- Core and PostgreSQL focused suites passed with compile-time type coverage.
- Repository typecheck, unit/type tests, lint, build, dependency constraints,
  formatting, and packed-package tests passed.
- The complete worker-isolated E2E project passed against live PostgreSQL
  Testcontainers using only built public exports.
