# Examples

Examples are user-facing, tested applications. They must only import public `@ultimabase/*` exports, and use the declaration form only (ADR-0297, ADR-0327): no generation step and no generated files.

Every example follows the [project layout](../apps/website/content/docs/1.0.0/project-layout.mdx)
that `create-app` generates: `src/app.ts` exports the factory `App` and
imports no schema, the schema files import `App`, `src/ultimabase.ts` exports
the application `ultimabase` and its `Register` declaration, and
`src/main.ts` starts it.

- [`full-stack`](full-stack/README.md): the most complete application, a
  runnable authenticated Hono application on
  port `1337` with sibling REST and GraphQL transports, PostgreSQL, Password
  Auth Bearer and cookie sessions, role-protected data, audited Master requests,
  both official soft-delete modes with private restoration and purge, atomic
  nested pointer and relation writes, and explicitly exposed plugin operations.
  Its README regions are compiled by the example typecheck; the repository
  end-to-end suites run the application. For a first run, start with
  [`modeling`](modeling/README.md), which needs only Core and PostgreSQL.
- [`todo-backend`](todo-backend/README.md): the reference Todo application
  with Access, ACL, Hooks, Roles, Validation, PostgreSQL and REST in the
  declaration form, and its tests with `testApplication`. Its `//#region`
  blocks are the code of its own README.
- [`soft-delete`](soft-delete/README.md): the Soft Delete plugin end to end
  (both modes, restore, purge, `readDeleted` through Access and Roles, Master
  reads, a partial unique index, REST), tested with `testApplication`. Its
  `//#region` blocks are the code of the Soft Delete page and package README
  (ADR-0330).
- [`access`](access/README.md): the Access plugin end to end (fail-closed
  rules, read granularity, `{ where, item }` mutation rules, principal and
  Roles predicates, partial field rules, combinators, Soft Delete command keys
  and `readDeleted`, `allowWithoutRule` openings, denial diagnostics and
  `can()`), tested with `testApplication`. Its `//#region` blocks are the code
  of the Access page and package README (ADR-0330).
- [`hooks`](hooks/README.md): the Hooks plugin end to end (field Hooks,
  `resolveInput` on data, readable `changes`, `beforeOperation` and
  `afterOperation` in the transaction, `afterCommit`, typed events, global
  Hooks, `all` for a plugin command, a contributed Hook, the depth limit,
  `PublicError` over REST), tested with `testApplication`. Its `//#region`
  blocks are the code of the Hooks page and package README (ADR-0330).
- [`validation`](validation/README.md): the Validation plugin end to end
  (Standard Schema transforms, function and async validators with codes,
  schema checks, changed-fields-only updates, `null` inputs, one
  `VALIDATION_ERROR` for every issue, `updateMany` index paths, `check()`,
  the REST `422` answer), tested with `testApplication`. Its `//#region`
  blocks are the code of the Validation page and package README (ADR-0330).
- [`acl`](acl/README.md): the ACL plugin end to end (`acl: true` in
  `define` and the required `default` of its rule, atomic `grant` and `revoke` sharing, `clientSharing`,
  `select: { acl: true }` and `entries()`, limits, public and role entries,
  `resolveInput`, complete ACLs written by Master, ACL with Access and Roles,
  ACL values and change events), tested with `testApplication`. Its
  `//#region` blocks are the code of the ACL page and package README
  (ADR-0330).
- [`roles`](roles/README.md): the Roles plugin end to end (role schemas with
  `ensure` seed roles, members and included roles through `connect`, cycle
  rejection, `hasRole()` in Access rules, `has()` and `current()`, name and
  UUID references, the request membership cache, Master-only and rule-based
  role management, the `fail` and `cascade` deletion policies, role events,
  REST), tested with `testApplication`. Its `//#region` blocks are the code of
  the Roles page and package README (ADR-0330).
- [`auth`](auth/README.md): Password Authentication end to end (a User
  schema with its own fields, sign-up and login by email, the session's
  member in Access rules, listing, revoking, refreshing and ending sessions,
  the session lifetimes, recent authentication and account deletion,
  password reset, email verification and email change through a test email
  sender, events, attempt limiting, the `/api/auth` routes with Bearer and
  cookie sessions, and a stricter application requiring verified emails),
  tested with `testApplication`. Its `//#region` blocks are the code of the
  Password Authentication page and the `auth-plugin` and `auth-password`
  READMEs (ADR-0330).
- [`postgres`](postgres/README.md): the PostgreSQL plugin end to end (the
  pool from `DATABASE_URL` and its connection settings, `url` and injected
  `pool`, table and column names with the `postgres` rule and `renamedFrom`,
  the column type of each field kind, field, composite and partial indexes,
  `UNIQUE_VIOLATION` and `REFERENCE_VIOLATION`, pointer and relation storage,
  automatic and explicit transactions, keyset pagination, the `override`,
  `fail` and `ignore` schema policies across two releases), tested with
  `testApplication`. Its `//#region` blocks are the code of the PostgreSQL
  page and package README (ADR-0330).
- [`http`](http/README.md): the HTTP layer end to end (the `httpPlugin`
  options: optional application header, CORS origins, body limits, rate
  limits behind a trusted proxy with a shared store and `/health` exempt,
  security headers, Master, the access log; application routes and the
  `PublicError` envelope; a request context resolver; a plugin route and
  mount; the `apiServer` preset with the managed Hono listener, compression
  and graceful shutdown; an existing Hono app with its own listener), tested
  with `testApplication` and over real sockets. Its `//#region` blocks are
  the code of the HTTP and Hono Server pages and the `http-plugin`,
  `hono-server-plugin` and `api-server` READMEs (ADR-0330).
- [`rest`](rest/README.md): the REST plugin end to end (the `/api` mount,
  `rest` rule keys exposing or hiding routes per schema, list
  reads with `where`, `select`, `orderBy`, `include` and cursor pagination,
  single reads, `first`, `count` and `exists`, create, update and delete with
  relation links, an atomic bulk create, the `{ id }` answer of a write,
  the error envelope and its statuses, a `defineOperation` operation, the
  OpenAPI document, `publicWrites`), tested with `testApplication`. Its
  `//#region` blocks are the code of the REST page and package README
  (ADR-0330).
- [`graphql`](graphql/README.md): GraphQL end to end (the `apiServer()`
  preset with Yoga and GraphiQL, `graphql` rule keys
  and `.with({ graphql: false })`, declared filter operators, ordering, relations, a
  `resolveMany` virtual field, cursor pagination with `totalCount`, nested
  create, update and delete, `{ id }` for an unreadable row, validation hints,
  `PERMISSION_DENIED`, `VALIDATION_ERROR` and a `PublicError`, an operation
  typed from its validators, a custom `GraphQLSchema`, direct `execute()`,
  `publicWrites`, and a second application installing each plugin with Yoga
  options and Apollo Sandbox), tested with `testApplication`. Its `//#region`
  blocks are the code of the GraphQL page and the `graphql-plugin`,
  `graphql-yoga-plugin`, `graphql-http` and `graphql-explorer-plugin` READMEs
  (ADR-0330).
- [`modeling`](modeling/README.md): Core data modeling end to end (the
  configured factory, the application with its `validation` options and
  `Register`, a field of each built-in kind with its options, shared and local
  enums, composite indexes and unique targets, embedded objects, virtual
  fields with `resolve` and `resolveMany`, pointers with `restrict` and
  `cascade` deletion, owning, inverse and filtered relations, frozen plain
  results, `toJSON` and the named types), tested with `testApplication`. Its
  `//#region` blocks are the code of the Application and Data Modeling pages
  and the Core README (ADR-0330).
- [`queries`](queries/README.md): Core reading and writing end to end
  (every documented filter operator with the equality shorthand, UUID
  operands, JSON and object paths, pointer and relation predicates;
  selections, inclusions, ordering and keyset pagination; read terminals;
  create, update with atomic increments, delete, unique and composite
  upserts, bulk commands, nested writes; automatic and explicit transactions;
  `FrameworkError`, validation issues and `PublicError`; audited Master
  authority; request values, cancellation, the current principal, policy
  predicates and `can()`), tested with `testApplication`. Its `//#region`
  blocks are the code of the Reading Data, Writing Data, API Error
  Boundaries, Master Authority and Request Identity pages and of the Core
  README (ADR-0330).
- [`plugin-authoring`](plugin-authoring/README.md): plugin authoring end to
  end (an inert factory with a typed setup export, `definePlugin`
  features with server-written fields, commands exposed over REST and GraphQL
  by `.with` keys, a rule read after commit, a raw plugin typing its
  feature, field and rule through Core's slots with an additive patch, a
  field kind and a field option, a capability between two plugins, a
  lifecycle-only resource, owner-private storage, cooperative cancellation, an
  operation with a typed GraphQL binding and a REST route, an independent
  GraphQL schema with a `peers` range, an HTTP route, an environment-dependent
  default, option parsers, and the plugin conformance suites), tested with
  `testApplication`. Its `//#region` blocks are the code of the Build a Plugin
  pages, the Test an Application page and the `plugin-kit`, `testing` and
  Core READMEs (ADR-0330).
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
   README with `<!-- region … -->` markers filled by `yarn docs:regions`.
   Every page and every root, package and example README follows the rule
   "every code block is verified or marked" (ADR-0330):
   `apps/website/tests/verified-code.content.test.ts` discovers them all and
   fails on an unmarked block, except in its commented exemption list.
4. Add the example to `tests/e2e/examples-form-d.postgres.e2e.test.ts` (compile
   list and test count) and to `tooling/ci/typescript-7.ts`.
