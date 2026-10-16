# GraphQL example

A small blog backend that shows GraphQL end to end: the `apiServer()` preset
installing GraphQL, its Yoga transport, the HTTP foundation, the Hono
listener and the GraphiQL explorer; the schema generated from registered
schemas, with `graphql` rule keys that expose or hide fields per
schema and `.with({ graphql: false })`; queries with declared filter operators,
ordering, relations, a `resolveMany` virtual field and cursor pagination;
mutations with nested links; a write-only schema answering with its `id`
alone; a hidden schema left out of GraphQL; validation hints outside
production, `PERMISSION_DENIED`, `VALIDATION_ERROR` and a `PublicError`; an
application operation typed from its Zod validators; a custom
`GraphQLSchema`; direct execution without HTTP; and a second application
installing each plugin by hand, with Yoga options and Apollo Sandbox. Access
decides what clients may do; an exposed field grants nothing. It uses the declaration form without generated files and
is tested with `testApplication`.

The [GraphQL page](../../apps/website/content/docs/1.0.0/plugins/official/graphql.mdx)
and the READMEs of [`graphql-plugin`](../../packages/graphql-plugin/README.md),
[`graphql-yoga-plugin`](../../packages/graphql-yoga-plugin/README.md),
[`graphql-http`](../../packages/graphql-http/README.md) and
[`graphql-explorer-plugin`](../../packages/graphql-explorer-plugin/README.md)
show this application's code: each block is a `//#region <name>` of these
files, included by the page and copied into the READMEs by
`yarn docs:regions`. Change the code here, and the tests prove what
the documentation says.

## Files

| File                                                         | What it shows                                                                                                                                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/app.ts`](src/app.ts)                                   | the factory `App` with Access, PostgreSQL, `apiServer({ graphql })` and the operation                                                                                                   |
| [`src/schema.ts`](src/schema.ts)                             | `Author` and `Comment` (no root mutation), `Post`, `Feedback`, `AuditEntry` (`.with({ graphql: false })`, linked from the hidden side)                                                  |
| [`src/operations.ts`](src/operations.ts)                     | `readingTime`, an application operation with Zod validators and a `PublicError`                                                                                                         |
| [`src/custom-schema.ts`](src/custom-schema.ts)               | a completed `GraphQLSchema` composed after the generated fields                                                                                                                         |
| [`src/reading-service.ts`](src/reading-service.ts)           | a stand-in for a remote service the `resolveMany` virtual field calls once per read                                                                                                     |
| [`src/notes.ts`](src/notes.ts)                               | a second application installing each plugin, read-only, with Yoga options, Apollo Sandbox and the required application header                                                           |
| [`src/ultimabase.ts`](src/ultimabase.ts)                     | the application and its `Register` declaration                                                                                                                                          |
| [`src/main.ts`](src/main.ts)                                 | the development entry point                                                                                                                                                             |
| [`src/print-schema.ts`](src/print-schema.ts)                 | a script printing the schema the application serves                                                                                                                                     |
| [`tests/queries.test.ts`](tests/queries.test.ts)             | `first` and `after`, `totalCount`, `where` operators, `countPost` and `existsPost`, relations, `resolveMany`, `getPost`, `health` and `version`                                         |
| [`tests/mutations.test.ts`](tests/mutations.test.ts)         | create with nested links, update and delete by `where`, `{ id }` for a row the caller cannot read, a mutation Access denies                                                             |
| [`tests/errors.test.ts`](tests/errors.test.ts)               | validation hints, `.with({ graphql: false })`, the hidden field, a bad cursor, a `first` outside the page window, a repeated `orderBy` field, an HTTP failure before GraphQL, POST only |
| [`tests/operations.test.ts`](tests/operations.test.ts)       | calling the operation, its validation issues and its `PublicError`                                                                                                                      |
| [`tests/schema.test.ts`](tests/schema.test.ts)               | the printed schema without `AuditEntry`, direct execution with `execute()`, introspection and GraphiQL                                                                                  |
| [`tests/notes.test.ts`](tests/notes.test.ts)                 | the second application: `path`, `bodyLimit`, `default: false`, the application header, Apollo Sandbox                                                                                   |
| [`tests/public-writes.test.ts`](tests/public-writes.test.ts) | the startup refusal without a policy, and writes with `publicWrites`                                                                                                                    |
| [`tests/production.test.ts`](tests/production.test.ts)       | an explorer without introspection refused, and production without explorer, introspection, hints or suggestions                                                                         |

Region names are stable identifiers: renaming one breaks the page or README
that includes it, and the website content tests report the missing region.

## Run and verify it

Build the repository packages once, then from the repository root:

```sh
corepack yarn build
corepack yarn workspace @ultimabase/example-graphql typecheck
corepack yarn workspace @ultimabase/example-graphql test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_graphql \
	corepack yarn workspace @ultimabase/example-graphql start
```

`test` starts PostgreSQL in a container once (Docker), or uses
`TEST_DATABASE_URL`, and sends every request in memory with `t.fetch`.
`start` serves GraphQL on `POST http://127.0.0.1:1337/graphql` and GraphiQL on
`http://127.0.0.1:1337/graphiql`. The PostgreSQL `override` schema policy (the
default outside production) is convenient for this development example and is
not a production migration strategy.
