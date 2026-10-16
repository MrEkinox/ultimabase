# Validation example

A small events backend that shows the official Validation plugin end to end:
a Zod validator trims and checks a title before it is stored, function
validators return stable issue codes, an async validator asks a room service,
a schema check compares two dates on the complete event, and every problem
of a write comes back in one `VALIDATION_ERROR`. It uses the declaration form
without generated files and is tested with `testApplication`.

The [Validation page](../../apps/website/content/docs/1.0.0/plugins/official/validation.mdx)
and the [package README](../../packages/validation-plugin/README.md) show
this application's code: each block is a `//#region <name>` of these files,
included by the page and copied into the README by `yarn docs:regions`.
Change the code here, and the tests prove what the documentation
says.

## Files

| File                                                         | What it shows                                                                                                              |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| [`src/app.ts`](src/app.ts)                                   | the factory `App`                                                                                                          |
| [`src/schema.ts`](src/schema.ts)                             | `Event` with Standard Schema, function and async field validators and a schema check; `TicketTier` with a Zod object check |
| [`src/rooms.ts`](src/rooms.ts)                               | the in-memory stand-in for the room service the async validator calls                                                      |
| [`src/ultimabase.ts`](src/ultimabase.ts)                     | the application and the `Register` declaration                                                                             |
| [`src/main.ts`](src/main.ts)                                 | the development entry point                                                                                                |
| [`tests/fields.test.ts`](tests/fields.test.ts)               | the stored validator output, every issue in one `VALIDATION_ERROR`, `null` inputs, Master writes                           |
| [`tests/updates.test.ts`](tests/updates.test.ts)             | changed-fields-only updates, the schema check on an updated item, an atomic decrement, `updateMany` index paths            |
| [`tests/schema-checks.test.ts`](tests/schema-checks.test.ts) | a Standard Schema object validator as the schema check                                                                     |
| [`tests/check.test.ts`](tests/check.test.ts)                 | `check()`, which validates data without writing it                                                                         |
| [`tests/rest.test.ts`](tests/rest.test.ts)                   | the REST `422` answer, with Core's and the validators' issues together, sent in memory with `t.fetch`                      |

Region names are stable identifiers: renaming one breaks the page or README
that includes it, and the website content tests report the missing region.

## Run and verify it

Build the repository packages once, then from the repository root:

```sh
corepack yarn build
corepack yarn workspace @ultimabase/example-validation typecheck
corepack yarn workspace @ultimabase/example-validation test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_validation \
	corepack yarn workspace @ultimabase/example-validation start
```

`test` starts PostgreSQL in a container once (Docker), or uses
`TEST_DATABASE_URL`. `start` serves REST on
`http://127.0.0.1:1337/api/classes/Event`. The PostgreSQL `override` schema
policy (the default outside production) is convenient for this development
example and is not a production migration strategy.
