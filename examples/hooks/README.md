# Hooks example

A small blog backend that shows the official Hooks plugin end to end: a
field Hook trims titles, schema Hooks derive a slug and reject a published
title change, a title change writes an audit row in the same transaction,
`afterCommit` Hooks and a typed event send messages once the transaction has
committed, a thread counts its replies through a legitimate cascade that the
depth limit bounds, and a compatible plugin contributes its own rule. It uses
the declaration form (ADR-0297) without generated files and is tested with
`testApplication` (ADR-0327).

The [Hooks page](../../apps/website/content/docs/1.0.0/plugins/official/hooks.mdx)
and the [package README](../../packages/hooks-plugin/README.md) show this
application's code: each block is a `//#region <name>` of these files,
included by the page and copied into the README by `yarn docs:regions`
(ADR-0330). Change the code here, and the tests prove what the documentation
says.

## Files

| File                                                       | What it shows                                                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`src/app.ts`](src/app.ts)                                 | the factory `App` with global Hooks and event consumers                                         |
| [`src/schema.ts`](src/schema.ts)                           | `Post` with field and schema Hooks; `PostTitleChange`; `Comment` with a cascade and Soft Delete |
| [`src/events.ts`](src/events.ts)                           | the `postPublished` event and its consumer                                                      |
| [`src/post-rules-plugin.ts`](src/post-rules-plugin.ts)     | a compatible plugin contributing a `Post` Hook with `provideHookContributions`                  |
| [`src/effects.ts`](src/effects.ts)                         | the stand-in for an e-mail or webhook client, which the tests read                              |
| [`src/ultimabase.ts`](src/ultimabase.ts)                   | the application and the `Register` declaration                                                  |
| [`src/main.ts`](src/main.ts)                               | the development entry point                                                                     |
| [`tests/data.test.ts`](tests/data.test.ts)                 | field Hooks, `resolveInput` for create, update and upsert, readable `changes`                   |
| [`tests/operations.test.ts`](tests/operations.test.ts)     | writes in the transaction, `PublicError` in TypeScript and REST, rollback, the contributed Hook |
| [`tests/after-commit.test.ts`](tests/after-commit.test.ts) | `afterCommit` order and timing, bulk calls, typed events, `all` for a plugin command            |
| [`tests/recursion.test.ts`](tests/recursion.test.ts)       | the reply cascade and the depth limit                                                           |

Region names are stable identifiers: renaming one breaks the page or README
that includes it, and the website content tests report the missing region.

## Run and verify it

Build the repository packages once, then from the repository root:

```sh
corepack yarn build
corepack yarn workspace @ultimabase/example-hooks typecheck
corepack yarn workspace @ultimabase/example-hooks test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_hooks \
	corepack yarn workspace @ultimabase/example-hooks start
```

`test` starts PostgreSQL in a container once (Docker), or uses
`TEST_DATABASE_URL`. `start` serves REST on
`http://127.0.0.1:1337/api/classes/Post`. REST accepts writes from every
client (`publicWrites: true`) to keep the example short; install Access before
exposing an application. The PostgreSQL `override` schema policy (the default
outside production) is convenient for this development example and is not a
production migration strategy.
