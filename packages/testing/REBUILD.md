# `@ultimabase/testing` rebuild notes

Rebuilt from reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`
(branch base `58fec8c`, rebased on `37878ab` before the final validation)
following `docs/rebuild/PROTOCOL.md`. The public contract is unchanged: every
`src/index.ts` export, signature, generic, literal type and JSDoc; every
validation message and its order; the conformance contract names, their run
order and the `PluginConformanceError` shape; fixture freezing; disposal of
every application created by the runner (including after a failed check); and
the PostgreSQL worker namespace, SQL statements and cleanup. Core, Shared and
Typegen are consumed only through their public exports, as before.

The built `dist/index.d.ts` is byte-for-byte identical to the reference build.

## Production lines (`node tooling/measure-rebuild.mjs .`)

|           | testing production lines |
| --------- | ------------------------ |
| Before    | 1243                     |
| After     | 1162                     |
| Reduction | 81 lines (6.5%)          |

The package was already close to minimal. What remains is mostly public
contract: the conformance contract vocabulary and result types
(`contracts.ts`), the fixture and suite generics that carry exact subject,
support and schema tuples into verifiers (checked by `conformance.test-d.ts`
and the language-service tests), their JSDoc, the PostgreSQL worker and the
fake transport, which were left unchanged. Largest file: `runner.ts` (372
physical lines).

## Design summary

| Module                       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugins/runner.ts`          | `configurePlugins` (a loop of one `.use(plugin)` per definition through two `as ConfiguredUltimaBaseFactory` casts) became one `UltimaBase.use(...plugins)` call: same ordered plugin tuple, no cast. The seven `try { ... } finally { dispose }` blocks share `disposeAfter(applications, use)`. The capability-group table became a loop over `provides`/`requires`/`optional`. The single-use `normalizePluginConformanceFixture` was inlined into `freshFixture()`; `freshApplication()` names the frequent fixture + application pair. |
| `plugins/fixture.ts`         | The internal `normalizePluginConformanceFixture` export moved into the runner (its only user).                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `plugins/suite.ts`           | `check()` no longer repeats the validation that the constructor it calls performs on the appended entry; `definePluginConformanceSuite` no longer repeats the `createFixture` and `expected` checks that the constructor performs first (see "Removed checks").                                                                                                                                                                                                                                                                             |
| `plugins/static-snapshot.ts` | The determinism snapshot is internal and only compared through `JSON.stringify`, so it is no longer copied and frozen at every level. Owners keep their fixed `instanceId`, `pluginId`, `version` key order; absent parts are `undefined` and disappear from the JSON text exactly as the omitted keys did. One `PublicOwner` type replaces the repeated inline type; `snapshotMutations` is a module function.                                                                                                                             |
| `plugins/typegen-check.ts`   | The intermediate frozen `normalized` record became two locals (`applicationId`, `verify`); defaulting still uses `??`.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| unchanged                    | `index.ts`, `plugins/contracts.ts`, `operations/fake-public-transport.ts`, `postgres/worker.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Preserved on purpose: fixtures are still re-snapshotted through
`createPluginConformanceFixture` by reading `schemas`, `subject` and
`supportPlugins` from the factory result (so a JavaScript factory returning
`null` still fails `manifest` with the engine's
`Cannot read properties of null (reading 'schemas')`); the static-determinism
check still creates both fixtures before both applications; application
isolation and static determinism still dispose both applications concurrently;
optional checks still dispose created applications in reverse creation order;
`instance-identity` still uses only the first two `instanceIds`.

A runtime comparison script imported the reference build (copied from the
coordinator checkout's `packages/testing/dist`) and the rebuilt build side by
side and compared results, error classes, messages, contracts, causes and
freezing for 33 cases: every validation error of
`definePluginConformanceSuite`, `PluginConformanceSuite` (constructor and
`check`), `withPluginTypegenConformance` and `createPluginConformanceFixture`;
suite and fixture shapes; and complete `runPluginConformance` runs (successful,
instance identity, privilege and environment denial, Typegen, manifest
mismatches, failing optional checks, a `null` fixture). No difference.

## `as` casts

No cast was added. Removed: the two `as ConfiguredUltimaBaseFactory<readonly
PluginDefinition[]>` casts of `configurePlugins`. Kept unchanged: the four
`as unknown as TSchemas` / `as unknown as TSupport` casts in
`createPluginConformanceFixture`. (`['provides', 'requires', 'optional'] as
const` in the runner is a const assertion, not a type cast.)

## Removed checks

1. `PluginConformanceSuite.check()`: the unknown-contract, verifier-function
   and duplicate-contract checks were removed from the method body. The method
   immediately calls the constructor with `[...this.checks, { contract, verify }]`,
   and the constructor runs the same three checks, in the same order and with
   the same messages, on every entry. The existing entries already passed them
   when this suite was constructed and are frozen records, so the first failing
   entry is always the appended one. Covered by
   `keeps suite builders immutable and rejects duplicate checks` and by the
   comparison cases (unknown, non-function, unknown + non-function, duplicate,
   duplicate + non-function).
2. `definePluginConformanceSuite()`: the `createFixture must be a function`
   and `assertExpected` checks were removed. The constructor called next runs
   exactly these two checks first, in the same order, before validating
   `instances`; the plain-object check of the options stays in the factory.
   Covered by the comparison cases (missing `createFixture`, empty `pluginId`,
   `null` expected facts, invalid and duplicate instances).

## Behaviour differences

None through the public API. Implementation details that changed and that no
public contract describes:

- The application class is one `UltimaBase.use(...plugins)` subclass instead
  of one nested subclass per plugin. The configured plugin tuple, `instanceof
UltimaBase`, the schema namespace and every application behavior are the
  same; only prototype-depth introspection would notice.
- `withPluginTypegenConformance` calls `verify(generated)` as a plain function
  instead of as a method of its internal options snapshot (`this` was that
  private record).
- Option getters on untyped JavaScript inputs are read fewer times (for example
  `createFixture` once instead of twice in `definePluginConformanceSuite`).

## Test mapping

- No file under `tests/`, no `*.test-d.ts`, no `src/**/*.test.ts` and no test
  outside the package was edited.
- `src/plugins/conformance.test.ts` and `src/plugins/conformance.test-d.ts`
  import the public entry; `src/postgres/worker.test.ts` and
  `src/postgres/worker.test-d.ts` import `./worker.js`, which is unchanged.
- No `packages/testing/src` path is listed in `apps/website/content` `sources`.

## Pre-existing failures (untouched tree, base `58fec8c`)

`yarn build` passed. `--project unit --project types packages/testing
packages/plugin-kit`: 14 files, 39 tests passed, no type errors.
`--project e2e`: 3 files, 3 tests passed. `--project postgres-e2e`: 1 file,
1 test passed. No pre-existing failure in the focused suites.

## Reference bugs found

None.

## Validation

Final tree: branch `rebuild/testing-plugin-kit` rebased on `37878ab`. Both
packages were validated together on the same tree. The machine was shared with
other agents (load average 37 to 103 during the run).

| Command                                                                               | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn build`                                                                          | pass (before the suites, and again after `tsc --build`)                                                                                                                                                                                                                                                                                                                                                                                                    |
| `yarn vitest run --project unit --project types packages/testing packages/plugin-kit` | 14 files, 39 tests passed, no type errors (baseline: same counts)                                                                                                                                                                                                                                                                                                                                                                                          |
| `yarn vitest run --project e2e packages/testing packages/plugin-kit`                  | 3 files, 3 tests passed                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `yarn vitest run --project postgres-e2e packages/testing packages/plugin-kit`         | 1 file, 1 test passed                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| consumers (1), `--project unit --project types`                                       | 221 files, 1012 tests passed, no type errors                                                                                                                                                                                                                                                                                                                                                                                                               |
| `yarn vitest run --project e2e tests/e2e`                                             | 216 of 219 passed (47 files). Three load timeouts: `core-archive-declarations` (10 s), `typegen-generated-types` (20 s) and `create-app-packed` "writes a valid graph for each official plugin selected alone" (120 s). Rerun alone: `core-archive-declarations` 22/22 passed, `typegen-generated-types` 4/4 passed; `create-app-packed`: first isolated rerun timed out again at 120 s (load average about 70), second isolated rerun 6/6 passed (58.1 s) |
| `yarn vitest run --project postgres-e2e tests/e2e`                                    | 182 of 191 passed (55 files). `core/runtime-postgres` timed out on its first test (5 s) and its 7 later tests then failed with `Another UltimaBase application is active` (the timed-out application was never disposed); `rest-public-vertical` timed out (5 s). Rerun alone: `runtime-postgres` 8/8 passed, `rest-public-vertical` 2/2 passed                                                                                                            |
| `yarn vitest run --project website-content`                                           | 17 files, 66 tests passed                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `yarn test:pack:built`                                                                | 32 files, 173 tests passed (includes the packed plugin-kit authoring language-service and plugin-kit e2e tests and the packed JavaScript conformance run)                                                                                                                                                                                                                                                                                                  |
| `yarn eslint packages/testing packages/plugin-kit`                                    | 0 errors, 0 warnings                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `yarn prettier --check packages/testing packages/plugin-kit`                          | pass                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `yarn tsc --build packages/testing packages/plugin-kit`                               | pass                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `yarn tsc -p packages/testing/tsconfig.test.json`                                     | pass                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `yarn tsc -p packages/plugin-kit/tsconfig.test.json`                                  | pass                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `node tooling/measure-rebuild.mjs .`                                                  | testing 1243 → 1162, plugin-kit 778 → 722                                                                                                                                                                                                                                                                                                                                                                                                                  |

(1) Consumers from `git grep -l -e "@ultimabase/testing" -e "@ultimabase/plugin-kit" -- packages tests examples apps`:
`access-plugin`, `acl-permissions-plugin`, `apollo-sandbox-plugin`,
`graphiql-plugin`, `graphql-plugin`, `graphql-yoga-plugin`, `hooks-plugin`,
`http-plugin`, `password-auth-plugin`, `pg-vector-plugin`, `postgres-plugin`,
`rest-plugin`, `roles-plugin`, `server-hono-plugin`, `soft-delete-plugin` and
`validation-plugin` (unit/types above; their e2e folders are matched by the two
`tests/e2e` runs); `packages/core` only through the e2e fixture
`tests/e2e/fixtures/plugin-operation-no-typegen.mjs` (covered by the `tests/e2e`
e2e run; Core's own unit/types suites do not import either package and were not
run); the root `tests/e2e` files and `tests/fixtures` (covered by the two
`tests/e2e` runs); `apps/website` (covered by `website-content`). No file under
`examples` matches.
