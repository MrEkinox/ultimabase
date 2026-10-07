# PostgreSQL and migrations

`postgresPlugin` owns the adapter, compilers, transactions, introspection, and direct schema synchronization.

Without a migration plugin:

- `override` makes the database match registered schemas and permits destructive changes;
- `fail` validates and refuses drift;
- `ignore` skips structural checks.

With `postgresMigrationPlugin`, the migration plugin claims the schema-preparation lifecycle phase. It creates `_ultimabase_schema`, locks concurrent startup, computes diffs, generates SQL and snapshots, records history, and applies configured policies.

Rename detection is explicit through `renamedFrom`. Safe data-preserving changes are preferred even when destructive behavior is allowed.

## Soft-delete storage changes

Installing `@ultimabase/soft-delete-plugin` on a schema adds the plugin-owned,
required boolean `isDeleted` column with a default of `false`. Development
applications using PostgreSQL `override` synchronization receive that column
automatically. A production application should generate, review, and apply the
equivalent migration before starting with `fail` drift policy.

Changing a schema from `disabled` to `explicit` or `replace-delete` requires
that same additive migration. Changing between the two enabled modes changes
behavior but not storage. Disabling or removing the plugin does not implicitly
drop historical tombstones or decide how to recover them; plan that data
transition explicitly before removing the column. V1 does not generate partial
unique indexes, reuse unique values held by tombstones, cascade soft deletes, or
schedule retention and purge jobs.
