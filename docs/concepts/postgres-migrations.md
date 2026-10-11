# PostgreSQL and migrations

`postgresPlugin` owns the adapter, compilers, transactions, introspection, and direct schema synchronization.

No migration plugin is shipped (ADR-0266). The schema policies are:

- `override` makes the database match registered schemas with non-destructive
  changes only: it never drops a table or column, applies only widening type
  conversions, refuses to start while a managed table keeps a required column
  that no field declares (a likely forgotten rename), and logs one `info` line
  per applied change (ADR-0320);
- `fail` validates and refuses drift;
- `ignore` skips structural checks.

Rename detection is explicit through `renamedFrom`, which names the previous
physical column; columns are `snake_case` by default.

## Soft-delete storage changes

Calling `.softDelete()` on a schema adds the plugin-owned, required boolean
`is_deleted` column (field `isDeleted`) with a default of `false` and the
optional `deleted_at` date-time column (field `deletedAt`). Development
applications using PostgreSQL `override` synchronization receive that column
automatically. A production application should generate, review, and apply the
equivalent migration before starting with `fail` drift policy.

Adding `.softDelete()` to an existing schema requires that same additive
migration. Changing between the default mode and `{ mode: 'command' }` changes
behavior but not storage. Disabling or removing the plugin does not implicitly
drop historical tombstones or decide how to recover them; plan that data
transition explicitly before removing the column. V1 does not generate partial
unique indexes, reuse unique values held by tombstones, cascade soft deletes, or
schedule retention and purge jobs.
