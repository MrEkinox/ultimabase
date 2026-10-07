# `@ultimabase/graphql-yoga-plugin` rebuild notes

Rebuilt from reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`
following `docs/rebuild/PROTOCOL.md`, on branch `rebuild/small-plugins-a`
(base `953e832`). The public entry (`src/index.ts`) is unchanged and the built
`dist/index.d.ts` is byte-identical to the build of the base commit. Core,
`graphql-plugin`, `graphql-http`, `http-plugin`, `plugin-kit` and `shared` are
consumed only through their public exports, as before.

The package was already close to minimal: a thin, security-focused adapter
whose size is dominated by explicit HTTP negotiation, bounded body reading and
error sanitization. The rebuild removes duplication and single-use wrappers;
it does not restructure the request path.

## Production lines (`node tooling/measure-rebuild.mjs .`)

|           | graphql-yoga-plugin |
| --------- | ------------------- |
| Before    | 731                 |
| After     | 726                 |
| Reduction | 5 lines (0.7%)      |

| File                               | Before | After |
| ---------------------------------- | -----: | ----: |
| `body.ts`                          |    125 |   119 |
| `errors.ts`                        |    101 |   113 |
| `handler.ts`                       |    204 |   195 |
| `index.ts`                         |      3 |     3 |
| `media.ts`                         |     56 |    56 |
| `options.ts`                       |     78 |    80 |
| `plugin.ts`                        |     80 |    76 |
| `test-application.test-support.ts` |     84 |    84 |

(Non-blank lines; the measured total includes the unchanged test-support file.)

## Design summary

| Module       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `errors.ts`  | `createGraphqlHttpFailure` also accepts GraphQL's `nodes` / `originalError`, so the safe failure extensions (`code`, `http.status`, `requestId`, `retryable: false`, in that order) are defined once. Before, the parse and validation plugins in `handler.ts` each spelled the same `GraphQLError` construction. Kept as its own module (it is a `sources` entry of the website GraphQL page).                                                                   |
| `handler.ts` | The five single-use plugin factories (`requestParserPlugin`, `safeParseErrorPlugin`, `validationPlugin`, `applicationExecutionPlugin`, `safeResultPlugin`) and `executeThroughApplication` became one typed `plugins` list, in the same order. Parse and validation failures use `createGraphqlHttpFailure`. The 404/405/406/415 checks keep their order, codes, messages and media types; the separate `failureMediaType` / `mediaType` locals are one variable. |
| `body.ts`    | The two identical `PAYLOAD_TOO_LARGE` failures share `tooLarge()`. The declared `Content-Length` is read as `Number(header ?? NaN)` (same result for every header value: an absent header, a non-number or `Infinity` never rejects early). `!== undefined && !== null` pairs are `!= null`. The streamed byte count, cancellation, abort checks and UTF-8/JSON/shape checks are unchanged.                                                                       |
| `options.ts` | `normalizeGraphqlYogaPluginOptions` no longer maps `undefined` to `{}` (see removed checks).                                                                                                                                                                                                                                                                                                                                                                      |
| `plugin.ts`  | The Core requirement relies on `requireCapability` inference (it infers exactly `CapabilityRequirement<typeof graphqlApplicationCapability, false, '^1.0.0', 'materialization'>`, the annotation that was removed). The single-use permissions constant is inlined.                                                                                                                                                                                               |
| unchanged    | `index.ts`, `media.ts`, `test-application.test-support.ts`                                                                                                                                                                                                                                                                                                                                                                                                        |

### `as` casts

None before, none after.

## Removed checks and proofs

- `normalizeGraphqlYogaPluginOptions(value === undefined ? {} : value)`: the
  only caller is `graphqlYogaPlugin(options: GraphqlYogaPluginOptions = {})`,
  whose default parameter already replaces `undefined` (including an explicit
  `graphqlYogaPlugin(undefined)` from untyped JavaScript) with `{}`. Every
  other value still reaches the same strict parser (`null`, non-objects and
  unknown keys are rejected with the same messages; `src/options.test.ts`).

No validation, negotiation, sanitization, abort or bound check was removed.

## Behaviour differences

None. The error objects handed to Yoga are constructed with the same message,
extensions (same key order), nodes and original error.

## Test mapping

No test was edited: nothing under `tests/`, no `*.test-d.ts`, no internal
`src/**/*.test.ts`, no test outside the package. Deep imports used by tests
(`./plugin.js`, `./test-application.test-support.js`) keep the same exports.
The browser test (`src/browser-fetch.browser.test.ts`) runs in the `unit`
project.

## Pre-existing failures (untouched tree)

None in the package suites (unit + types 8 files / 37 tests; e2e 1 / 1;
postgres-e2e has no file for this package, so Vitest prints "No test files
found" and exits 1, as in the reference).

## Reference bugs

None found.

## Validation (shared run for the three packages of this branch)

`$P` = `packages/graphql-yoga-plugin packages/soft-delete-plugin packages/validation-plugin`.
Consumers from `git grep -l -e "@ultimabase/graphql-yoga-plugin" -e "@ultimabase/soft-delete-plugin" -e "@ultimabase/validation-plugin" -- packages tests examples apps`:
`examples` (minimal, todo-backend), `packages/create-app`, `packages/graphql-plugin`,
`packages/hooks-plugin`, `packages/rest-plugin`, `packages/typegen` (`$CONS`);
`packages/core` (an e2e fixture only), `tests/e2e` and the per-package e2e
files are covered by the two `tests/e2e` runs; `apps/website` by
`website-content`.

| Command                                                | Baseline (untouched tree)                                                                    | Final tree                                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `yarn build`                                           | pass                                                                                         | pass                                                                                                       |
| `yarn vitest run --project unit --project types $P`    | 22 files, 101 tests, no type errors                                                          | 22 files, 101 tests, no type errors                                                                        |
| `yarn vitest run --project e2e $P`                     | 3 files, 5 tests                                                                             | 3 files, 5 tests                                                                                           |
| `yarn vitest run --project postgres-e2e $P`            | 4 files, 17 tests                                                                            | 4 files, 17 tests                                                                                          |
| `yarn vitest run --project unit --project types $CONS` | 95 files, 422 tests, no type errors                                                          | 95 files, 422 tests, no type errors                                                                        |
| `yarn vitest run --project e2e tests/e2e`              | 46 / 47 files, 218 / 219 tests: `core-archive-declarations` 10 s timeout (known flake, Core) | 47 files, 219 tests passed                                                                                 |
| `yarn vitest run --project postgres-e2e tests/e2e`     | 55 files, 191 tests                                                                          | 55 files, 191 tests                                                                                        |
| `yarn vitest run --project website-content`            | 17 files, 66 tests                                                                           | 17 files, 66 tests                                                                                         |
| `yarn test:pack:built`                                 | 31 / 32 files, 170 / 173 tests: `core-archive-declarations` timeouts (known flake, Core)     | 32 files, 173 tests passed                                                                                 |
| `yarn eslint packages/<pkg>` (each)                    | -                                                                                            | 0 errors; 1 pre-existing `max-lines` warning (`validation-plugin/src/field-validation.test.ts`, 692 lines) |
| `yarn prettier --check packages/<pkg>` (each)          | -                                                                                            | pass                                                                                                       |
| `yarn tsc --build packages/<pkg>` (each)               | -                                                                                            | pass                                                                                                       |
| `yarn tsc -p packages/<pkg>/tsconfig.test.json` (each) | -                                                                                            | pass                                                                                                       |
| `yarn build` (after `tsc --build`)                     | -                                                                                            | pass                                                                                                       |
| `node tooling/measure-rebuild.mjs .`                   | yoga 731, soft-delete 710, validation 663                                                    | yoga 726, soft-delete 689, validation 622                                                                  |

Per package (baseline = final): graphql-yoga unit + types 8 files / 37 tests,
e2e 1 / 1, postgres-e2e none ("No test files found"); soft-delete unit + types
6 / 21, e2e 1 / 3, postgres-e2e 3 / 16; validation unit + types 8 / 43, e2e
1 / 1, postgres-e2e 1 / 1.

The baseline `tests/e2e` and pack runs were executed while the graphql-yoga
sources were being edited; their only failures are the known
`core-archive-declarations` timeouts in Core, which passed in the final runs.
The package and consumer baselines were rerun on a stashed, freshly built
untouched tree.
