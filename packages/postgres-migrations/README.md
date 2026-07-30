# @ultimabase/postgres-migrations

Official `postgresMigrationPlugin`.

The plugin claims PostgreSQL schema preparation, creates `_ultimabase_schema`, computes diffs, records history, generates SQL and snapshots, detects drift, applies advisory locking, and enforces safe/alter/destructive policies.

A future Drizzle Kit migration plugin may implement the same boundary, but may not become a dependency of this package.
