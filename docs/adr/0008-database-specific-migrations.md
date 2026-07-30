# ADR-0008: Database-specific migration plugins

- Status: accepted
- Date: 2026-07-30

## Decision

Migration orchestration is database-specific. `postgresMigrationPlugin` owns PostgreSQL diffing, SQL, history, snapshots, locking, and `_ultimabase_schema`.

Without it, `postgresPlugin` uses `override`, `fail`, or `ignore`.

## Consequences

Database-specific behavior is not forced into Core. A future Drizzle Kit plugin may implement the same lifecycle boundary and conflict with the built-in PostgreSQL migration plugin.
