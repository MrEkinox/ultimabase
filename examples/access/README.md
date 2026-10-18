# Access example

A small newsroom backend that shows the official Access plugin end to end:
fail-closed schema rules, read granularity, detailed `{ where, item }`
mutation rules, rules that use the request principal and Roles predicates,
partial field rules, `anyOf`, `allOf` and `not`, the Access keys of Soft
Delete's commands and `readDeleted` permission, `allowWithoutRule` openings,
denial diagnostics and `ultimabase.can()`. It uses the declaration form
without generated files and is tested with `testApplication`.

The [Access page](../../apps/website/content/docs/1.0.0/plugins/official/access.mdx)
and the [package README](../../packages/access-plugin/README.md) show this
application's code: each block is a `//#region <name>` of these files,
included by the page and copied into the README by `yarn docs:regions`.
Change the code here, and the tests prove what the documentation
says.

## Files

| File                                                       | What it shows                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`src/app.ts`](src/app.ts)                                 | the factory `App` with plain `accessPlugin()`, Roles and Soft Delete                                                                                                                                                                                                                                                                 |
| [`src/schema.ts`](src/schema.ts)                           | `Member` and its roles; one region per schema: `Article` (a read filter and a hidden field), `Subscriber` (count only), `Story` (a detailed update rule), `Note` (principal-aware rules, `hasRole`), `AuditEntry` (write-only), `Profile` (partial field rules), `Comment` (combinators, Soft Delete command keys and `readDeleted`) |
| [`src/openings.ts`](src/openings.ts)                       | `Draft`, a schema without any rule, and three `allowWithoutRule` configurations                                                                                                                                                                                                                                                      |
| [`src/ultimabase.ts`](src/ultimabase.ts)                   | the application and its `Register` declaration                                                                                                                                                                                                                                                                                       |
| [`src/main.ts`](src/main.ts)                               | the development entry point                                                                                                                                                                                                                                                                                                          |
| [`tests/reads.test.ts`](tests/reads.test.ts)               | the read filter, the hidden field, read granularity, Master bypass                                                                                                                                                                                                                                                                   |
| [`tests/mutations.test.ts`](tests/mutations.test.ts)       | `where` and `item` on updates and creates, `hasRole`, readable mutation results                                                                                                                                                                                                                                                      |
| [`tests/fields.test.ts`](tests/fields.test.ts)             | partial field rules                                                                                                                                                                                                                                                                                                                  |
| [`tests/plugin-rules.test.ts`](tests/plugin-rules.test.ts) | combinators, plugin command keys and the `readDeleted` permission                                                                                                                                                                                                                                                                    |
| [`tests/openings.test.ts`](tests/openings.test.ts)         | each opening, its startup lines, and `'development'` refused in production                                                                                                                                                                                                                                                           |
| [`tests/diagnostics.test.ts`](tests/diagnostics.test.ts)   | the exposed-method warnings, a denial line, `ultimabase.can()`                                                                                                                                                                                                                                                                       |
| [`tests/rest.test.ts`](tests/rest.test.ts)                 | the same rules on REST requests, sent in memory with `t.fetch`                                                                                                                                                                                                                                                                       |

Region names are stable identifiers: renaming one breaks the page or README
that includes it, and the website content tests report the missing region.

## Run and verify it

Build the repository packages once, then from the repository root:

```sh
corepack yarn build
corepack yarn workspace @ultimabase/example-access typecheck
corepack yarn workspace @ultimabase/example-access test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_access \
	corepack yarn workspace @ultimabase/example-access start
```

`test` starts PostgreSQL in a container once (Docker), or uses
`TEST_DATABASE_URL`. `start` serves REST on
`http://127.0.0.1:1337/api/classes/Article`. The PostgreSQL `override` schema
policy (the default outside production) is convenient for this development
example and is not a production migration strategy.
