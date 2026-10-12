# ADR-0327: `testApplication` and the create-app starter

- Status: proposed
- Date: 2026-10-12
- Refines: the Testing and create-app records, ADR-0297 (form D), ADR-0312 (`DATABASE_URL` at
  start, environment defaults), ADR-0317 (`allowWithoutRule: 'development'`), ADR-0318
  (`waitForAfterCommit`), ADR-0323 (`fetch()` without a port), ADR-0325 (`apiServer`), ADR-0326
  (authentication); applies ADR-0288
- Approval: decisions of the Testing review (`docs/handoff/revue-plugins/testing.md`, decisions 1
  to 6) and of the create-app review (`create-app.md`, decisions 1 to 7), validated by the user on
  2026-10-09; record to be accepted by the user

## Context

Testing an application today means rebuilding it in each test with fixtures, calling
`readVitestPoolId`, and wiring a database per worker by hand; principals and Master contexts need
plugin-author helpers. The create-app starter has no `dev` script, no generated test, asks for
REST without selecting it, opens nothing in development without writing rules first, and assumes
a database is available. The examples still use the old declaration form in places.

## Decision

**Testing (`@ultimabase/testing`).**

1. **`testApplication(ultimabase)`** starts the production application itself (same plugins, same
   rules) on an isolated database schema and stops it with `await using`:
   `await using t = await testApplication(ultimabase)`. The connection comes from
   `TEST_DATABASE_URL`, otherwise from a PostgreSQL container started once.
2. **`t` provides** `reset()` (fast emptying between tests through a neutral adapter capability;
   `TRUNCATE` for PostgreSQL), `fetch(path, init?)` (in-memory HTTP through the HTTP plugin),
   `as(principal, fn)` and `asMaster(fn)`, and `afterCommit()` (awaits post-commit work and
   events). Principal injection exists only in an application started by `testApplication`, never
   in production.
3. **Vitest configuration** from `@ultimabase/testing/vitest`: `test: { ...ultimabaseTesting() }`
   starts PostgreSQL once, gives each worker its schema and cleans up; `readVitestPoolId` leaves
   the public API.
4. **Separate entries**: `@ultimabase/testing` for applications and `@ultimabase/testing/plugins`
   for plugin conformance. `withPluginTypegenConformance` leaves with Typegen (migration 6.8).

**create-app starter.**

5. **Scripts**: `dev` is `node --watch --env-file=.env src/main.ts` (Node 24 runs TypeScript
   without a build); `test` runs Vitest with the generated configuration.
6. **Defaults**: REST is selected by default, in prompts and with `--yes`; the starter installs
   `accessPlugin({ allowWithoutRule: { all: 'development' } })`, so everything works in
   development with a warning and production refuses to start until rules are written, with an
   explanatory message.
7. **First test**: `tests/task.test.ts` uses `testApplication`.
8. **Database**: Docker Compose by default (`docker compose up --wait`); when Docker is missing,
   create-app says so and offers an existing database URL.
9. **Generated projects are checked** by Prettier and ESLint in create-app's own tests.
10. **Form D everywhere**: generated schemas, the reference example `examples/todo-backend` and
    `examples/minimal` use form D only (no Typegen, no schema-less `Register` workaround), and the
    `.with({})` calls that only avoided the Register cycle are removed.

## Consequences

- `npm create @ultimabase/app` works only after the packages are published (documented).
- Tests: `testApplication` isolation across workers, `reset`, `fetch`, `as`/`asMaster` and their
  absence outside tests, `afterCommit`, the Vitest helper with a container and with
  `TEST_DATABASE_URL`, create-app scripts, defaults and prompts, the production refusal of the
  prototype opening, the generated test passing in a generated project, the Docker-missing path,
  Prettier and ESLint on generated projects, examples compiling without Typegen; DX audit.
- Documentation impact: both (testing guide, quick start, create-app README, examples READMEs).

## Out of scope

The `ultimabase dev` command and configuration file (on hold), publication itself.
