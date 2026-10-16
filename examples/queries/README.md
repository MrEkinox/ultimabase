# Queries example

A small blog backend that shows how Core reads and writes data end to end:
filters, selections, related data, ordering and keyset pagination, creates,
updates, deletes, unique upserts, bulk commands, nested writes, automatic and
explicit transactions, API errors, Master authority and request identity. It
uses the declaration form without generated files and is tested
with `testApplication`.

The Reading Data, Writing Data, API Error Boundaries, Master Authority and
Request Identity pages of the website and the matching sections of the
[Core README](../../packages/core/README.md) show this application's code:
each block is a `//#region <name>` of these files, included by the pages and
copied into the README by `yarn docs:regions`. Change the code
here, and the tests prove what the documentation says.

## Files

| File                                                         | What it shows                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/schema.ts`](src/schema.ts)                             | the factory with Access and PostgreSQL; `Author` and its declared relation filter, `Post`, `Comment`, `Translation` with a composite unique index, `Announcement` with Access rules, a `PublicError` and the `isEditor` predicate |
| [`src/ultimabase.ts`](src/ultimabase.ts)                     | the application, its audited Master authority and the `Register` declaration naming the principal schema                                                                                                                          |
| [`src/reads.ts`](src/reads.ts)                               | read functions: filters, reusable `Where` and `Select` parts, selections, keyset pages, batches, inclusions and relation predicates                                                                                               |
| [`src/writes.ts`](src/writes.ts)                             | create, update with an atomic increment, delete, and upserts on a unique field and on a composite unique index                                                                                                                    |
| [`src/bulk.ts`](src/bulk.ts)                                 | `createMany`, `updateMany`, `upsertMany` and `deleteMany`                                                                                                                                                                         |
| [`src/nested-writes.ts`](src/nested-writes.ts)               | pointer and relation commands: `create`, `connect`, `update`, `disconnect`, `set` and `null`                                                                                                                                      |
| [`src/transactions.ts`](src/transactions.ts)                 | an explicit transaction and a retry helper for `TRANSACTION_CONFLICT`                                                                                                                                                             |
| [`src/errors.ts`](src/errors.ts)                             | handling `NOT_FOUND` from `findOneOrThrow`                                                                                                                                                                                        |
| [`src/maintenance.ts`](src/maintenance.ts)                   | a trusted server command with `useMasterKey`, and [`src/run-maintenance.ts`](src/run-maintenance.ts) its entry point                                                                                                              |
| [`src/request-identity.ts`](src/request-identity.ts)         | a typed request value on a `RequestContext` (plugin-author machinery)                                                                                                                                                             |
| [`src/jobs.ts`](src/jobs.ts)                                 | a background read with its own context and cancellation signal                                                                                                                                                                    |
| [`src/main.ts`](src/main.ts)                                 | the development entry point                                                                                                                                                                                                       |
| [`tests/reads.test.ts`](tests/reads.test.ts)                 | read terminals and selections                                                                                                                                                                                                     |
| [`tests/filters.test.ts`](tests/filters.test.ts)             | operators, the equality shorthand, UUID operands, JSON and object paths, pointer and relation predicates                                                                                                                          |
| [`tests/pagination.test.ts`](tests/pagination.test.ts)       | `take` and `after`, positions, `null` ordering, batches                                                                                                                                                                           |
| [`tests/relations.test.ts`](tests/relations.test.ts)         | inclusions, included pages, where a relation filter applies, the declared relation filter                                                                                                                                         |
| [`tests/writes.test.ts`](tests/writes.test.ts)               | create, update, delete and `REFERENCE_VIOLATION`                                                                                                                                                                                  |
| [`tests/upserts.test.ts`](tests/upserts.test.ts)             | both upsert branches, composite targets, mismatched and colliding create values                                                                                                                                                   |
| [`tests/bulk.test.ts`](tests/bulk.test.ts)                   | ordered batch results and all-or-nothing rollback                                                                                                                                                                                 |
| [`tests/nested-writes.test.ts`](tests/nested-writes.test.ts) | nested graphs, membership changes and graph rollback                                                                                                                                                                              |
| [`tests/transactions.test.ts`](tests/transactions.test.ts)   | explicit and automatic transactions, rollback, nested transactions, the retry helper                                                                                                                                              |
| [`tests/errors.test.ts`](tests/errors.test.ts)               | `FrameworkError` payloads, validation issues and `PublicError`                                                                                                                                                                    |
| [`tests/master.test.ts`](tests/master.test.ts)               | audited Master commands, `useMasterKey: false`, validation under Master                                                                                                                                                           |
| [`tests/master-audit.test.ts`](tests/master-audit.test.ts)   | a failing audit sink prevents the elevated write                                                                                                                                                                                  |
| [`tests/identity.test.ts`](tests/identity.test.ts)           | request values, job contexts and cancellation, the current principal in policies, `can()`                                                                                                                                         |

Region names are stable identifiers: renaming one breaks the page or README
that includes it, and the website content tests report the missing region.

The tests run calls as a signed-in author with `t.as(Author.pointer(id), fn)`.
In a deployed application an authentication plugin, such as
[Password Authentication](../auth/README.md), provides that principal;
without one, every request is anonymous.

## Run and verify it

Build the repository packages once, then from the repository root:

```sh
corepack yarn build
corepack yarn workspace @ultimabase/example-queries typecheck
corepack yarn workspace @ultimabase/example-queries test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_queries \
ULTIMABASE_MASTER_KEY=development-only-secret \
	corepack yarn workspace @ultimabase/example-queries start
```

`test` starts PostgreSQL in a container once (Docker), or uses
`TEST_DATABASE_URL`. `start` starts the application and keeps it running
until interrupted; this example installs no transport. The PostgreSQL
`override` schema policy (the default outside production) is convenient for
this development example and is not a production migration strategy.
