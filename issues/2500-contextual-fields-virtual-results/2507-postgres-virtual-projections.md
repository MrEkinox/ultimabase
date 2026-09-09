# 2507: Integrate virtual projections with PostgreSQL

- Status: completed
- Milestone: 25
- Packages: `@ultimabase/postgres-plugin`
- Depends on: 2506
- ADR: [ADR-0244](../../docs/adr/0244-contextual-fields-and-virtual-results.md)

## Goal

Load the persisted dependencies required by Core virtual resolution while
keeping PostgreSQL schemas and executable plans free of virtual columns.

## Acceptance criteria

- [x] PostgreSQL schema compilation, Drizzle tables, indexes, synchronization,
      introspection, snapshots, migrations, codecs, and constraints omit virtual
      fields and their resolver bindings.
- [x] Read and returning projections receive only Core's derived persisted
      selection and return enough canonical data for virtual materialization.
- [x] Overlapping dependency selections are deduplicated without changing stable
      logical result order or implicit identifier behavior.
- [x] Complete selections, exclusion mode, singular reads, collections, creates,
      updates, deletes, upserts, and nested-write result projections behave
      consistently.
- [x] PostgreSQL never executes a resolver, evaluates request context, applies
      virtual Access, or recognizes transport syntax.
- [x] Unsupported virtual filters, ordering, indexes, constraints, or physical
      field references fail in Core before SQL compilation.

## Tests

- [x] Focused compiler and Testcontainers tests prove DDL absence, exact selected
      columns, successful async materialization, rollback, and no dependency
      leakage across applications or workers.
- [x] Schema synchronization and migration regression tests produce no drift for
      adding, removing, or changing only a virtual declaration.

## Completion evidence

- PostgreSQL operation translation, prepared mutations, and recursive relational
  includes compile only `plan.returning.selection` while retaining logical
  delete semantics across persistence rewrites.
- Schema compiler and desired-state regressions prove virtual declarations and
  resolver bindings create no column, index, codec, synchronization, or
  migration input.
- The dedicated Testcontainers vertical passed five scenarios covering DDL,
  exact private projections, async reads and mutations, complete and exclusion
  selections, collections, create/update/delete/upsert, nested writes, eager
  pointers, rollback, rejection before SQL, and two-application isolation.
- `yarn typecheck`, `yarn test` (459 files and 2,203 tests), `yarn lint`,
  `yarn build`, `yarn format:check`, and `git diff --check` passed. Lint reports
  only the repository's existing file-size warnings; no baseline increased.

## Out of scope

- Generated columns, database functions, materialized views, expression indexes,
  SQL filter/order lowering, or database-side virtual computation.
