# `@ultimabase/rest-plugin` rebuild notes

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`. The public
contract (`src/index.ts` exports, signatures, literal types, JSDoc, error
classes/codes/messages, HTTP envelopes and statuses, route metadata, plugin
contribution ids and permissions) is unchanged.

## Production lines (`node tooling/measure-rebuild.mjs .`)

|           | rest-plugin production lines |
| --------- | ---------------------------- |
| Before    | 4320                         |
| After     | 3696                         |
| Reduction | 624 lines (14.4%)            |

The 25% target was not reached. The remaining code is dominated by public
interfaces with JSDoc, explicit literal annotations required for hover DX and
`isolatedDeclarations`, and security validations that must keep their exact
ordering and messages; compressing those further would change DX or behavior.

## Design summary

Module map (26 production files to 20):

- `errors.ts` now owns all three normalization error families. One internal
  abstract `RestNormalizationError<TCode>` carries the shared `code`/`issue`
  shape and derives the safe message from the code suffix. Each boundary has a
  single `RestFailure` factory (`invalidRestRead`, `invalidRestMutation`,
  `invalidRestOperation`) taking an optional reason. This replaces
  `mutation-errors.ts`, `operation-errors.ts`, three message tables and the three
  hand-written `RestJsonBodyErrors` objects.
- `read-body.ts` takes that one failure factory instead of an errors object,
  uses `Buffer.concat` (Node-only package) instead of a hand-written
  concatenation, and now also hosts the empty-body (DELETE) check formerly in
  `mutations.ts`.
- `field-values.ts` absorbs `read-values.ts` (filter operand decoding). The unused
  `partial` parameter that was threaded through every decoder is gone. Shared
  helpers `mapRestRecord` (assignment-based frozen record copy, identical to the
  former loops) and `mapRestListDepth` (nested list walker) are used by both the
  decoders and `response-values.ts`.
- `response-values.ts`: scalar pass-through kinds are table-driven; output object
  and list encoding reuse the shared walkers; `isRestOutputKind` is the single
  source of truth also used by route compilation (replacing a duplicated
  `builtInOutputKinds` set in `schema-routes.ts`).
- `reads.ts` / `mutations.ts` absorb `read-execution.ts` / `mutation-execution.ts`.
  Limit validation is shared (`normalizeRestLimits(limits, boundary)`, same
  messages). Mutations use one contract table (Core kind, HTTP method, accepted
  projection query keys) and a `decodeKeys` helper for upsert/bulk instead of
  repeated conditional spreads.
- `nested-mutation-values.ts`: one allowlist table for pointer/relation commands
  and one relationship decoder instead of two parallel ones.
- `routes.ts`: route "candidates" are now the final route definitions minus
  `provenance.application`, so the three candidate interfaces and three
  candidate-to-definition copy functions disappeared. Composition only attaches
  the shared application identity. `createRestRoutePlugin` and `restClassPath`
  remove duplicated owner/path construction in the three compilers.
- `schema-routes.ts`: one `isRestRouteEnabled` resolver (schema option, then
  plugin default, then built-in default) also covers `mutations`, replacing
  `areRestSchemaMutationsEnabled`.
- `transports.ts` replaces `operation-execution.ts` and
  `schema-mutation-execution.ts`. The class + module `WeakMap` + exported
  `bind*` functions with `instanceof` facade checks became closures returning
  `[transport, bind]`; the binder is never exported, so only the plugin can bind
  Core's allowlist. Route ownership checks, exposure validation, error messages
  and late-binding idempotence are unchanged.
- `http-handler.ts` absorbs `http-routing.ts`. The module-level
  `WeakMap<executor, Map<ownerKey, state>>` became a per-`restPlugin()` closure
  `WeakMap<executor, slot>`; the mount reads its slot per request exactly as
  before (unconfigured slot: no routes, therefore `REST_NOT_FOUND`).
- `responses.ts`: one `caughtFailure` mapping with typed guards and a flat
  contract table; `options.ts` now also hosts the plugin factory option parser,
  so `plugin.ts` is reduced to wiring. Route providers are table-driven while
  keeping the same three contribution ids and order.

## Test mapping

No file under `packages/rest-plugin/tests/**`, no `*.test-d.ts`, and no test
outside the package was modified. Two internal `src` tests changed only their
import specifiers because the deep-imported modules were merged; no input,
assertion or expectation changed:

| Test                         | Change                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/read-execution.test.ts` | `executeRestReadRequest` imported from `./reads.js` instead of the removed `./read-execution.js`.                                                             |
| `src/responses.test.ts`      | Error classes/codes imported from `./errors.js` instead of the removed `./mutation-errors.js` and `./operation-errors.js` (merged into one import statement). |

Removed internal mechanisms and the tests that still prove their guarantee:

- `bindRestOperationTransport` / `bindRestSchemaMutationTransport` rejected
  foreign facades via `instanceof`. The binder is now private to the closure,
  so a foreign facade cannot be bound at all. Route ownership, lifecycle and
  exact exposure remain covered by `src/operation-execution.test.ts` and
  `tests/schema-mutation-http.test.ts`; the names stay asserted as non-public by
  `tests/public-api-language-service.test.ts`.
- Owner-keyed HTTP state: isolation between instances and applications remains
  covered by `src/routes.test.ts` (two instances, isolated application
  provenance) and `src/http-responses.test.ts`.

## Pre-existing failures (untouched tree, same machine)

Baseline runs after `yarn build` on the reference tree:

- Package suites: unit 16 files / 107 tests, types 2 / 2, e2e 1 / 3,
  postgres-e2e 3 / 10, all passing.
- Consumers (`password-auth-plugin`, `create-app`): unit 20 / 102 and e2e 3 / 8
  passing; postgres-e2e 1 failed of 40 (`create-app-api.postgres.e2e.test.ts`,
  `listen EADDRINUSE 127.0.0.1:1337`, an environment port collision).
- `yarn vitest run --project e2e tests/e2e`: 4 failed of 219, all timeouts in
  packed-archive suites (`core-archive-declarations`, `core-field-builder`,
  `create-app-packed`, `typegen-generated-types`) under parallel load.
- `yarn vitest run --project postgres-e2e tests/e2e`: 55 files / 191 tests passing.

None of these failures reproduced on the final tree. Note: running
`yarn tsc --build packages/rest-plugin` emits `tsc` declarations into the
referenced packages' `dist` (for example `packages/core/dist/index.d.ts`), which
breaks `core-archive-declarations.e2e.test.ts` until `yarn build` is run again.
The final suites were therefore run after a fresh `yarn build`.

## Validation (final tree)

| Command                                                                                    | Result                     |
| ------------------------------------------------------------------------------------------ | -------------------------- |
| `yarn build`                                                                               | pass                       |
| `yarn vitest run --project unit packages/rest-plugin`                                      | 16 files, 107 tests passed |
| `yarn vitest run --project types packages/rest-plugin`                                     | 2 files, 2 tests passed    |
| `yarn vitest run --project e2e packages/rest-plugin`                                       | 1 file, 3 tests passed     |
| `yarn vitest run --project postgres-e2e packages/rest-plugin`                              | 3 files, 10 tests passed   |
| `yarn vitest run --project unit packages/password-auth-plugin packages/create-app`         | 20 files, 102 tests passed |
| `yarn vitest run --project e2e packages/password-auth-plugin packages/create-app`          | 3 files, 8 tests passed    |
| `yarn vitest run --project postgres-e2e packages/password-auth-plugin packages/create-app` | 8 files, 40 tests passed   |
| `yarn vitest run --project e2e tests/e2e`                                                  | 47 files, 219 tests passed |
| `yarn vitest run --project postgres-e2e tests/e2e`                                         | 55 files, 191 tests passed |
| `yarn eslint packages/rest-plugin`                                                         | 0 errors, 0 warnings       |
| `yarn prettier --check packages/rest-plugin`                                               | pass                       |
| `yarn tsc --build packages/rest-plugin`                                                    | pass                       |
| `yarn tsc -p packages/rest-plugin/tsconfig.test.json`                                      | pass                       |

Other consumers found by `git grep` (`examples/minimal`, `tests/README.md`)
have no suite of their own; the example is exercised by `tests/e2e`.

## Reference bugs

None found.
