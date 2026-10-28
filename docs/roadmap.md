# Roadmap

The path from the restart to the features of the previous base, then beyond.
Each phase ends on a measurable exit criterion; the next phase starts once it
is proven. The commit that meets a criterion ticks it here.

Status: **Phase 6**. Phase 5 is closed: `examples/password-sign-in` signs
up, signs in and applies rules that read `caller.user`, started as
`yarn start` does (`examples/password-sign-in/src/app.test.ts`).

## Phase 0: Tooling

- [x] Yarn workspace on TypeScript 7 and Oxlint, `max-lines` at 400 for
      production code (D-05).
- [x] Package line budgets checked by CI (D-69).
- [x] `yarn validate` runs format, types, lint and Vitest; PostgreSQL tests
      in a separate command (D-06).
- [x] D-06 written into `AGENTS.md`.
- [x] `restart` merged into `main` with `--no-ff`, after confirmation.

Exit: `yarn validate` passes in under one minute, and CI fails on a budget
overrun.

## Phase 1: Typing spike

- [x] Typing cost of the previous base measured on TypeScript 7, as the
      baseline (D-12, D-24).
- [x] Prototype of `defineModel` / `.with`, fields and relations.
- [x] D-12 benchmark: a large model, and 200 models, on TypeScript 7.
- [x] D-24 spike: `App.defineModel` against global interface augmentation.
- [x] D-24 revisited: models list their plugins in `use`, `defineApp`
      assembles the application, measured on 200 models.
- [x] `caller.user` (D-24, D-62) and D-57 settled, which fixes `definePlugin`
      and `defineUser`.

Exit: editor typing cost no worse than the previous base. If it fails, the
design is revisited here, before anything else is built on it.

## Phase 1b: Prototype coverage

The typing prototype covers every typed part of 0.1 before the kernel is
written, so that Phase 2 moves its types instead of discovering them.

- [x] Field validation with Standard Schema, `f.json({ validate })` typed by
      the schema, Zod in the 200-model benchmark (D-23, D-53).
- [x] `defineFunction` and `defineApp({ functions })` (D-27, D-45).
- [x] `defineUser` as auth's `define<Kind>` entry, and a rule on
      `caller.user` without `: boolean` if one exists (D-13, D-62).
- [x] `default: ({ caller }) => ...` and composite unique indexes as
      `findUnique` targets (D-52, D-53).
- [x] The query subset of 0.1 settled and prototyped (D-20).
- [x] Type error messages checked against snapshots; full benchmark run
      again, wide 120 included.
- [x] What hooks receive and return: `beforeFind` filters, `previous`,
      in-place `data`, a plugin's `command`, no `afterFind` (D-71).
- [x] Errors: `PublicError` and the kernel's codes (D-28, D-72).
- [x] `onDelete: 'setNull'` refused on a required relation (D-54).
- [x] `transaction(fn)` (D-36).
- [x] `dbName` on models and fields (D-63).
- [x] A plugin's `stop` (D-15), `defineApp({ masterKey, logger })` (D-49,
      D-58).
- [x] A model's and a function's types (D-74), a function's `run` (D-75),
      `isAuthenticated` (D-10); access rules stay synchronous (D-76).
- [x] Rules and hooks see a `one` relation's key (D-77).
- [x] auth's `signedIn` and `isOwner` (D-79).
- [x] `anyOf` and `allOf` combine read filters (D-81).
- [x] Shared `anyOf` and `allOf` rules, `isOwner` checked on its name (D-83).
- [x] `undefined` ignored in `where`, `data` and query options (D-84).

Exit: every typed part of 0.1 has a prototype example, and the benchmark,
validation and functions included, stays within Phase 1's exit criterion.

## Phase 2: Kernel slice on `memory()`

- [x] 0.1 field types and the 0.1 query subset (D-20).
- [x] Callers and `master` (D-19), model and field access (D-10, D-44),
      relation writes from the other side (D-78),
      `anyOf` and `allOf` filters (D-81).
- [x] A rule's record omits the optional side of a one-to-one (D-87).
- [x] Hooks in the order of D-67, validation (D-23), errors (D-28, D-82),
      transactions (D-36).
- [x] Plugins at runtime: commands, `redirect` and plugin hooks (D-15, D-57,
      D-89).
- [x] Cascades run by the kernel (D-54, D-90).
- [x] `start`, `stop` and the logger (D-58, D-59, D-91).
- [x] The manifest's version checks (D-57, D-95).
- [x] Adapter contract suite started (D-02, D-73, D-94).
- [x] `@ultimabase/soft-delete` (D-17, D-96).
- [x] The prototype's types move into `packages/ultimabase`, each export in
      the package its decision names, and the typing benchmark measures the
      package. Kernel tests build user callers with
      `asUser` (D-80, D-97).

Exit: soft delete under 150 lines (D-15); the kernel within its budget. The
full typing campaign, run again on the package, stays within reach of the
reference of
[Phase 1b closed](../bench/typing/README.md#phase-1b-closed-the-full-campaign):
at 200 models with field rules and schemas, a query edit under 800 ms
(696 ms then) and a model edit under 50 ms (30 ms then).

## Phase 3: PostgreSQL adapter

- [x] Kysely, one round trip per read with relations and access filters
      (D-46, D-47).
- [x] Writes in the fewest round trips: one statement with its checks,
      nested writes through CTEs, a transaction only when one serves
      (D-48, D-99), a write's answer taken from the rows it changed
      (D-104).
- [x] A write benchmark: round trips and time per write case, on `memory()`
      and PostgreSQL (D-48), in [`bench/writes`](../bench/writes/README.md).
- [x] A comparison benchmark beside Prisma, Drizzle and `pg` (D-100), in
      [`bench/compare`](../bench/compare/README.md).
- [x] Cascades (D-54), one write when no hook runs (D-102), PostgreSQL 15
      to 18 (D-50).
- [x] Development sync, `migrate create` and `migrate deploy` (D-26, D-105).
- [x] `ultimabase dev` and `ultimabase start` (D-105).
- [x] Data migrations: `migrate status`, `reset`, readable failures (D-105).
- [x] Rolled-back code, lock timeout, Windows checkouts (D-105).
- [x] Files without a transaction, for `create index concurrently` (D-105).

Exit: the contract suite passes on `memory()` and PostgreSQL, round-trip
counts included.

## Phase 4: Transports

- [x] `httpPlugin()`: Hono, CORS and body limit (D-66), the typed caller in
      a route and the master key (D-49, D-106).
- [x] `graphqlPlugin()`: `graphql-http`, Relay, depth limit, GraphiQL (D-34, D-41,
      D-55, D-107).
- [x] `defineFunction` (D-27, D-45, D-109).
- [x] Decide a function's nullable output, as `postBySlug(slug): Post` in
      GraphQL; `Post.nullable()` (D-109).

Exit: a full CRUD example over GraphQL against PostgreSQL.

## Phase 5: Authentication

- [x] `auth`: `defineUser`, sessions, Identify (D-33, D-39, D-62).
- [x] `passwordPlugin()`: Argon2id, sign-in rate limit (D-56, D-113).
- [x] Plugin functions and a function's `client`; auth's `signOut`,
      `viewer` and `AuthAccount` (D-113).
- [x] Decide how `httpPlugin()` reads a client's address behind a proxy
      (D-113, D-116).
- [x] `httpPlugin({ proxies })` and its warning (D-116).
- [x] Decide how a plugin keeps its own models, as the sessions, out of the
      transports: D-24 has every transport act on every model (D-110).
- [x] A plugin's own models at run time (D-110).
- [x] `deleteMany`, a delete's rules and hooks on each row (D-111).
- [x] Decide auth's sessions, Identify and the API of sign-in methods (D-112).
- [x] Decide `passwordPlugin()`, linked accounts and plugin functions
      (D-113).
- [x] Decide `passwordPlugin()`'s limits against many addresses (D-114).
- [x] `passwordPlugin()`: IPv6 networks, the account ceiling, the hashing
      queue and the sign-up limit (D-114).
- [x] Decide auth and password after their audit (D-115).
- [x] auth and password after their audit (D-115).
- [x] Decide password reset and email verification (D-113, D-117).
- [x] Password reset: `sendEmail`, `requestPasswordReset`, `resetPassword`
      (D-117).
- [x] Email verification: `emailVerified`, `verifyEmail`,
      `sendVerificationEmail` (D-117).

Exit: an example with sign-up, sign-in and rules on `caller.user`.

## Phase 6: Release 0.1

- [x] Packages publish compiled JavaScript, installed from their packs and
      run by `yarn test:packed` in CI (D-118).
- [x] Decide how `graphqlPlugin()` bounds the cost of validating a document
      under its 2,000 tokens: 1,993 copies of one field take 100 ms of CPU
      in graphql-js's overlapping-fields rule, which compares every two
      fields of one name; ten such requests a second fill a core (D-55,
      D-107). The bound also counts each root list field and its
      `totalCount`: a document under 2,000 tokens holds about 150 aliased
      roots, each a scan of its table when its filter matches little.
      1,000 pairs of one key, 20 root fields (D-107).
- [x] Decide whether D-103 stays: reading the changed row from its
      RETURNING saves no round trip, 0.06 to 0.09 ms in `bench/writes`, for
      about 25 lines of the PostgreSQL write compiler.
- [x] Decide roles and ACL (D-13, D-68, D-120 to D-124).
- [x] Decide JSON fields typed from their schema (D-125).
- [x] JSON fields typed from their schema (D-125).
- [x] Roles (`defineRole`, D-13) and ACL (D-68).
- [x] Decide lists of other field types: enum, number, date, boolean (D-120,
      D-127).
- [x] Lists of enums and numbers (D-127).
- [x] Decide nested creation (D-20, D-68): D-128.
- [x] Nested creation, `create` in a relation write (D-20, D-68).
- [x] Decide REST (D-25, D-68): D-129.
- [x] REST (D-25, D-68).
- [x] Decide `testApplication` and the starter (D-40, D-61): D-130.
- [x] `@ultimabase/testing` (D-40, D-80), `create-ultimabase` (D-61).
- [x] Decide the examples and Changesets (D-31, D-60): D-131.
- [x] One example per feature, tested as an application, and Changesets
      (D-131).
- [x] Decide integer fields and number updates (D-20): D-132.
- [x] Integer fields and number updates (D-132).
- [x] Decide `updateMany` (D-20, D-48): D-133.
- [x] `updateMany` (D-133).
- [x] Decide `_count` and sorting through relations (D-20, D-46): D-134.
- [x] `_count`, nested `totalCount` and sorting through relations (D-134).
- [x] Decide `OrThrow` reads, `omit`, a delete's `select` and `createMany`
      (D-20): D-135.
- [x] `OrThrow` reads, `omit`, a delete's `select` and `createMany` (D-135).
- [x] Decide reads that fetch the fields they return (D-73): D-136.
- [x] Reads fetch the fields they return (D-136).
- [x] Decide raw SQL and tests on the declared database (D-130): D-137.
- [x] Raw SQL on `postgres()` and tests on the declared database (D-137).
- [x] Decide nested writes in `update` (D-20, D-128): D-138.
- [x] Nested `set`, `update`, `delete` and `connectOrCreate` (D-138).
- [x] Decide one transport core and shared value checks (D-130): D-139.
- [x] One transport core and shared value checks (D-139).
- [x] Decide case-insensitive filters (D-20): D-140.
- [x] Case-insensitive filters (D-140).
- [x] Decide trigram indexes (D-52, D-140): D-141.
- [x] Trigram indexes (D-141).
- [x] Decide `upsert` (D-20, D-129): D-142.
- [x] `upsert` (D-142).
- [x] Decide `aggregate` (D-20, D-44): D-143.
- [x] `aggregate` (D-143).
- [x] Decide an OpenAPI document (D-125, D-129): D-144.
- [x] An OpenAPI document (D-144).
- [x] Decide a decimal field type (D-12, D-132): D-145.
- [x] A decimal field type (D-145).
- [x] Decide `groupBy` (D-20, D-143): D-146.
- [x] `groupBy` (D-146).
- [x] Decide `distinct` (D-20, D-146): D-147.
- [x] `distinct` (D-147).
- [x] Decide full-text search (D-20, D-141): D-148.
- [x] Full-text search (D-148).
- [x] Decide `having`, rows from bulk writes, `nulls`, list updates and JSON
      paths (D-20, D-146): D-149.
- [x] `having`, bulk writes' rows, `nulls`, list updates and JSON paths
      (D-149).
- [x] Decide calendar dates, field descriptions and shared enums (D-09,
      D-65): D-150.
- [x] Calendar dates, field descriptions and shared enums (D-150).
- [x] Decide virtual fields and relations filtered by a `where`: D-151.
- [ ] Filtered relations and virtual fields (D-151).
- [ ] Documentation website (D-31).
- [ ] A full audit of every package, its fixes merged, before publication.
- [ ] Publication, after confirmation.

Exit: `npm create ultimabase` produces an application that starts.

## Phase 7: Parity with the previous base

- [ ] `vector()` field type for pgvector (D-32).

Exit: every feature of the previous base has an example, in far fewer lines.

## Beyond

Files, OAuth and magic link, realtime, jobs, admin, multi-tenancy (D-25).
`migrate squash`, once an application's history needs it (D-105).
