# Examples

Examples are user-facing, tested applications. They must only import public `@ultimabase/*` exports, and use the declaration form only (ADR-0297, ADR-0327): no generation step and no generated files.

- [`minimal`](minimal/README.md): runnable authenticated Hono application on
  port `1337` with sibling REST and GraphQL transports, PostgreSQL, Password
  Auth Bearer and cookie sessions, role-protected data, audited Master requests,
  both official soft-delete modes with private restoration and purge, atomic
  nested pointer and relation writes, and explicitly exposed plugin operations.
- [`todo-backend`](todo-backend/README.md): the reference Todo application
  with Access, ACL, Hooks, Roles, Validation, PostgreSQL and REST in the
  declaration form, and its tests with `testApplication`.
- [`soft-delete`](soft-delete/README.md): the Soft Delete plugin end to end
  (both modes, restore, purge, `readDeleted` through Access and Roles, Master
  reads, a partial unique index, REST), tested with `testApplication`. Its
  `//#region` blocks are the code of the Soft Delete page and package README
  (ADR-0330).
- [`schema-form-d`](schema-form-d/README.md): the declaration form
  (ADR-0297) on cyclic schemas with Access, ACL, Hooks and Soft Delete,
  with its typo cases, editor probes and measurements.

## Feature examples and documentation

A feature example (`examples/<feature>/`, ADR-0330) is the tested source of
its documentation page and package README:

1. Write a small complete application in the declaration form, with short
   files and comments that explain intent, and its tests with
   `testApplication` (copy `soft-delete/package.json`, `tsconfig.json` and
   `vitest.config.ts`).
2. Mark each block the documentation shows with `//#region <name>` and
   `//#endregion <name>`, in `src/` for application code and in `tests/` for
   a call whose result the test then asserts. Keep test scaffolding outside
   the region.
3. Include the regions in the page with `<include cwd …>`, and in the package
   README with `<!-- region … -->` markers filled by `yarn docs:regions`. Add
   the page and READMEs to `enforcedDocuments` in
   `apps/website/tests/verified-code.content.test.ts`.
4. Add the example to `tests/e2e/examples-form-d.postgres.e2e.test.ts` (compile
   list and test count) and to `tooling/ci/typescript-7.ts`.
