# Milestone 5 — PostgreSQL

Implement the first concrete database vertical and database-specific migrations.

## Access-free vertical priority

Before milestone 4 access plugins, implement the first real persistence path in
the order recorded by [`CURRENT_PLAN.md`](../../CURRENT_PLAN.md):

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

ACL-specific SQL issues 509 and 510, bulk/transaction issue 508, and migration
issues 513–515 remain outside the first E2E objective.
