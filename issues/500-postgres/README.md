# Milestone 5 — PostgreSQL

Implement the first concrete database vertical and database-specific migrations.

## Completed access-free vertical

The first real persistence path was implemented in the order retained by the
[completed Runtime-to-PostgreSQL plan](../../docs/plans/completed/runtime-postgres-e2e.md):

```text
application service lookup and Runtime assembly
→ PostgreSQL connection and internal Drizzle client
→ table, field, and index compilation
→ introspection and direct schema policy
→ Query AST compilation and singular CRUD
→ Testcontainers isolation
→ Runtime-to-PostgreSQL E2E
```

This scheduling decision does not make PostgreSQL a dependency of access
contracts. It supplies a real adapter vertical against which later CLP, ACL,
role, and field-permission plugins can be tested.

ACL-specific SQL issues 509 and 510 and migration issues 513–515 remain outside
that completed E2E objective. Transaction issue 508 is now a dependency of the
active native-hook PostgreSQL verification in issue 335.
