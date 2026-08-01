# ADR-0082: Direct PostgreSQL schema policies

- Status: accepted
- Date: 2026-08-01
- Extends: ADR-0008, ADR-0048, ADR-0049, ADR-0081

## Decision

When no migration plugin claims PostgreSQL schema preparation,
`postgresPlugin` runs one of three policies during `prepareSchema`:

- `override` is the default. It plans the complete supported diff and executes
  it on one borrowed connection inside a transaction.
- `fail` computes the same deterministic diff, reports it, and performs no
  mutation.
- `ignore` performs no namespace or catalog query.

The plan covers table creation and supported column, primary-key, static
default, identity, nullability, type, and B-tree index changes. Unsupported
managed structures stop direct override before the transaction. Unrelated
tables are preserved because the direct path owns no historical metadata that
could prove they were previously managed by UltimaBase.

Column renames require the PostgreSQL-owned
`postgresColumn({ renamedFrom })` field extension. A missing destination and
an existing source produce `ALTER TABLE ... RENAME COLUMN`; names are never
guessed from similarity.

Migration plugins register the shared
`postgresSchemaPreparationClaimName` setup contribution. PostgreSQL checks the
claim after every plugin has completed setup and skips its direct preparer.
Contribution ownership makes two competing migration implementations a plugin
conflict, while the claiming plugin executes its own later `prepareSchema`
hook.

All identifiers are escaped as PostgreSQL identifiers. Driver rows cross an
`unknown` validation boundary, DDL runs transactionally, and synchronization
failures discard raw driver messages and causes.

## Consequences

Developers can start a real application from static schemas without writing
Drizzle or SQL. `fail` is suitable for environments where drift must be
resolved before startup, while `ignore` supports externally managed schemas.

Direct synchronization deliberately has no migration history, rename
inference, advisory lock, or removed-table ownership. Those responsibilities
remain in `@ultimabase/postgres-migrations` issues 513–515.
