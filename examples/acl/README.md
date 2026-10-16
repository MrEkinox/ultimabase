# ACL example

A small notebook backend that shows the official ACL plugin end to end:
`acl: true` in `define` and its required `default`, private notes owned by their creator,
atomic `grant` and `revoke` sharing, `clientSharing` and its no-escalation
guard, `select: { acl: true }` and `acl.entries()`, schema `limits`, a fixed
ACL with public and role entries, `resolveInput`, complete ACLs written by
Master, ACL combined with Access rules and Roles, immutable ACL values and
their JSON, and committed ACL change events. It uses the declaration form
without generated files and is tested with `testApplication`.

The [ACL page](../../apps/website/content/docs/1.0.0/plugins/official/acl-permissions.mdx)
and the [package README](../../packages/acl-permissions-plugin/README.md) show
this application's code: each block is a `//#region <name>` of these files,
included by the page and copied into the README by `yarn docs:regions`.
Change the code here, and the tests prove what the documentation
says.

## Files

| File                                                         | What it shows                                                                                                                                                                                               |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/schema.ts`](src/schema.ts)                             | the factory with `aclPlugin()`, Access and Roles; `Member` and the `Team` roles; `Note` (owner default, `clientSharing`, `limits`), `Announcement` (a fixed ACL with Access rules), `Page` (`resolveInput`) |
| [`src/sharing.ts`](src/sharing.ts)                           | client code sharing and unsharing a note with `grant` and `revoke`                                                                                                                                          |
| [`src/admin.ts`](src/admin.ts)                               | trusted server code: adding an editor, complete ACLs written by Master, a Master filter on the ACL, `acl.entries()` with role names                                                                         |
| [`src/acl-audit-plugin.ts`](src/acl-audit-plugin.ts)         | a plugin observing committed ACL changes                                                                                                                                                                    |
| [`src/ultimabase.ts`](src/ultimabase.ts)                     | the application, its audited Master authority and the `Register` declaration                                                                                                                                |
| [`src/main.ts`](src/main.ts)                                 | the development entry point                                                                                                                                                                                 |
| [`tests/notes.test.ts`](tests/notes.test.ts)                 | the owner default, sharing and revoking, `clientSharing`, `select: { acl: true }`, the entry limit                                                                                                          |
| [`tests/announcements.test.ts`](tests/announcements.test.ts) | public and role entries, ACL with Access, `acl.entries()`                                                                                                                                                   |
| [`tests/pages.test.ts`](tests/pages.test.ts)                 | `resolveInput` on creates, updates and `updateMany` items; a Master ACL written as is                                                                                                                       |
| [`tests/master.test.ts`](tests/master.test.ts)               | Master imports, hides and filters notes; upserts never replace an ACL                                                                                                                                       |
| [`tests/values.test.ts`](tests/values.test.ts)               | immutable ACL values, the `'write'` group, strict JSON                                                                                                                                                      |
| [`tests/events.test.ts`](tests/events.test.ts)               | the committed ACL change events                                                                                                                                                                             |

Region names are stable identifiers: renaming one breaks the page or README
that includes it, and the website content tests report the missing region.

## Run and verify it

Build the repository packages once, then from the repository root:

```sh
corepack yarn build
corepack yarn workspace @ultimabase/example-acl typecheck
corepack yarn workspace @ultimabase/example-acl test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_acl \
ULTIMABASE_MASTER_KEY=development-only-secret \
	corepack yarn workspace @ultimabase/example-acl start
```

`test` starts PostgreSQL in a container once (Docker), or uses
`TEST_DATABASE_URL`, and sets a test-only Master key. `start` synchronizes
the tables and stops: the example has no transport. The PostgreSQL `override`
schema policy (the default outside production) is convenient for this
development example and is not a production migration strategy.
