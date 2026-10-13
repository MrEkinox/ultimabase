# Test ownership

Tests under `tests/`, package `tests/` directories, `*.test-d.ts` files and
tests importing only public entries protect the public contract: change them
only when that contract deliberately changes. Internal tests beside the source
follow their modules and must not lose an assertion when they move.

- `e2e`: complete application behavior across multiple packages.
- `fixtures`: schemas and application configurations shared by tests.
- `performance`: guarded performance regression suites.
- `register-cycle`: compile-only reproduction cases of the `Register` cycle
  (ADR-0297, register-cycle note), one program per case, each checked from
  package sources (`tsconfig.json`) and built packages (`tsconfig.dist.json`).

Focused package unit and compile-time tests live beside their source. A package's
`tests` directory owns public-export and cross-domain behavior. Its `tests/e2e`
suites exercise its own contract through compiled exports, with supporting
packages when needed. Root `tests/e2e` owns application-wide composition and
transport parity. Using several plugins alone does not make a suite root-owned.

## File conventions

- `packages/*/src/**/*.test.ts`: focused package runtime tests.
- `packages/*/src/**/*.test-d.ts`: focused package compile-time tests.
- `packages/*/tests/**/*.test.ts`: package-level tests, excluding E2E and performance files.
- `packages/*/tests/e2e/**/*.e2e.test.ts`: package-owned built-export E2E.
- `packages/*/tests/e2e/**/*.postgres.e2e.test.ts`: package-owned PostgreSQL E2E.
- `packages/*/tests/**/*.test-d.ts`: package-level compile-time integration tests.
- `tests/e2e/**/*.e2e.test.ts`: Docker-free cross-package end-to-end tests.
- `tests/e2e/**/*.postgres.e2e.test.ts`: worker-isolated PostgreSQL end-to-end tests.
- `packages/*/tests/performance/**/*.performance.test.ts`: package-owned performance suites.
- `tests/performance/**/*.performance.test.ts`: cross-package performance budgets.

Vitest runs these conventions as distinct projects named `unit`, `e2e`,
`postgres-e2e`, `performance`, and `types`. Runtime files use isolated fork
workers and may execute in parallel. Performance budgets run serially: Runtime
checks use structural counters, while compiler/editor checks retain their measured
timing budgets. The PostgreSQL project starts one global Testcontainer,
shares only its connection URI, and assigns a reset schema to every worker
slot. The ordinary E2E project remains Docker-free for focused package archive
checks.

`packages/*/tsconfig.test.json` isolates each package's test compiler roots.
`tests/fixtures/register.d.ts` declares the one schema-less `Register` the
test program shares (ADR-0297).

`tests/tsconfig.json` associates root E2E files with the same strict TypeScript
settings used by the test runner. Editors should discover this nearby project
automatically, which preserves contextual autocomplete for schema-dependent
Access, query, and mutation APIs.

`runtime-postgres.postgres.e2e.test.ts` verifies CRUD, transactions, bulk, and
upsert persistence. `hooks-plugin-postgres.postgres.e2e.test.ts` adds the live
optional Hooks schema, field, plugin, policy, rollback, output, and post-commit vertical.
`pointer-postgres.postgres.e2e.test.ts` proves pointer CRUD, inclusion, Access,
hooks, atomicity, circular targets, and referential actions against PostgreSQL.
`relation-postgres.postgres.e2e.test.ts` proves owning and inverse relations,
all edge mutations, predicates, target Access, hooks, rollback, and cleanup.
`explicit-relationship-postgres.postgres.e2e.test.ts` proves that business-data
edges remain ordinary schemas with composite uniqueness and transactions.
`graphql-cross-transport-parity.postgres.e2e.test.ts` runs the public minimal
application through direct TypeScript, REST, networkless GraphQL, and Yoga. It
proves shared Runtime semantics plus authentication, HTTP session, Master
provenance, exposure, and safe application-selection boundaries.
`nested-write-public-vertical.postgres.e2e.test.ts` uses that same public
application to create, include, update, and disconnect one recursive aggregate
through all four entry points, then compares their persisted PostgreSQL graphs.
`virtual-field-public-vertical.postgres.e2e.test.ts` extends the same application
with primitive, nullable, list, structured, asynchronous, context-dependent,
and Access-protected virtual results. It compares direct TypeScript, REST,
networkless GraphQL, and Yoga nested mutation outputs, verifies authenticated
and Master presentation, and crosses more than two fixed resolver batches.
The focused nested-write suites retain the policy, lifecycle, limits, rollback,
cancellation, application-isolation, and transport-safe failure matrix.
Built E2E retain their public package imports and worker-isolated schemas.
The coverage projects run the same source-coverable suites with source aliases;
archive and compiled-artifact audits remain built-only.
This includes language-service suites that read compiled declarations and suites
that invoke built exports exclusively through Node subprocesses: Vitest's source
aliases cannot affect either path. They run once through the built E2E project,
including in complete GitHub validation. The discovery guard keeps their explicit
exceptions separate from source-coverable E2E; production coverage inclusion and
thresholds stay unchanged.

PostgreSQL E2E suites start real Testcontainers and therefore require a working
Docker-compatible container runtime. Package unit and type tests never require
Docker.

## Commands

- `yarn validate`: run the ordinary repository format, type, unit/type/performance
  test, lint, and build contract in its canonical order.
- `yarn validate:affected`: run the GitHub affected-check plan locally for the
  changes since the merge base with `main` (uncommitted files included); a
  change to shared inputs runs `yarn validate:full` instead.
- `yarn validate:full`: the complete gate required before merging into `main`.
  It runs every suite once: format, typecheck, lint, build, performance budgets
  without instrumentation, complete source-mode coverage of unit, type, E2E and
  PostgreSQL E2E projects, dependency constraints, and public-documentation
  validation.
- `yarn test`: run package unit tests, compile-time type tests, and deterministic performance budgets.
- `yarn test:all`: run unit, type, build, cross-package E2E, and package archive checks.
- `yarn test:e2e`: build every package, then run ordinary and PostgreSQL E2E tests.
- `yarn test:pack`: build every package, then run every built-export E2E suite (archive checks, Node consumers, packed-declaration editor checks).
- `yarn test:performance`: run deterministic performance regression budgets.
- `yarn test:coverage`: run unit, type, performance, ordinary E2E, and PostgreSQL
  E2E projects with V8 coverage. Local execution uses four workers; the GitHub
  coverage job sets `ULTIMABASE_COVERAGE_WORKERS=2` for the proven memory-safe
  bound. Yarn passes this value as Vitest's CLI `maxWorkers`, preserving one
  worker for the serial performance project. Do not use `VITEST_MAX_WORKERS`:
  its native override also changes serial projects' resolved worker limit.
- `yarn test:types`: run compile-time type tests only.
- `yarn test:watch [path]`: watch package-local unit tests, optionally filtered by path.
- `yarn typecheck:typescript-7`: type-check with TypeScript 7 (see below).

## Package commands

Build dependencies once with `yarn build` before running built-export E2E or
source tests that consume another workspace's declarations. Then, for example:

```sh
yarn workspace @ultimabase/rest-plugin test
yarn workspace @ultimabase/rest-plugin test:unit
yarn workspace @ultimabase/rest-plugin test:types
yarn workspace @ultimabase/rest-plugin typecheck:tests
yarn workspace @ultimabase/rest-plugin test:e2e:built
```

`test` includes unit and type tests. `test:types` runs the package's type
assertions and checks its local test program; `typecheck:tests` checks that
program directly with TypeScript. `test:e2e:built` selects both ordinary and
PostgreSQL E2E, starting Docker infrastructure only when PostgreSQL files match.
Use `yarn workspace <name> exec vitest run --project e2e` for Docker-free E2E.

Focused Hooks and Access conformance belongs to their packages. GraphiQL and
Apollo Sandbox own their browser behavior, while root suites retain explorer
collisions, application isolation, and compatible-provider composition. Shared
fixture modules contain helpers only; importing one never executes another suite.

The root `yarn test:coverage` remains the complete coverage gate. A package-only
run does not replace it or apply global coverage thresholds to a partial suite.
See [ADR-0250](../docs/adr/0250-package-owned-e2e-and-type-tests.md).

## GitHub Actions

GitHub selects affected packages, their transitive dependants, and the integration
suites that consume them. Documentation-only changes run documentation checks.
Shared configuration changes and uncertain diffs fall back to complete validation;
manual workflow dispatch also runs the complete coverage gate. A targeted run does
not measure or enforce global coverage. Local commands above keep their existing
behavior. See [ADR-0251](../docs/adr/0251-affected-github-validation.md) and
[the CI tooling guide](../tooling/ci/README.md).

## TypeScript 7

TypeScript 6 (`typescript`) runs every suite. The TypeScript 7.0.2 native
compiler is pinned beside it as the `typescript-7` alias, and
`yarn typecheck:typescript-7` ([script](../tooling/ci/typescript-7.ts)) checks
with it, in order: the packages (`--build tsconfig.json`, which emits their
declarations), the test program without the TypeScript JS API
(`tooling/tsconfig/test-typescript-7.json`: every unit, type and E2E file,
including `*.test-d.ts` assertions), the `minimal`, `todo-backend`,
`soft-delete`, `access`, `hooks`, `validation`, `acl`, `roles`, `auth`, `postgres`, `http` and `schema-form-d` examples (sources and built packages), and the `register-cycle`
cases. Language-service suites, typescript-eslint and declaration bundling
need the TypeScript JS API and stay on TypeScript 6.

`test-typescript-7.json` leaves out four Core field tests whose
`@ts-expect-error` precedes a multi-line call: TypeScript 7 reports the same
"No overload matches this call" error on the offending property, one or more
lines below the directive. The GitHub `TypeScript 7` job runs the same command
whenever the build is selected; it takes about 20 seconds locally (10-minute
job limit).

## Load-sensitive suites

Some suites depend on machine load. Rerun them alone on a calm machine before
concluding anything from a failure:

- `packages/create-app/tests/e2e/create-app-packed.e2e.test.ts` (120 s timeout,
  dominated by building 16 generated projects);
- packed archive audits such as `core-archive-declarations` (10 s and 20 s
  timeouts);
- PostgreSQL E2E suites (20 s timeout): one test that still times out can
  leave its application active and cascade "Another UltimaBase application is
  active" failures;
- `create-app-api.postgres.e2e.test.ts`, which listens on `127.0.0.1:1337`.

`loadMinimalExample` (`tests/e2e/rest-public-vertical-support.ts`) imports
the example modules sequentially, schemas first: parallel `vi.importActual`
calls could evaluate `examples/minimal/src/schema.ts` twice in one worker and
fail with `Schema ExampleArticle has not been compiled by an application`.
