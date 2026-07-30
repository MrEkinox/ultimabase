# PostgreSQL and migrations

`postgresPlugin` owns the adapter, compilers, transactions, introspection, and direct schema synchronization.

Without a migration plugin:

- `override` makes the database match registered schemas and permits destructive changes;
- `fail` validates and refuses drift;
- `ignore` skips structural checks.

With `postgresMigrationPlugin`, the migration plugin claims the schema-preparation lifecycle phase. It creates `_ultimabase_schema`, locks concurrent startup, computes diffs, generates SQL and snapshots, records history, and applies configured policies.

Rename detection is explicit through `renamedFrom`. Safe data-preserving changes are preferred even when destructive behavior is allowed.
