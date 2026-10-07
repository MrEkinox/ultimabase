# `@ultimabase/server-hono-plugin` rebuild notes

Rebuilt from reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`
(branch `rebuild/small-plugins-b`, base `cd7dca7`) following
`docs/rebuild/PROTOCOL.md`. The public contract is unchanged: `honoServerPlugin`
with its `TEnvironment` / `TSchema` / `TBasePath` generics and `= {}` default,
`HonoServerPlugin`, `HonoServerPluginOptions`, `ManagedHonoServerPluginOptions`,
`ExistingHonoServerPluginOptions`, `HonoBrowserPolicyOwner` and their JSDoc; the
plugin id, version, Core range and `environment:network` claim; the two
`^1.0.0` setup-phase requirements; every option validation message and its
order; and the provider lifecycle (lazy `*` dispatcher mount on first start,
serialized start/stop, exact-owner stop/dispose, framework vs external listener
ownership, request rejection before draining, failed-startup cleanup and
retained ownership when cleanup fails, `AggregateError` on double failure,
non-`Error` listener reasons wrapped, browser-policy ownership checks and the
wildcard-origin/Master incompatibility).

The built `dist/index.d.ts` is byte-for-byte identical to the reference build;
`dist/index.js` differs only in the two simplified `host` / `port` expressions
shown below.

## Production lines (`node tooling/measure-rebuild.mjs .`)

|           | server-hono-plugin production lines |
| --------- | ----------------------------------- |
| Before    | 431                                 |
| After     | 424                                 |
| Reduction | 7 lines (1.6%)                      |

The package was already lean. About half of it is public option types with
JSDoc; `provider.ts` is the listener state machine whose every branch is
exercised by `src/provider.test.ts`, `src/provider-cleanup.test.ts` and
`tests/browser-boundary.browser.test.ts`. Rewriting it would only reorder the
same states.

## Design summary

| Module       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin.ts`  | The two non-exported requirement constants rely on inference instead of restating `CapabilityRequirement<…, false, '^1.0.0', 'setup'>` (a scratch `expectTypeOf(...).toEqualTypeOf<...>()` file compiled with `tsconfig.test.json` proved both inferred types identical, then was deleted). The `options as HonoServerPluginOptions` cast is gone: the internal parser now takes `unknown`, which is what it validates at runtime. The plugin definition is returned directly.                                            |
| `options.ts` | `normalizeHonoServerPluginOptions` (internal, `@internal`, not exported from `index.ts`) is typed `(options: unknown) => NormalizedHonoServerPluginOptions`, like the explorer packages' parsers. The managed branch returns `host` and `port ?? 1337` directly: after `assertNonEmptyString` and the port range check TypeScript already narrows them to `string \| undefined` and `number \| undefined`, so `typeof host === 'string' ? host : undefined` and `typeof port === 'number' ? port : 1337` were identities. |
| unchanged    | `index.ts`, `original-headers.ts`, `provider.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

`src/options.ts` is listed as a page source in
`apps/website/content/docs/1.0.0/plugins/official/hono-server.mdx`; it keeps
its path.

## `as` casts

Before: one (`options as HonoServerPluginOptions` in `plugin.ts`, needed because
`HonoServerPluginOptions<TEnvironment, TSchema, TBasePath>` is not assignable to
the non-generic option type). After: none. No cast added.

## Removed checks

None. The two `typeof` conditionals in the managed result were not checks (no
input reached their false branch: `host` is `undefined` or a non-empty string
after `assertNonEmptyString`, `port` is `undefined` or an integer in range after
the port check).

## Behaviour differences

None.

## Test mapping

No test was edited. Deep imports kept with the same exports and signatures:
`src/options.test.ts` → `./options.js` (`normalizeHonoServerPluginOptions`;
its typed and `as never` arguments still type-check against `unknown`),
`src/provider.test.ts`, `src/provider-cleanup.test.ts` and
`tests/browser-boundary.browser.test.ts` → `provider.js` (`HonoServerProvider`,
unchanged), `src/plugin.test.ts` → `./plugin.js`.

## Reference bugs

None found.

## Validation (all six packages of this branch)

The branch rebuilds `server-hono-plugin`, `pg-vector-plugin`,
`apollo-sandbox-plugin`, `graphiql-plugin`, `graphql-http` and `shared`
(`$P` below); they were validated together on the same tree.

### Pre-existing failures (untouched tree, base `cd7dca7`)

`yarn build` passed. `--project unit --project types $P`: 31 files, 122 tests
passed, no type errors. `--project e2e $P`: 4 files, 10 tests passed.
`--project postgres-e2e $P`: no test files (none of the six packages has a
`*.postgres.e2e.test.ts`; Vitest prints "No test files found", exit 1). No
pre-existing failure.

### Final tree

`CONS` = every package matched by
`git grep -l -e "@ultimabase/<pkg>" -- packages` for the six names (because
`@ultimabase/shared` is used everywhere this is all 23 packages: access,
acl-permissions, apollo-sandbox, core, create-app, graphiql, graphql-http,
graphql, graphql-yoga, hooks, http, password-auth, pg-vector, plugin-kit,
postgres, rest, roles, server-hono, shared, soft-delete, testing, typegen,
validation). `examples/minimal`, `tests/e2e`, `tests/fixtures` and
`apps/website` matches are exercised by the two `tests/e2e` runs and
`website-content`.

| Command                                                         | Result                                           |
| --------------------------------------------------------------- | ------------------------------------------------ |
| `yarn build`                                                    | pass                                             |
| `yarn vitest run --project unit --project types $P`             | 31 files, 122 tests passed, no type errors       |
| `yarn vitest run --project e2e $P`                              | 4 files, 10 tests passed                         |
| `yarn vitest run --project postgres-e2e $P`                     | no test files (same as baseline)                 |
| `yarn vitest run --project unit --project types $CONS`          | 549 files, 2595 tests passed, no type errors     |
| `yarn vitest run --project e2e $CONS`                           | 37 files, 112 tests passed                       |
| `yarn vitest run --project postgres-e2e $CONS`                  | 44 files, 167 tests passed                       |
| `yarn vitest run --project e2e tests/e2e`                       | 47 files, 219 tests passed                       |
| `yarn vitest run --project postgres-e2e tests/e2e`              | 55 files, 191 tests passed                       |
| `yarn vitest run --project website-content`                     | 17 files, 66 tests passed                        |
| `yarn test:pack:built`                                          | 32 files, 173 tests passed                       |
| `yarn eslint $P`                                                | 0 problems                                       |
| `yarn prettier --check $P docs/rebuild/DIFFERENCES.md`          | pass                                             |
| `yarn tsc --build $P`                                           | pass                                             |
| `yarn tsc -p packages/<pkg>/tsconfig.test.json` (each of the 6) | pass                                             |
| `yarn build` (after `tsc --build`)                              | pass                                             |
| `node tooling/measure-rebuild.mjs .`                            | 431→424, 202→201, 197→192, 188→183, 76→72, 74→74 |

No flaky failure occurred in this run; no file had to be rerun alone.
