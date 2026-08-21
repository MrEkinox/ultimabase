# Milestone 5 — PostgreSQL

- Status: planned

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
contracts. It supplies a real adapter vertical against which later native
Access, persisted ACL policies, and role-aware decisions can be tested.

ACL-specific SQL issues 509 and 510 and migration issues 513–515 remained
outside that completed E2E objective. Their original dedicated compiler bridge
was later superseded by milestone 18: ACL now emits ordinary field-owned
containment filters and PostgreSQL compiles the generic plugin-field protocol
without ACL vocabulary or another integration package. Issue 519 supplies the
transaction adapter required by automatic mutation transactions. Issue 344
adds its mandatory prepared-mutation protocol and the singular PostgreSQL
create, update, and delete outcomes. Issue 508 then adds bulk and
concurrency-resolved upsert execution through the same protocol before the final
native-hook PostgreSQL verification in issue 335.

Issue 514 represents generated differences with an immutable `MigrationPlan`
class. The plan is inspectable and deterministic, while connection ownership,
application, locking, and destructive policy remain plugin responsibilities.
