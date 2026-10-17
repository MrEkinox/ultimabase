# Soft Delete example

A small blog backend that shows the official Soft Delete plugin end to end:
posts go to a trash instead of disappearing, moderators can read the trash,
anyone who may delete a post may restore it, and only trusted server code
purges it for good. It uses the declaration form without generated
files and is tested with `testApplication`.

The [Soft Delete page](../../apps/website/content/docs/1.0.0/plugins/official/soft-delete.mdx)
and the [package README](../../packages/soft-delete-plugin/README.md) show
this application's code: each block is a `//#region <name>` of these files,
included by the page and copied into the README by `yarn docs:regions`.
Change the code here, and the tests prove what the documentation
says.

## Files

| File                                                 | What it shows                                                                                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/app.ts`](src/app.ts)                           | the factory `App`                                                                                                                                               |
| [`src/schema.ts`](src/schema.ts)                     | `Post` in the default mode with its Access rules, `readDeleted` and REST and GraphQL exposure; `Comment` in command mode; `Article` with a partial unique index |
| [`src/ultimabase.ts`](src/ultimabase.ts)             | the application, its audited Master authority and the `Register` declaration                                                                                    |
| [`src/admin.ts`](src/admin.ts)                       | trusted server code: making a moderator, Master reads of the trash, emptying the trash with `purgeMany`                                                         |
| [`src/main.ts`](src/main.ts)                         | the development entry point                                                                                                                                     |
| [`tests/lifecycle.test.ts`](tests/lifecycle.test.ts) | soft delete, restore and purge of one row and of many rows                                                                                                      |
| [`tests/trash.test.ts`](tests/trash.test.ts)         | `readDeleted` through Access and Roles, Master reads, the retention job                                                                                         |
| [`tests/modes.test.ts`](tests/modes.test.ts)         | command mode and the partial unique index                                                                                                                       |
| [`tests/rest.test.ts`](tests/rest.test.ts)           | the REST routes the documentation calls with `curl`, sent in memory with `t.fetch`                                                                              |
| [`tests/graphql.test.ts`](tests/graphql.test.ts)     | the GraphQL documents of the documentation, `NOT_FOUND` on a repeated soft deletion, restore, and the fields that are not exposed                               |

Region names are stable identifiers: renaming one breaks the page or README
that includes it, and the website content tests report the missing region.

## Run and verify it

Build the repository packages once, then from the repository root:

```sh
corepack yarn build
corepack yarn workspace @ultimabase/example-soft-delete typecheck
corepack yarn workspace @ultimabase/example-soft-delete test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_soft_delete \
	corepack yarn workspace @ultimabase/example-soft-delete start
```

`test` starts PostgreSQL in a container once (Docker), or uses
`TEST_DATABASE_URL`. `start` serves REST on
`http://127.0.0.1:1337/api/classes/Post` and GraphQL on
`POST http://127.0.0.1:1337/graphql`. The PostgreSQL `override` schema
policy (the default outside production) is convenient for this development
example and is not a production migration strategy.
