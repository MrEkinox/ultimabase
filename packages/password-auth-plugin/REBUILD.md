# password-auth-plugin rebuild

Rebuilt from reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`
(branch base `13e2e80`) following `docs/rebuild/PROTOCOL.md`. The public
entry (`src/index.ts`) keeps the same runtime and type exports, signatures,
generics, literal types and public JSDoc. Core and the other packages are
untouched and consumed only through their public exports.

## Production size

Measured with `node tooling/measure-rebuild.mjs .` (non-blank production lines):

|        | Lines        |
| ------ | ------------ |
| Before | 3567         |
| After  | 3359         |
| Change | -208 (-5.8%) |

About 40% of what remains is public contract: the operation, result and
policy types and their JSDoc, the `PasswordUserSchema.define` overloads,
`PasswordUserAuthMethods` (its JSDoc is asserted by the language-service
test), the explicit `isolatedDeclarations` annotations of the exported
constants, and the literal error, path and permission vocabulary. Every
production module is still pinned by a deep import from `tests/` or from a
website page `sources` list, so modules were simplified in place instead of
being merged away.

## Design summary

| Module                          | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operation-handlers.ts`         | The six `createXHandler(options)` wrappers became one closure over the destructured private state. Account-scoped handlers share `requireAuthenticated` (principal and session present) and `requireCurrentCredential` (credential whose generation matches the session). Credential normalization maps failures through one `normalizeCredentials(input, reject)`. `readModelPointer` became `readCreatedUserId`, which returns the id instead of a cast `Pointer<TUser>`; the unused `TUser` generic is gone. |
| `credentials.ts`                | The four copied compare-and-swap writers became one `swapPasswordCredential(collection, current, data)`. `upgradePasswordCredential` and `retainPasswordSessionGeneration` stay as one-line wrappers because tests import or spy on them. The field factory is inlined into the collection descriptor.                                                                                                                                                                                                          |
| `sessions.ts`                   | Revoke, generation advance and rotation share `findUnchangedSession` (live, same rotation, same generation). Revoke and advance share `swapUnchangedSession`. `createPasswordSessionId` was replaced by `randomUUID()`.                                                                                                                                                                                                                                                                                         |
| `session.ts`                    | The `WeakSet` of package sessions and the `WeakMap` of their generations became one `WeakMap` whose membership marks package ownership. `createPasswordAuthenticationResult` was folded into `readPasswordAuthenticationResult`.                                                                                                                                                                                                                                                                                |
| `authentication-result.ts`      | Holds `readPasswordAuthenticationResult` and the shared `readPasswordProfile`. The identical `NOT_FOUND` profile read in `user-auth-methods.ts` now uses the same helper. The principal placed in the read context is reused in the result.                                                                                                                                                                                                                                                                     |
| `password-hasher.ts`            | `verifyNormalizedPassword` was inlined into `verifyNormalizedPasswordOrDummy`. The dummy verification still runs in full and its outcome is masked.                                                                                                                                                                                                                                                                                                                                                             |
| `operations.ts`                 | The six operation declarations go through one typed `authOperation(name, transaction, input, result, errors)` helper (namespace, version and target fixed in one place); the exact `PluginOperationDefinition` types now annotate `passwordAuthOperations` directly. The four rejections come from one `rejection(code, message, publicMessage)` factory. REST decoders share `decodePasswordAuthInput(contract, path, reject?)`; REST paths are derived from the operation name.                               |
| `graphql-operation-bindings.ts` | GraphQL type metadata is built with `graphqlField(name, typeName)` and `graphqlType(kind, name, fields)`. Decoders use `decodePasswordAuthInput`.                                                                                                                                                                                                                                                                                                                                                               |
| `http-cookie-routes.ts`         | The bind-once executor object became a closure variable. The three route builders (`authenticationRoute`, `changePasswordRoute`, `logoutRoute`) and `readAuthenticationInput` became one `route(key)` with `readInput` (body rejections in one map) and `respond` (a `switch` on the operation name). The six HTTP binding contributions come from `Object.values(passwordAuthOperations)` (same order).                                                                                                        |
| `http-session-resolver.ts`      | The cookie parser returns `readonly string[] \| undefined` (absent) instead of a frozen `{ present, values }` record.                                                                                                                                                                                                                                                                                                                                                                                           |
| `user-auth-methods.ts`          | The three identical result casts went through one `asUserResult` helper; the principal check is one condition.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `plugin.ts`                     | `const user: unknown` plus the `isPasswordUserDefinition` guard replaces the `as TUser` cast. Binding contributions are mapped in one pass.                                                                                                                                                                                                                                                                                                                                                                     |
| `password-policy.ts`            | The four bounded parameters are read from one `policyBounds` table (same evaluation order, same messages).                                                                                                                                                                                                                                                                                                                                                                                                      |

Behavior that was checked to stay the same: Argon2id parameters, PHC format,
16-byte library salts, the fixed dummy verifier and its full verification on
unknown usernames, zeroing of the temporary password buffers, the
`policyVersion` upgrade and "parameter change requires a higher
policyVersion" rule, uniform public errors (code, message, public message,
no internal details), the order of checks in every handler (for example
password-change normalization still runs before the credential lookup, so a
stale session with an invalid new password still reports
`PASSWORD_AUTH_PASSWORD_CHANGE_REJECTED`), compare-and-swap expectations,
transactions, session token format and SHA-256 digests, cookie attributes,
browser-policy and Origin checks, and the exposure-before-bind order of the
cookie transport start.

A runtime comparison script bundled the reference sources and the rebuilt
sources side by side and compared, deeply and including `Object.isFrozen` and
key order: the error codes, all six operation tokens, their input/result
contracts on valid and invalid inputs, the REST and GraphQL bindings and
metadata, the four rejection errors, the plugin manifest and peers for 16
option sets (valid and invalid), the hash policy for 10 inputs, and the HTTP
options for 8 inputs. The only difference was the bundler renaming the
private `SignUpBytes` class in the comparison bundle. The emitted
`dist/index.d.ts` was compared with the reference build: the export list is
identical; the only differences are private aliases (the six private
`declare const xOperation` are now inlined into `passwordAuthOperations`,
`RequiredFieldState`/`OptionalFieldState` became `FieldState`).

## `as` casts

No new cast was added. Moved or kept reference casts:

- `session.ts` `createPasswordSession`: `immutableRecord(value) as PasswordSession` (brand, unchanged).
- `principal.ts`: `as PasswordPrincipal<TUser>` (brand, unchanged).
- `sign-up-input.ts`: `as PasswordSignUpInput` (unchanged).
- `user-schema.ts`: `as PasswordUserSchemaOptions<TCustomFields>` (unchanged).
- `plugin.ts`: `options as PasswordAuthPluginOptions` in the option parser and the four `as unknown as ...OperationAst<SchemaDefinition>` in `readCreateInputs` (unchanged).
- `http-cookie-routes.ts`: `as PluginOperationInput<TOperation>` in the HTTP binding decoder (unchanged).
- `authentication-result.ts` `readPasswordProfile`: `profile as unknown as SchemaResult<TUser>` (moved from `readCurrentProfile`).
- `user-auth-methods.ts`: `as PasswordAuthPluginExports`, the `current()` profile cast, and the result cast now made once in `asUserResult` instead of three times.

Removed: `as TUser` in `plugin.ts` and `as Pointer<TUser>` in the sign-up handler.

## Removed checks

None. Every validation, guard and error of the reference is still executed
on the same input, in the same order.

## Test mapping

- No file under `tests/`, no `*.test-d.ts` and no test outside the package
  was edited. The modules and exports that `tests/` deep-imports
  (`credentials`, `operation-handlers`, `operations`, `password-policy`,
  `password-hasher`, `normalization`, `principal`, `session`,
  `session-policy`, `sessions`, `user-schema`) keep their paths and export
  names. `tests/operation-handlers.test.ts` spies on
  `credentials.findPasswordCredentialByUserId`,
  `credentials.retainPasswordSessionGeneration` and
  `sessions.rotatePasswordSession`; the refresh handler still calls exactly
  those imports.
- No `src/**/*.test.ts` file was edited.

## Pre-existing failures (untouched tree)

Baseline on the untouched tree (branch base `13e2e80`): `yarn build` passed;
`--project unit --project types packages/password-auth-plugin` 16 files /
69 tests passed; `--project e2e` 2 files / 2 tests passed;
`--project postgres-e2e` 6 files / 30 tests passed. No pre-existing failure
in the focused suites.

On the pre-rebase branch, `yarn vitest run --project website-content` had 2
failures caused by stale `sources` of other packages
(`packages/core/src/runtime/validation/runtime-validation-options.ts`,
`packages/rest-plugin/src/operation-execution.ts`); main fixed them in
`eb4c137`, and the branch was rebased on main (`fcc7d82`) before the final
validation. Every `packages/password-auth-plugin/src` path listed in
`apps/website/content` exists on this branch (that is why
`application-api.ts` and `authentication-result.ts` were kept).

## Reference bugs found

None found.

## Validation (final tree, rebased on `fcc7d82`)

| Command                                                                        | Result                                                                                                                                                                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn build`                                                                   | pass (before and after `tsc --build`)                                                                                                                                                             |
| `yarn vitest run --project unit --project types packages/password-auth-plugin` | 16 files, 69 tests passed, no type errors                                                                                                                                                         |
| `yarn vitest run --project e2e packages/password-auth-plugin`                  | 2 files, 2 tests passed                                                                                                                                                                           |
| `yarn vitest run --project postgres-e2e packages/password-auth-plugin`         | 6 files, 30 tests passed                                                                                                                                                                          |
| consumers (1), `--project unit --project types`                                | 56 files, 228 tests passed, no type errors                                                                                                                                                        |
| consumers (1), `--project e2e`                                                 | 10 of 11 passed; `create-app-packed` "writes a valid graph for each official plugin selected alone" timed out at 120 s (load average about 100). Rerun alone: 1 file, 6 tests passed (58.7 s).    |
| consumers (1), `--project postgres-e2e`                                        | 5 files, 15 tests passed                                                                                                                                                                          |
| `yarn vitest run --project e2e tests/e2e`                                      | 218 of 219 passed (47 files); the same `create-app-packed` timeout, which passed alone (see above)                                                                                                |
| `yarn vitest run --project postgres-e2e tests/e2e`                             | 55 files, 191 tests passed                                                                                                                                                                        |
| `yarn vitest run --project website-content`                                    | 17 files, 66 tests passed                                                                                                                                                                         |
| `examples/minimal`: `yarn typecheck && yarn check-generated-types`             | pass                                                                                                                                                                                              |
| `yarn test:pack:built`                                                         | 32 files, 173 tests passed (includes `password-auth-plugin.e2e.test.ts`)                                                                                                                          |
| `yarn eslint packages/password-auth-plugin`                                    | 0 errors, 2 `max-lines` warnings: `src/operations.ts` (487 physical lines, under the 600 budget; the reference was 488) and the unchanged `tests/e2e/password-http-sessions.postgres.e2e.test.ts` |
| `yarn prettier --check packages/password-auth-plugin`                          | pass                                                                                                                                                                                              |
| `yarn tsc --build packages/password-auth-plugin`                               | pass                                                                                                                                                                                              |
| `yarn tsc -p packages/password-auth-plugin/tsconfig.test.json`                 | pass                                                                                                                                                                                              |

(1) Consumers from `git grep -l "@ultimabase/password-auth-plugin" -- packages tests examples apps`:
`packages/create-app`, `packages/graphql-plugin` (README mention only),
`packages/typegen`, `examples/minimal` (no vitest project; type-checked and
generated-type checked instead), the three `tests/e2e` files (covered by the
two `tests/e2e` runs) and `apps/website` (covered by `website-content`).
