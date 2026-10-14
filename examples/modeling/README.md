# Data modeling example

A small bookshop that shows Core data modeling end to end: the configured
factory, the application with its Core `validation` options and its
`Register` declaration, `define` with a field of each built-in kind and their
options (`required`, defaults and factories, `indexed` and `unique`,
`immutable`, lists, local enums and a shared `defineEnum`), composite unique
and ordinary indexes and the unique targets they give, embedded objects and
object lists, virtual fields with `resolve` and `resolveMany`, pointers with
`restrict` and `cascade` deletion, an owning relation filtered by
`.with({ relations })` and an inverse `mappedBy` relation, frozen plain
results, `toJSON`, and the named types `Model`, `CreateInput`, `UpdateInput`
and `UniqueWhereInput`. Its only plugin is PostgreSQL: data modeling is Core.
It uses the declaration form (ADR-0297) without generated files and is tested
with `testApplication` (ADR-0327).

The [Application page](../../apps/website/content/docs/1.0.0/core/application.mdx),
the [Data Modeling pages](../../apps/website/content/docs/1.0.0/core/data-modeling/)
and the [Core README](../../packages/core/README.md) show this application's
code: each block is a `//#region <name>` of these files, included by the pages
and copied into the README by `yarn docs:regions` (ADR-0330). Change the code
here, and the tests prove what the documentation says.

## Files

| File                                                         | What it shows                                                                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| [`src/app.ts`](src/app.ts)                                   | the configured factory                                                                                                  |
| [`src/catalog.ts`](src/catalog.ts)                           | the shared `Genre` enum; `Author` with a virtual field and an inverse relation; `Book` with each value kind and indexes |
| [`src/customers.ts`](src/customers.ts)                       | a reusable embedded shape; `Customer` with embedded objects, an enum list, a filtered relation and `resolveMany`        |
| [`src/loyalty.ts`](src/loyalty.ts)                           | the stand-in remote service that `resolveMany` calls once per read                                                      |
| [`src/orders.ts`](src/orders.ts)                             | `Order` with a cascading pointer, defaults, a factory, generated and automatic temporal values                          |
| [`src/ultimabase.ts`](src/ultimabase.ts)                     | the application, its Core `validation` options and the `Register` declaration                                           |
| [`src/books.ts`](src/books.ts)                               | helpers typed with `Model`, `CreateInput`, `UpdateInput` and `UniqueWhereInput`                                         |
| [`src/main.ts`](src/main.ts)                                 | the development entry point                                                                                             |
| [`tests/application.test.ts`](tests/application.test.ts)     | the startup line, `state` and `health()`, the application timezone, one application per realm                           |
| [`tests/schemas.test.ts`](tests/schemas.test.ts)             | `UNIQUE_VIOLATION`, unique targets, system fields                                                                       |
| [`tests/fields.test.ts`](tests/fields.test.ts)               | the value of each kind, structural validation, enums                                                                    |
| [`tests/defaults.test.ts`](tests/defaults.test.ts)           | omitted input, explicit `null`, updates                                                                                 |
| [`tests/models.test.ts`](tests/models.test.ts)               | frozen plain results, pointers, `toJSON`, the named types                                                               |
| [`tests/embedded.test.ts`](tests/embedded.test.ts)           | embedded objects on create and update                                                                                   |
| [`tests/virtual.test.ts`](tests/virtual.test.ts)             | private dependencies, `resolveMany` called once                                                                         |
| [`tests/relationships.test.ts`](tests/relationships.test.ts) | pointer reads and includes, deletion behavior, inverse and filtered relations, link commands                            |

Region names are stable identifiers: renaming one breaks the page or README
that includes it, and the website content tests report the missing region.

## Run and verify it

Build the repository packages once, then from the repository root:

```sh
corepack yarn build
corepack yarn workspace @ultimabase/example-modeling typecheck
corepack yarn workspace @ultimabase/example-modeling test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_modeling \
	corepack yarn workspace @ultimabase/example-modeling start
```

`test` starts PostgreSQL in a container once (Docker), or uses
`TEST_DATABASE_URL`. `start` creates the tables, prints the application state
and its health, and stops. The PostgreSQL `override` schema policy (the
default outside production) is convenient for this development example and is
not a production migration strategy.
