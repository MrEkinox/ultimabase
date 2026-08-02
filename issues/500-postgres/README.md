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
that completed E2E objective. Generic constraint compilers are introduced by
issue 338 before issue 509 registers the ACL-specific PostgreSQL compiler.
Issue 519 supplies the transaction adapter required by automatic mutation
transactions. Issue 344 adds its mandatory prepared-mutation protocol and the
singular PostgreSQL create, update, and delete outcomes. Issue 508 then adds
bulk and concurrency-resolved upsert execution through the same protocol before
the final native-hook PostgreSQL verification in issue 335.

Issue 514 represents generated differences with an immutable `MigrationPlan`
class. The plan is inspectable and deterministic, while connection ownership,
application, locking, and destructive policy remain plugin responsibilities.
