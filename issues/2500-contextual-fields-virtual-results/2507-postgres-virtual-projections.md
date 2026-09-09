# 2507: Integrate virtual projections with PostgreSQL

- Status: planned
- Milestone: 25
- Packages: `@ultimabase/postgres-plugin`
- Depends on: 2506
- ADR: proposed ADR-0244

## Goal

Load the persisted dependencies required by Core virtual resolution while
keeping PostgreSQL schemas and executable plans free of virtual columns.

## Acceptance criteria

- [ ] PostgreSQL schema compilation, Drizzle tables, indexes, synchronization,
      introspection, snapshots, migrations, codecs, and constraints omit virtual
      fields and their resolver bindings.
- [ ] Read and returning projections receive only Core's derived persisted
      selection and return enough canonical data for virtual materialization.
- [ ] Overlapping dependency selections are deduplicated without changing stable
      logical result order or implicit identifier behavior.
- [ ] Complete selections, exclusion mode, singular reads, collections, creates,
      updates, deletes, upserts, and nested-write result projections behave
      consistently.
- [ ] PostgreSQL never executes a resolver, evaluates request context, applies
      virtual Access, or recognizes transport syntax.
- [ ] Unsupported virtual filters, ordering, indexes, constraints, or physical
      field references fail in Core before SQL compilation.

## Tests

- [ ] Focused compiler and Testcontainers tests prove DDL absence, exact selected
      columns, successful async materialization, rollback, and no dependency
      leakage across applications or workers.
- [ ] Schema synchronization and migration regression tests produce no drift for
      adding, removing, or changing only a virtual declaration.

## Out of scope

- Generated columns, database functions, materialized views, expression indexes,
  SQL filter/order lowering, or database-side virtual computation.
