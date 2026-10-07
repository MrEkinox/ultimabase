# acl-permissions-plugin rebuild

Rebuilt from reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`
following `docs/rebuild/PROTOCOL.md`. The public entry (`src/index.ts`) keeps
the same runtime and type exports, signatures and public JSDoc. Core and other
packages are untouched and consumed only through their public exports.

## Production size

Measured with `node tooling/measure-rebuild.mjs .` (non-blank production lines):

|        | Lines         |
| ------ | ------------- |
| Before | 3188          |
| After  | 2687          |
| Change | -501 (-15.7%) |

About half of the remaining lines are public types and their JSDoc
(`acl-option.ts`, `acl-events.ts`, `acl-json.ts`), the `ACL` class surface,
and the schema declaration/manifest wiring. All of that is part of the
contract, so the planned 25% cut was not possible without losing anything.

## Design summary

- **ACL value (`acl.ts`, `acl-json.ts`)**: an `ACL` now stores its canonical
  frozen `ACLJSON` document in a private `WeakMap`. Before, it kept a second
  parallel state model (keyed subject entries plus role reference objects)
  next to the JSON model. Each modifier is one `edit(stateOf(this), slot,
change, permissions)` call: a _subject slot_ reads and writes the rights of
  one audience, principal or role, and the change is `grant`, `revoke` or
  `replace`. Queries use the same slots. `createACLJSON` canonicalizes every
  new state and every `toJSON()` snapshot, which keeps snapshots deeply
  detached. Principal and role merging in `acl-json.ts` now goes through one
  generic `mergeEntries` helper instead of two copied normalizers.
- **Application state (`application-state.ts`)**: merges the previous
  `application-state.ts`, `subject-resolver-attribution.ts` and
  `runtime-operation.ts`. The old version passed `hasStaticRoleGrant`,
  `snapshotACL`, `readProtectedSchemas` and the capability requirements in as
  options. They are now imported directly. Resolver attribution (callbacks
  run under the provider's owner, and requests are resolved against the
  original request) is built inline. The state gives every provider one
  `protectedOption(operation)` lookup that returns `{ config, limits, schema }`.
  This replaces the repeated "set membership, then re-read the option, then
  throw if the option was lost" sequence; that throw could never happen.
- **Schema option trust (`acl-option.ts`)**: normalized options are recorded
  in a `WeakMap` from each option to itself instead of a `WeakSet`, so the
  trusted lookup returns a typed value without the `as unknown as` cast.
  `readProtectedSchemaOptions` returns an ordered map from schema to option.
  The three identical JSON codecs share one definition.
- **Plugin wiring (`plugin.ts`)**: the four state-reading constraint providers
  go through one local `stateConstraint(contributionId, build)` helper. The
  two reference-cleanup providers come from one `referenceCleanupProvider(kind)`
  factory. Contribution ids, names, order, permissions and privileges are
  unchanged. `ACLPluginOptions` moved from `plugin-contracts.ts` into
  `acl-limits.ts`, and the public export is unchanged.
- **Operation resolution (`acl-operation-resolution.ts`)**: one internal
  `acceptACL` now covers the role-resolution checks, the persistent-role
  rewrite and the limit check that were spread over four helpers. Create
  resolution takes one resolution object instead of threading eight
  positional arguments through every branch. The exported
  `resolveCreateOperationACL` and `resolvePreparedOperationACL` keep their
  exact positional signatures, which the package tests use.
- **Smaller cleanups**: the change-event diff (`acl-events.ts`) is one generic
  addition pass. Limits validation loops over both keys and both checks.
  Containment snapshots use `immutableArray` tuples instead of cast
  `Object.freeze` arrays. Reference cleanup has one schema-class guard and two
  loops instead of five helpers that each repeated the guard.

Behavior that was checked to stay the same: authorization semantics,
fail-closed identity resolution, Master bypass, which providers bypass and
which do not, error classes, codes and messages, the order of validation
errors (including `ACL method requires an ACL instance` before principal and
permission validation), post-commit events, subject cleanup
`fail`/`preserve`/`cascade`, PostgreSQL containment filters and
`getCurrentRequest()` timing for persistent-role resolution.

One behavioral detail was deliberately kept. When `resolveInput` returns a
value during an update, only `undefined` keeps the current ACL. Any other
non-ACL value, including `null`, still fails with
`acl resolveInput must resolve to an ACL`.

## Test mapping

- No file under `tests/`, no `*.test-d.ts` and no test outside the package
  was edited. Deep imports from `tests/unit` (`src/acl.js`, `src/plugin.js`,
  `src/acl-option.test-support.js`) still resolve to the same exports.
- `src/acl-limits.test.ts`: in `rejects malformed finite limit declarations`,
  the input `{ extra: 1 } as never` became `{ extra: 1 }`.
  `normalizeACLEntryLimits` now accepts `unknown` because it validates
  untrusted input, so ESLint flagged the cast as unnecessary. The input value
  and the expected error `Unknown acl limits option: extra` are unchanged.
- All other `src/*.test.ts` files are unchanged and import the same internal
  exports, which still exist in the same modules (`acl-access`, `acl-events`,
  `acl-limits`, `acl-option`, `acl-reference-cleanup`, `acl-containment`,
  `acl-contracts`).
- Internal mechanisms that were removed, and what covers their guarantee now:
  - `createACLRowFilter` was a wrapper over `requiredACLPermission` and
    `createACLPermissionRowFilter`. Both remain and are tested in
    `src/acl-access.test.ts`. The wiring is covered by the PostgreSQL access
    e2e tests.
  - `readACLSchemaOption` and the "lost its discovered schema option" guard
    became `readProtectedSchemaOptions`, which still rejects untrusted option
    objects. Option discovery is covered by `tests/unit/plugin*.test.ts` and
    the e2e tests.
  - `subject-resolver-attribution.ts` was merged into `application-state.ts`.
    Owner attribution is covered by the access, composition and role-schema
    PostgreSQL e2e tests and by `tests/e2e/access-provider-composition`.

## Pre-existing failures (untouched tree)

- `postgres-e2e` consumers:
  `packages/create-app/tests/e2e/create-app-api.postgres.e2e.test.ts`
  ("serves a read-only REST Task route ...") failed with `listen EADDRINUSE`
  on `127.0.0.1:1337`. The port was taken on the host, so this is an
  environment problem.
- `yarn vitest run --project e2e tests/e2e` (the filter also matches package
  e2e folders) had 3 timeouts under load:
  `core-archive-declarations`, `core-field-builder`, `create-app-packed`.
  None of them involves ACL.

No reference bug was found.

## Validation (final tree)

| Command                                                                  | Result                                                                                                                                                                                                            |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn build`                                                             | pass                                                                                                                                                                                                              |
| `yarn vitest run --project unit packages/acl-permissions-plugin`         | 13 files, 73 tests passed                                                                                                                                                                                         |
| `yarn vitest run --project types packages/acl-permissions-plugin`        | 3 files, 7 tests passed                                                                                                                                                                                           |
| `yarn vitest run --project e2e packages/acl-permissions-plugin`          | 1 file, 1 test passed                                                                                                                                                                                             |
| `yarn vitest run --project postgres-e2e packages/acl-permissions-plugin` | 8 files, 21 tests passed                                                                                                                                                                                          |
| consumers, `--project unit`                                              | 33 files, 101 tests passed                                                                                                                                                                                        |
| consumers, `--project types`                                             | 1 file, 2 tests passed                                                                                                                                                                                            |
| consumers, `--project e2e`                                               | 2 files, 10 tests passed                                                                                                                                                                                          |
| consumers, `--project postgres-e2e`                                      | 5 files, 18 tests passed                                                                                                                                                                                          |
| `yarn vitest run --project e2e tests/e2e`                                | 47 files, 219 tests passed                                                                                                                                                                                        |
| `yarn vitest run --project postgres-e2e tests/e2e`                       | 55 files, 191 tests passed                                                                                                                                                                                        |
| `yarn eslint packages/acl-permissions-plugin`                            | 0 errors, 2 `max-lines` warnings (`src/plugin.ts` 416 lines, which is under the 600-line production budget, and the unchanged `tests/e2e/acl-reference-cleanup-postgres` file; the reference had 4 such warnings) |
| `yarn prettier --check packages/acl-permissions-plugin`                  | pass                                                                                                                                                                                                              |
| `yarn tsc --build packages/acl-permissions-plugin`                       | pass                                                                                                                                                                                                              |
| `yarn tsc -p packages/acl-permissions-plugin/tsconfig.test.json`         | pass                                                                                                                                                                                                              |

The consumer paths are `packages/create-app`,
`packages/graphql-plugin/tests/e2e/graphql-schema-execution.postgres.e2e.test.ts`,
`packages/rest-plugin/tests/e2e/rest-mutation-execution.postgres.e2e.test.ts`,
`packages/rest-plugin/tests/e2e/rest-read-execution.postgres.e2e.test.ts`,
`packages/typegen` and `examples`. Each was run in one vitest invocation per
project. The pre-existing failures listed above did not recur in the final
run.
