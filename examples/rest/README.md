# REST example

A small blog backend that shows the REST plugin end to end: the `/api`
mount, `expose` keys that open or close routes per schema, a
schema without any route, list reads with `where`, `select`, `orderBy`,
`include` and cursor pagination, single reads, `first`, `count` and `exists`,
create, update and delete with their status codes, relation links, an atomic
bulk create, a write-only schema answering with its `id` alone, the error
envelope and its statuses (400, 403, 404, 405, 409, 422), an application
operation declared with `defineOperation`, the OpenAPI document, and a second
application that opts into `publicWrites`. Access decides what clients may do;
an exposed route grants nothing. It uses the declaration form
without generated files and is tested with `testApplication`.

The [REST page](../../apps/website/content/docs/1.0.0/plugins/official/rest.mdx)
and the [package README](../../packages/rest-plugin/README.md) show this
application's code: each block is a `//#region <name>` of these files,
included by the page and copied into the README by `yarn docs:regions`.
Change the code here, and the tests prove what the documentation
says.

## Files

| File                                                         | What it shows                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`src/app.ts`](src/app.ts)                                   | the factory `App` with Access, HTTP, `restPlugin` options, Hono and the operation                                                                            |
| [`src/schema.ts`](src/schema.ts)                             | `Author` (`expose: { write: false }`), `Tag` (`expose: false`), `Post` (count, bulk create, a hidden field), `Feedback` (write-only)                         |
| [`src/operations.ts`](src/operations.ts)                     | `readingTime`, an application operation with Zod validators                                                                                                  |
| [`src/guestbook.ts`](src/guestbook.ts)                       | a second application without any policy plugin, started with `publicWrites`                                                                                  |
| [`src/ultimabase.ts`](src/ultimabase.ts)                     | the application and its `Register` declaration                                                                                                               |
| [`src/main.ts`](src/main.ts)                                 | the development entry point                                                                                                                                  |
| [`tests/reads.test.ts`](tests/reads.test.ts)                 | lists, `where` in GET and POST, `select`, `orderBy`, `take` and `after`, the configured page size, `include`, tagged pointers, `first`, `count` and `exists` |
| [`tests/writes.test.ts`](tests/writes.test.ts)               | create (201), update (200) and delete (200) with pointer and relation links, the atomic bulk create, the `{ id }` answer for a row the caller cannot read    |
| [`tests/errors.test.ts`](tests/errors.test.ts)               | the error envelope and request ID, 400 details, the hidden field, 404 targets and paths, 405 with `Allow`, 409 and 422, an HTTP failure before REST          |
| [`tests/operations.test.ts`](tests/operations.test.ts)       | calling the operation, its 422 issues, the `{ "input": value }` body, the OpenAPI document                                                                   |
| [`tests/public-writes.test.ts`](tests/public-writes.test.ts) | the startup refusal without a policy, and writes with `publicWrites`                                                                                         |

Region names are stable identifiers: renaming one breaks the page or README
that includes it, and the website content tests report the missing region.

## Run and verify it

Build the repository packages once, then from the repository root:

```sh
corepack yarn build
corepack yarn workspace @ultimabase/example-rest typecheck
corepack yarn workspace @ultimabase/example-rest test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_rest \
	corepack yarn workspace @ultimabase/example-rest start
```

`test` starts PostgreSQL in a container once (Docker), or uses
`TEST_DATABASE_URL`, and sends every request in memory with `t.fetch`.
`start` serves REST on `http://127.0.0.1:1337/api/classes/Post` and the
OpenAPI document on `http://127.0.0.1:1337/api/openapi.json`. The PostgreSQL
`override` schema policy (the default outside production) is convenient for
this development example and is not a production migration strategy.
