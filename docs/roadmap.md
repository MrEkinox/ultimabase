# Roadmap

The path from the restart to the features of the previous base, then beyond.
Each phase ends on a measurable exit criterion; the next phase starts once it
is proven. The commit that meets a criterion ticks it here.

Status: **Phase 3**. Phase 2 is closed: the kernel slice runs on `memory()`
and the
[typing campaign](../bench/typing/README.md#phase-2-closed-the-full-campaign)
holds on the package.

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
      (D-48, D-99).
- [x] A write benchmark: round trips and time per write case, on `memory()`
      and PostgreSQL (D-48), in [`bench/writes`](../bench/writes/README.md).
- [x] A comparison benchmark beside Prisma, Drizzle and `pg` (D-100), in
      [`bench/compare`](../bench/compare/README.md).
- [ ] Cascades (D-54), PostgreSQL 15 to 18 (D-50).
- [ ] Development sync, `migrate create` and `migrate deploy` (D-26).

Exit: the contract suite passes on `memory()` and PostgreSQL, round-trip
counts included.

## Phase 4: Transports

- [ ] `httpPlugin()`: Hono, CORS and body limit (D-66); decide how a Hono
      route reads the typed caller (D-27).
- [ ] `graphqlPlugin()`: `graphql-http`, Relay, depth limit, GraphiQL (D-34, D-41,
      D-55).
- [ ] `defineFunction` (D-27, D-45), master key (D-49).
- [ ] Decide a function's nullable output, as `postBySlug(slug): Post` in
      GraphQL; today `run` throws `NOT_FOUND` (D-45, D-72).

Exit: a full CRUD example over GraphQL against PostgreSQL.

## Phase 5: Authentication

- [ ] `auth`: `defineUser`, sessions, Identify (D-33, D-39, D-62).
- [ ] `passwordPlugin()`: Argon2id, sign-in rate limit (D-56).

Exit: an example with sign-up, sign-in and rules on `caller.user`.

## Phase 6: Release 0.1

- [ ] `@ultimabase/testing` (D-40, D-80), `create-ultimabase` (D-61).
- [ ] `examples/` run by CI (D-31), Changesets (D-60).
- [ ] Documentation website (D-31).
- [ ] Publication, after confirmation.

Exit: `npm create ultimabase` produces an application that starts.

## Phase 7: Parity with the previous base

- [ ] REST (D-25).
- [ ] Roles (`defineRole`, D-13) and ACL.
- [ ] `vector()` field type for pgvector (D-32).
- [ ] Nested creation, `create` in a relation write, before 1.0 (D-20).

Exit: every feature of the previous base has an example, in far fewer lines.

## Beyond

Files, OAuth and magic link, realtime, jobs, admin, multi-tenancy (D-25).
