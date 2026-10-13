# PostgreSQL example

A small newsroom backend that shows the official PostgreSQL plugin end to
end: the plugin configuration (a pool created from `DATABASE_URL`, its
connection settings and slow-query log), table and column names with the
`postgres` rule and a `renamedFrom` rename, the column type of each field
kind, field, composite and partial indexes, unique and foreign-key violations
as Core errors, pointer and relation storage, automatic and explicit
transactions, keyset pagination, and the direct schema policies followed
across two releases of the same database. It uses the declaration form
(ADR-0297) without generated files and is tested with `testApplication`
(ADR-0327).

The [PostgreSQL page](../../apps/website/content/docs/1.0.0/plugins/official/postgresql.mdx)
and the [package README](../../packages/postgres-plugin/README.md) show this
application's code: each block is a `//#region <name>` of these files,
included by the page and copied into the README by `yarn docs:regions`
(ADR-0330). Change the code here, and the tests prove what the documentation
says.

## Files

| File                                                       | What it shows                                                                                                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/database.ts`](src/database.ts)                       | `postgresPlugin()` with its connection settings and slow-query log                                                                                   |
| [`src/schema.ts`](src/schema.ts)                           | the factory; `StaffMember` and `Tag` with unique fields; `Article` with its table name, a rename, one field per kind and its indexes; `Contribution` |
| [`src/ultimabase.ts`](src/ultimabase.ts)                   | the application and its `Register` declaration                                                                                                       |
| [`src/newsroom.ts`](src/newsroom.ts)                       | an explicit transaction and keyset pagination                                                                                                        |
| [`src/main.ts`](src/main.ts)                               | the development entry point and the connection state                                                                                                 |
| [`tests/storage.test.ts`](tests/storage.test.ts)           | table, column and index names and column types, read from the PostgreSQL catalog; health checks                                                      |
| [`tests/queries.test.ts`](tests/queries.test.ts)           | create, read, update, delete, bulk writes, upserts, filters, keyset and offset pagination                                                            |
| [`tests/relations.test.ts`](tests/relations.test.ts)       | pointer filters and inclusion, relation members and relation filters                                                                                 |
| [`tests/integrity.test.ts`](tests/integrity.test.ts)       | `UNIQUE_VIOLATION` on field and composite indexes, `restrict` and `cascade` deletions                                                                |
| [`tests/transactions.test.ts`](tests/transactions.test.ts) | atomic batches, an explicit transaction that commits or rolls back, no nested transaction                                                            |
| [`tests/connection.test.ts`](tests/connection.test.ts)     | `DATABASE_URL` read at start, `url` and injected `pool`, connection failures, statement logs                                                         |
| [`tests/schema-sync.test.ts`](tests/schema-sync.test.ts)   | release 1 then release 2 of one database: `override`, a forgotten rename, `renamedFrom`, `fail` and `ignore`                                         |
| [`tests/releases.ts`](tests/releases.ts)                   | the previous release of the newsroom schemas, started by the schema policy tests                                                                     |
| [`tests/support.ts`](tests/support.ts)                     | a dedicated PostgreSQL schema through `search_path`, a recording logger, and catalog reads with a `pg` pool outside UltimaBase                       |

Most tests use `testApplication`, which starts the application on the test
worker's own PostgreSQL schema. `connection.test.ts` and `schema-sync.test.ts`
start their applications themselves on a schema of their own, because they
pass `url` or `pool`, or follow one database across releases. Region names are
stable identifiers: renaming one breaks the page or README that includes it,
and the website content tests report the missing region.

## Run and verify it

Build the repository packages once, then from the repository root:

```sh
corepack yarn build
corepack yarn workspace @ultimabase/example-postgres typecheck
corepack yarn workspace @ultimabase/example-postgres test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_newsroom \
	corepack yarn workspace @ultimabase/example-postgres start
```

`test` starts PostgreSQL in a container once (Docker), or uses
`TEST_DATABASE_URL`. `start` creates the tables, prints `connected`, and keeps
the pool open until you stop it. The PostgreSQL `override` schema policy (the
default outside production) is convenient for this development example and is
not a production migration strategy.
