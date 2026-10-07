# `@ultimabase/http-plugin` rebuild notes

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d` (branch base
`eb4c137`). The public contract is unchanged: every `src/index.ts` export, its
signature, generics, literal types and JSDoc; capability ids, versions,
cardinalities and the `transport:expose` / `authority:elevate` privileges; every
pre-dispatch status, error code, message and envelope; `Cache-Control` and
`X-UltimaBase-Request-Id` on every response; CORS headers, `Vary` merging and
preflight answers; the header cardinality, request-id and browser-bootstrap
rules; credential stripping; deadline/abort handling; and every option
validation message and its order. Core is consumed only through
`@ultimabase/core` public exports, as before.

The built `dist/index.d.ts` differs from the reference build only by the
position of the `httpBrowserPolicyCapability` declaration (its module merged
into `browser-policy.ts`); every declaration and JSDoc line is identical.

## Production lines (`node tooling/measure-rebuild.mjs .`)

|           | http-plugin production lines |
| --------- | ---------------------------- |
| Before    | 2338                         |
| After     | 2080                         |
| Reduction | 258 lines (11.0%)            |

Production files: 15 before, 14 after (the measured total counts non-blank
lines and includes the unchanged `test-database.test-support.ts`). Largest file:
`browser-policy.ts` (361 physical lines, under the 400 warning budget).

The remaining code is dominated by public interfaces with JSDoc, explicit
annotations required by `isolatedDeclarations`, and security checks whose order
and messages are part of the contract; compressing those further would change
DX or behaviour.

## Design summary

| New module                  | Replaces                                                                 | Simplification                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `definitions.ts` (new)      | four copies of exact-key validation, two provider wrappers, two WeakSets | `assertExactOptions(value, keys, label)` produces the shared `must be a plain object` / `contains unknown option: X` messages for endpoint, protocol, resolver, provider and browser-policy options. `HttpDefinitionRegistry` owns the "created by our factory" WeakSet, the `[i] must be created by …` validation and the `provideHttp*` option checks plus factory wrapper (single or array result). |
| `constants.ts`              | same                                                                     | The `httpMethods` set became the `isHttpMethod` type guard (removing four `as HttpMethod` casts); `isReservedHttpPath` replaces the three spelled-out reserved-namespace checks.                                                                                                                                                                                                                       |
| `endpoints.ts`              | same                                                                     | One `assertEndpointOptions(options, kind)` keeps the exact per-kind validation order (options, method, path, reserved, root bootstrap, handle; protocol last). Factories register through the registry.                                                                                                                                                                                                |
| `route-graph.ts`            | same                                                                     | Collision test is one `collides` predicate (mount overlap or same method/path) and a `find`; the handler-owner wrapper is inlined; the registration index is the array length.                                                                                                                                                                                                                         |
| `context.ts`                | same                                                                     | Resolver and provider validation delegate to `definitions.ts`; context derivation checks are unchanged.                                                                                                                                                                                                                                                                                                |
| `request-boundary.ts`       | same                                                                     | Error contracts are `[status, message]` tuples. `prepareHttpServerRequestOrReject` replaces three copies of "prepare, map failure to a sanitized response with a fresh request id". `rebuildHttpRequest` is shared by credential stripping and the bootstrap rewrite. `readPreparedApplicationId` is gone (see below).                                                                                 |
| `application.ts`            | `application.ts`, `application-request.ts`                               | One `dispatchPreparedRequest` with local `reject`, `timedOut` and `contextFailure` helpers replaces `createRequestSignals`, `respondToContextFailure` and three single-use Core-call wrappers. Bootstrap identity is resolved by `acceptApplicationRequest`, which returns `undefined` instead of throwing a failure that was immediately caught.                                                      |
| `browser-policy.ts`         | `browser-policy.ts`, `browser-policy-capability.ts`                      | The three list snapshots share `snapshotList` (same messages, per-item order, case-insensitive header duplicates); `parseRequestedHeaders` returns `undefined` instead of throwing a caught failure. The capability token and its runtime shape check moved here unchanged.                                                                                                                            |
| `plugin.ts`                 | same                                                                     | Contributions are built inline in the same order; the three non-exported requirement constants rely on inference instead of restating `CapabilityRequirement<…>`.                                                                                                                                                                                                                                      |
| `server-dispatch.ts`        | same                                                                     | Uses `prepareHttpServerRequestOrReject`.                                                                                                                                                                                                                                                                                                                                                               |
| `browser-bootstrap-path.ts` | same                                                                     | Uses `isReservedHttpPath`; kept as its own module because the website lists it as a page source.                                                                                                                                                                                                                                                                                                       |

Unchanged: `index.ts` (only the merged module specifier), `application-capability.ts`,
`test-database.test-support.ts`.

### `as` casts

Reference production code had six `as` casts (excluding `as const`); the rebuild
has two, both moved unchanged from the reference and none new:

- `context.ts`: `candidate as RequestContext` after `instanceof RequestContext`
  (the narrowed instance type has `any` type arguments; the cast pins the
  defaults so the comparison stays type-checked).
- `endpoints.ts`: `immutableRecord({ name, version }) as Readonly<TProtocol>`
  (the exact-key check proves the copy has the caller's literal shape).

Removed: the four `as HttpMethod` casts in `browser-policy.ts` (replaced by the
`isHttpMethod` guard). The unchanged test-support file keeps its reference cast.

## Removed or moved checks

No validation was dropped. One check moved:

- `readBrowserBootstrapSelection` rejected a path identity when an
  `X-UltimaBase-Application-Id` header was present. `acceptApplicationRequest`
  now returns before reading the path whenever that header is present (accepted
  only if non-empty and equal to the application id, otherwise rejected), so the
  same input is rejected one step earlier with the same `HTTP_APPLICATION_REJECTED`
  response. Covered by `src/application-bootstrap.test.ts`
  (`rejects explicit "foreign" / "notes/team, other" / "" identity without
falling back to bootstrap`). The `GET`-only check stays first in
  `readBrowserBootstrapSelection`.

All four "request execution is unavailable" checks (dispatch start, anonymous
context, resolution, endpoint invocation) are kept through
`requireRequestExecution`, with the same failure mapping
(`HTTP_INTERNAL_ERROR`, `HTTP_INTERNAL_ERROR`, `HTTP_APPLICATION_REJECTED`,
rethrown `TypeError`).

## Behaviour differences

None observable with ordinary inputs. Non-semantic changes:

- The fallback request id used for a malformed provider input is generated
  only when preparation fails (the reference generated one up front in
  `fetch` and `dispatchHttpApplicationRequest`). The value is a random UUID in
  both cases.
- `snapshotOriginalHeaders` reads each `[name, value]` slot once and retains the
  value it validated; the reference re-read `header[0]` up to three times. This
  only differs for arrays whose index slots are accessors returning different
  values, where the reference could retain an unvalidated non-string.
- `rebuildHttpRequest` reads `source.signal` before `cache` in the bootstrap
  rewrite and reads `body` once during credential stripping (the reference read
  it twice). Native and Hono Request getters are side-effect free.

## Test mapping

No file under `packages/http-plugin/tests/**`, no `*.test-d.ts`, no internal
`src/**/*.test.ts` and no test outside the package was modified. Every module
deep-imported by tests was kept with the same exports and signatures
(`application.js` incl. `createHttpApplicationResource`, `application-capability.js`,
`browser-policy.js`, `browser-bootstrap-path.js`, `constants.js`, `context.js`
incl. `compileHttpContextResolvers` / `resolveHttpContext`, `endpoints.js`,
`plugin.js`, `server-dispatch.js`, `test-database.test-support.js`).

Removed internal modules (`application-request.ts`,
`browser-policy-capability.ts`) were never imported by tests; their behavior is
covered by `src/application-bootstrap.test.ts`, `src/plugin.test.ts`,
`src/browser-policy.test.ts` and `tests/public-api.test.ts`.

## Pre-existing failures (untouched tree, same machine)

Baseline on the untouched tree after `yarn build` (same commands as below):

- Package: unit + types 14 files / 96 tests passed; e2e 1 / 1 passed;
  postgres-e2e has no http-plugin file (vitest prints "No test files found",
  exit 1, no summary).
- Consumers unit + types 86 / 446 passed; consumers e2e 1 failed of 18
  (`create-app-packed.e2e.test.ts`, 120 s timeout under parallel load);
  consumers postgres-e2e 14 / 55 passed.
- `--project e2e tests/e2e`: 1 failed of 219 (same `create-app-packed` timeout).
- `--project postgres-e2e tests/e2e`: 55 files / 191 tests passed.
- `website-content`: 17 files / 66 tests passed.

## Validation (final tree)

Consumers (from `git grep -l "@ultimabase/http-plugin" -- packages tests examples apps`):
`apollo-sandbox-plugin`, `create-app`, `graphiql-plugin`, `graphql-plugin`,
`graphql-yoga-plugin`, `password-auth-plugin`, `rest-plugin`,
`server-hono-plugin` (`CONS` below); `examples/minimal`, `tests/fixtures` and
`apps/website` are exercised by `tests/e2e` and `website-content`.

| Command                                                               | Result                                                                                                           |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `yarn build`                                                          | pass                                                                                                             |
| `yarn vitest run --project unit --project types packages/http-plugin` | 14 files, 96 tests passed                                                                                        |
| `yarn vitest run --project e2e packages/http-plugin`                  | 1 file, 1 test passed                                                                                            |
| `yarn vitest run --project postgres-e2e packages/http-plugin`         | no test files (same as baseline)                                                                                 |
| `yarn vitest run --project unit --project types $CONS`                | 86 files, 446 tests passed                                                                                       |
| `yarn vitest run --project e2e $CONS`                                 | 9 files, 18 tests passed                                                                                         |
| `yarn vitest run --project postgres-e2e $CONS`                        | 14 files, 55 tests passed                                                                                        |
| `yarn vitest run --project e2e tests/e2e`                             | 218 / 219 passed; `create-app-packed` timeout (also in baseline); file alone: 6 / 6 passed                       |
| `yarn vitest run --project postgres-e2e tests/e2e`                    | 188 / 191 passed; `virtual-field-public-vertical` (Core `SchemaCompilationError`, load); file alone twice: 3 / 3 |
| `yarn vitest run --project website-content`                           | 17 files, 66 tests passed                                                                                        |
| `yarn test:pack:built`                                                | 32 files, 173 tests passed                                                                                       |
| `yarn eslint packages/http-plugin`                                    | 0 problems                                                                                                       |
| `yarn prettier --check packages/http-plugin`                          | pass                                                                                                             |
| `yarn tsc --build packages/http-plugin`                               | pass                                                                                                             |
| `yarn tsc -p packages/http-plugin/tsconfig.test.json`                 | pass                                                                                                             |
| `yarn build` (after `tsc --build`)                                    | pass                                                                                                             |

The `virtual-field-public-vertical` failure (an HTTP + REST/GraphQL vertical) is
Core's `SchemaCompilationError: Schema ExampleArticle has not been compiled by
an application`, raised inside Core query normalization, not an HTTP status or
envelope mismatch. It passed in the baseline run and twice in isolation on the
final tree, so it is attributed to parallel load on the shared machine.

## Reference bugs

None found that change public behavior. Noted (documented, not fixed):

- `snapshotOriginalHeaders` re-read validated array slots (see above); the
  rebuild's single read closes that accessor-only gap without changing any
  ordinary result.

Historical plan `docs/plans/2026-09-21-core-kernel-simplification-checkpoint.md`
still names `src/browser-policy-capability.ts` as the owner of
`ultimabase.http.browser-policy`; it now lives in `src/browser-policy.ts`
(website page sources are unaffected).
