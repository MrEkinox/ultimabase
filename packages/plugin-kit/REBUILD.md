# `@ultimabase/plugin-kit` rebuild notes

Rebuilt from reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`
(branch base `58fec8c`, rebased on `37878ab` before the final validation)
following `docs/rebuild/PROTOCOL.md`. The public contract is unchanged: every
`src/index.ts` export, signature, overload, generic, literal type and JSDoc
(TypeScript DX is the product: inference of option results, Standard Schema
input/output types, event payload types and patch tuples, plus the hovers
checked by the source and packed language-service tests); every validation
message and its order; event delivery semantics (privilege check, zero-observer
rule, active transaction requirement, payload snapshot, post-commit delivery in
contribution order, single error rethrown or `AggregateError`); and the
dependency set (`@ultimabase/core`, `@ultimabase/shared`,
`@standard-schema/spec`).

The built `dist/index.d.ts` is byte-for-byte identical to the reference build.

## Production lines (`node tooling/measure-rebuild.mjs .`)

|           | plugin-kit production lines |
| --------- | --------------------------- |
| Before    | 778                         |
| After     | 722                         |
| Reduction | 56 lines (7.2%)             |

The package is mostly public contract: `schema-patch.ts` (the immutable
`SchemaPatchBuilder` whose methods only delegate to Core's patch factories and
accumulate exact operation tuples), `contextual-fields.ts` (two re-exported
Core factories), the option-parser overloads and interfaces, and the event
types with their phantom payload brands. Those were left unchanged; only the
two modules with private machinery were simplified.

## Design summary

| Module              | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin-events.ts`  | Trusted contracts were a `WeakMap` from each frozen contract to a second frozen `{ delivery, name }` copy; they are now a `WeakSet` of the frozen contracts themselves, whose `name` and `delivery` are read directly (same values: the contract is frozen and created only by `definePluginEvent`). This removes the `as PluginEventContract<...>` and `as TName` casts. The dispatcher's `emit` is contextually typed by `PluginEventDispatcher` instead of repeating its generic signature. Observer membership uses `WeakMap.has`. |
| `plugin-options.ts` | The six Standard Schema helpers (`readStandardSchemaValidator`, `isPromiseLike`, `readIssuePathKey`, `formatStandardSchemaIssue`, `parseStandardSchemaResult`, `defineStandardSchemaParser`) became `defineStandardSchemaParser` plus `formatStandardSchemaIssue` and two guards (`isObjectLike`, `isPropertyKey`). The two `invalid Standard Schema result` branches share one condition. The normalized parser receives the already-validated `name`. `formatUnknownKey` is called with `?.()`.                                      |
| unchanged           | `index.ts`, `contextual-fields.ts`, `schema-patch.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Behavior that was checked to stay the same: the definition-key check runs
before the name check; `~standard` is read with `Reflect.get` from objects and
functions; `validate` is still called with the `~standard` record as `this`; a
thenable result is rejected before the result shape; issue paths keep string,
number and symbol keys and `{ key }` segments and drop other segments; an
empty issue list still reports `validation failed` without details; the
normalizer receives a frozen copy of the input; the custom unknown-key
formatter is still called without a receiver and ignored when it does not
return a string.

A runtime comparison script imported the reference build (copied from the
coordinator checkout's `packages/plugin-kit/dist`) and the rebuilt build side
by side and compared results, error classes, messages, codes and freezing for
57 cases: every `definePluginOptionsParser` definition and parse error for both
parser kinds (including function schemas, `this` inside `validate`, thenables,
malformed results, mixed issue paths and a strict Zod schema), every
`definePluginEvent`, `observePluginEvent`, `providePluginEvent` error and
result, `definePluginEventCapability`, `patchSchemas`, and the dispatcher
(shape, invalid observer, denied `event:publish`, forged contract, optional and
required delivery without observers, missing transaction). No difference.
Committed delivery is covered by the consumer suites (roles and ACL events,
the alternative behavior engine e2e fixture).

## `as` casts

No cast was added. Removed: `as PluginEventContract<TName, TPayload,
TDelivery>` in `definePluginEvent` and `as TName` in `observePluginEvent`.
Kept unchanged: `handler as PluginEventHandler` (erases the payload type before
storing the handler next to untyped observers), `token as
PluginEventCapability` and `declaration as CapabilityProviderDeclaration<TToken>`
in `providePluginEvent` (Core's `ProvideCapabilityOptions<TToken>` cannot be
satisfied for a generic `TToken`; a cast-free attempt does not compile), and
`immutableArray(operations) as TOperations` in `SchemaPatchBuilder`.

## Removed checks

1. `defineNormalizedOptionsParser` no longer calls
   `assertNonEmptyString(options.name, 'plugin options parser name')`:
   `definePluginOptionsParser` asserts the same `options.name` with the same
   message immediately before calling it (after the definition-key check, as
   before), so the second assertion could never fail. Covered by
   `rejects malformed parser definitions and normalized roots` and the
   comparison cases (missing and empty names for both parser kinds).

## Behaviour differences

None. (Untyped inputs whose properties are getters are read fewer times, for
example `name` once instead of twice for the normalized parser.)

## Test mapping

- No file under `tests/`, no `*.test-d.ts`, no `src/**/*.test.ts` and no test
  outside the package was edited.
- `src/authoring.test.ts` and `src/authoring.test-d.ts` import the public
  entry; `src/plugin-events.test.ts` imports `./plugin-events.js`, whose path
  and exports are unchanged.
- No `packages/plugin-kit/src` path is listed in `apps/website/content`
  `sources`.

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
