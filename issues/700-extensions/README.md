# Milestone 7+ — Relations and planned extensions

The completed transport-neutral pointer and relation objective created no new
package: the logical declaration, Query, Access, hook, and Runtime contracts
belong to `@ultimabase/core`, while physical foreign keys and join storage
belong to `@ultimabase/postgres-plugin`.

## Completed relations vertical

The transport-neutral pointer and relation objective completed in this
dependency order:

1. [701 — Resolve lazy relationship schema targets](701-lazy-relationship-targets.md)
2. [702 — Add pointer fields and immutable Pointer values](702-pointer-field.md)
3. [737 — Add pointer Query contracts and inclusion](737-pointer-query-contracts.md)
4. [738 — Execute pointer reads and inclusion through Runtime](738-pointer-runtime.md)
5. [739 — Compile and execute PostgreSQL pointers](739-postgres-pointer-storage.md)
6. [740 — Verify the pointer vertical against PostgreSQL](740-pointer-postgres-e2e.md)
7. [741 — Add owning and inverse relation fields](741-relation-field-contracts.md)
8. [742 — Add immutable Relation handles and scoped queries](742-relation-handle-and-query.md)
9. [743 — Execute transactional relation mutations](743-relation-mutations.md)
10. [744 — Compile and execute PostgreSQL relations](744-postgres-relation-storage.md)
11. [745 — Add portable relation predicates](745-relation-predicates.md)
12. [746 — Document explicit relationship models](746-explicit-relationship-models.md)
13. [747 — Verify and audit the complete relations vertical](747-relations-postgres-e2e.md)

The frozen decisions and verified developer-facing target live in the
[completed relations plan](../../docs/plans/completed/transport-neutral-relations.md).
REST and GraphQL do not block this vertical and must consume its public
contracts later rather than defining parallel relationship semantics.

## Other planned extensions

Issue 703 completed the default JSONB-backed `objectField` vertical. Issues 704
through 736 preserve future product intent without creating empty
packages. They are not dependencies of the relations vertical unless an issue
explicitly says otherwise.
