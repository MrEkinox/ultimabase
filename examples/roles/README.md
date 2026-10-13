# Roles example

A small newsroom backend that shows the official Roles plugin end to end:
role schemas declared with `App.RoleSchema.define`, roles created at start
with `ensure`, members and included roles linked through `connect`, cycle
rejection, `hasRole()` predicates in Access rules, `has()` and `current()`
outside rules, name and UUID references, the request-local membership cache,
role management by Master or by callers under a schema's rules, the `fail`
and `cascade` deletion policies, and an observer of the committed role
events. It uses the declaration form (ADR-0297) without generated files and is
tested with `testApplication` (ADR-0327).

The [Roles page](../../apps/website/content/docs/1.0.0/plugins/official/roles.mdx)
and the [package README](../../packages/roles-plugin/README.md) show this
application's code: each block is a `//#region <name>` of these files,
included by the page and copied into the README by `yarn docs:regions`
(ADR-0330). Change the code here, and the tests prove what the documentation
says.

## Files

| File                                                   | What it shows                                                                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`src/schema.ts`](src/schema.ts)                       | the factory with Access, Roles and the audit plugin; `Member` and `StaffRole` with its `ensure` roles; `Team`, a second role schema managed by administrators; `Post` ruled by `hasRole()` |
| [`src/staff.ts`](src/staff.ts)                         | trusted server code: adding and removing staff members, linking the hierarchy                                                                                                              |
| [`src/role-audit.ts`](src/role-audit.ts)               | a plugin observing the membership, hierarchy and deletion events                                                                                                                           |
| [`src/ultimabase.ts`](src/ultimabase.ts)               | the application, its audited Master authority and the `Register` declaration                                                                                                               |
| [`src/main.ts`](src/main.ts)                           | the development entry point, which links the hierarchy once started                                                                                                                        |
| [`tests/membership.test.ts`](tests/membership.test.ts) | `ensure`, members and included roles, cycles, Master-only staff changes, teams managed under rules, name normalization and uniqueness                                                      |
| [`tests/queries.test.ts`](tests/queries.test.ts)       | `has()` and `current()` for a request or a principal, Master holding no role, the request cache, name and UUID references                                                                  |
| [`tests/policy.test.ts`](tests/policy.test.ts)         | `hasRole()` in Access rules, direct and inherited                                                                                                                                          |
| [`tests/provider.test.ts`](tests/provider.test.ts)     | `PLUGIN_CAPABILITY_MISSING` in an application without a role provider                                                                                                                      |
| [`tests/deletion.test.ts`](tests/deletion.test.ts)     | the `fail` and `cascade` policies, `deleteMany` rollback, the committed events                                                                                                             |
| [`tests/rest.test.ts`](tests/rest.test.ts)             | a role schema served by REST under its rules, sent in memory with `t.fetch`                                                                                                                |

Region names are stable identifiers: renaming one breaks the page or README
that includes it, and the website content tests report the missing region.

## Run and verify it

Build the repository packages once, then from the repository root:

```sh
corepack yarn build
corepack yarn workspace @ultimabase/example-roles typecheck
corepack yarn workspace @ultimabase/example-roles test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_roles \
ULTIMABASE_MASTER_KEY=development-only-secret \
	corepack yarn workspace @ultimabase/example-roles start
```

`test` starts PostgreSQL in a container once (Docker), or uses
`TEST_DATABASE_URL`. `start` serves REST on
`http://127.0.0.1:1337/api/classes/StaffRole`. The PostgreSQL `override`
schema policy (the default outside production) is convenient for this
development example and is not a production migration strategy.
