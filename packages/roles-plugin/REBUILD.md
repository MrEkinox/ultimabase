# roles-plugin rebuild

Rebuilt from reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`
following `docs/rebuild/PROTOCOL.md`, on branch `rebuild/roles-plugin`
(base `8c8bf6e`). The public entry (`src/index.ts`) is byte-identical: same
runtime and type exports, signatures, generics and public JSDoc. Core and the
other packages are untouched and consumed only through their public exports.

## Production size

Measured with `node tooling/measure-rebuild.mjs .` (non-blank production lines):

|        | Lines        |
| ------ | ------------ |
| Before | 2192         |
| After  | 2043         |
| Change | -149 (-6.8%) |

| File                      | Before | After |
| ------------------------- | -----: | ----: |
| `index.ts`                |     51 |    51 |
| `plugin.ts`               |    415 |   296 |
| `role-access.ts`          |    220 |   214 |
| `role-deletion.ts`        |    189 |   151 |
| `role-events.ts`          |    130 |   130 |
| `role-hierarchy.ts`       |    180 |   153 |
| `role-member.ts`          |     61 |    79 |
| `role-membership.ts`      |     99 |    83 |
| `role-reference.ts`       |    151 |   220 |
| `role-resolution.ts`      |    139 |   125 |
| `role-schema-identity.ts` |     53 |    54 |
| `role-schema.ts`          |    504 |   487 |

About 1100 of the remaining lines are public contract: the authoring types and
their JSDoc in `role-schema.ts` (the `RoleSchema.define()` overloads, options,
field and class types), the event contracts and `onRoleEvent` overloads, the
command interfaces, the reference types, the error classes and `index.ts`.

All twelve modules stay. Four are listed in the `sources` of
`apps/website/content/docs/1.0.0/plugins/official/roles.mdx` (`role-access`,
`role-deletion`, `role-reference`, `role-schema`). `role-access.ts` is also
read as text by `tests/role-schema-intellisense.test.ts`. The others are
deep-imported by internal tests or re-exported by `index.ts`.

## Design summary

| Module                    | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin.ts`               | Holds only wiring and the Runtime behavior. Discovered role schemas become one `Map` from the operation's schema node to `{ schema, declaration }`. Each stage looks the declaration up once, and the operation schema needs no `SchemaDefinition` cast. `createRoleRuntimeBehavior` and `emitRoleRelationChanges` are inlined into the provider. Role-kind cleanups are filtered from Core's typed `NamedRequestSubjectReferenceCleanup` list, with no cast and no local copy of the type. |
| `role-reference.ts`       | Also owns `normalizeRoleOperation`, moved from `plugin.ts` next to `normalizeRoleName`. Its switch builds each copy through one `replace(changes)` helper instead of an IIFE. Serialized-selector parsing is one `readSerializedSelector` helper instead of two duplicated key-count branches. Creation and restoration share one identity-prefix constant.                                                                                                                                 |
| `role-member.ts`          | One `createRoleRelationCommands` factory builds `addMember`, `removeMember`, `addRole` and `removeRole`. Before, there was one factory here and one in `role-hierarchy.ts`. The child-role commands no longer use a second generic, which removes their two `as unknown as NestedRoleTarget` casts.                                                                                                                                                                                         |
| `role-hierarchy.ts`       | Keeps the graph guard, the limits and `readPersistedRoleId`. One exported `readRoleRelation(role, field, missing, invalid)` replaces the two hand-written relation readers in hierarchy and deletion. It calls the accessor with `Reflect.apply`, so no function-type cast is needed. Each caller passes its original error messages.                                                                                                                                                       |
| `role-membership.ts`      | The breadth-first queue is a `for...of` over the growing array. This removes the manual cursor and its unreachable `entry === undefined` branch.                                                                                                                                                                                                                                                                                                                                            |
| `role-resolution.ts`      | `roleQuerySchema(schema)` is the single bridge from an erased `SchemaDefinition` to the schema-root Query API. Before, resolution, membership and deletion each had their own cast. `resolveRoleReference` has one result cast instead of two. `resolveUniqueRoleNameMatch` checks ambiguity first, then the first element. One branch covers the empty and sparse cases, with the same errors.                                                                                             |
| `role-access.ts`          | Each request-domain cache keeps the declaration found when the cache was created. Membership is memoized with `??=`.                                                                                                                                                                                                                                                                                                                                                                        |
| `role-deletion.ts`        | Uses `readRoleRelation`, `roleQuerySchema` and Core's cleanup type. Each helper reads the stable id once instead of up to three times. The `fail` check now tracks one boolean instead of collecting owner names that were never used.                                                                                                                                                                                                                                                      |
| `role-schema.ts`          | `define()` builds the capability object directly and names the field map once through a local `Fields` alias. The exported and private type declarations are the reference ones (see DX parity fixes).                                                                                                                                                                                                                                                                                      |
| `role-schema-identity.ts` | The identity check first narrows with `instanceof RoleSchemaIdentityValue`, then applies the existing `WeakMap` provenance check. This removes the result cast.                                                                                                                                                                                                                                                                                                                             |
| error classes             | `RoleDeletionError`, `RoleHierarchyError` and `RoleReferenceResolutionError` declare `code` as a parameter property. The emitted class still defines `code` before `name`, so own-key order and frozen state are unchanged.                                                                                                                                                                                                                                                                 |
| unchanged                 | `index.ts`, `role-events.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

The following behavior was checked to stay the same:

- Role-name normalization (NFKC, trim, lower-case) on every create, update and upsert path; UUID validation; reference identity strings; ACL JSON restoration.
- Default-deny in the resolver: unknown, foreign or unregistered references, a missing `resolveCurrent`, a missing member and an unknown role all deny. Master never implies membership.
- The request-context check runs before any storage work, and results are memoized per request.
- Membership graph limits and ordering; cycle detection on the post-update graph inside the transaction.
- Deletion policies: `fail` asks every owner, `cascade` requires master authority, and edge clearing and cleanup run in the same order.
- Post-commit event payloads and their order; identity-option provenance; error classes, codes and messages.

### Differential check against the reference

Besides the suites below, the reference and rebuilt internals were bundled
side by side (scratch only, not committed) and fed the same random inputs.
There were 8622 comparisons of:

- `restoreRoleReferenceState`
- `resolveRoleMembershipGraph`, including a 70-level chain and a 10,001-role fan-out
- `assertRoleHierarchyAcyclicGraph`, with random graphs and limits, including the traversal order
- operation name normalization: results, identity of untouched operations, frozen state and key order
- relation-change reading
- `resolveUniqueRoleNameMatch`, `normalizeRoleName` and `createRoleReference`

A second harness ran 3000 random call sequences against
`createStoredRoleResolver`. It varied the registered domain sets, the
reference kinds (name, UUID, serialized, foreign, garbage), failing cache
keys, and missing or failing membership and reference resolution. It compared
the complete dependency call log and every result. All comparisons in both
harnesses matched.

### Casts

Counted on the TypeScript AST (`as const` excluded, an `as unknown as` chain
counted once). Reference: 18. Rebuild: 8, all moved, none new:

- `role-reference.ts`: `reference as RoleReference<TSchema, TSelector>`
  (unchanged); `operation as unknown as ExecutableOperationAst` and
  `normalized as TOperation` (moved from `plugin.ts`).
- `role-resolution.ts`: `roleQuerySchema`, which replaces three
  `as unknown as SchemaClass` sites; one `as unknown as SchemaResult<TSchema>`,
  which replaces two.
- `role-schema.ts`: the overload options cast and the `defineSpecialized`
  options cast (unchanged).
- `role-events.ts`: `handler as PluginEventHandler` (unchanged).

Removed casts:

- the cleanup-contribution cast and the operation-schema cast in `plugin.ts`
- both relation-accessor function casts
- both `NestedRoleTarget` casts
- the identity-option cast

### Emitted declarations

See DX parity fixes: the type declarations of `role-schema.ts` are again the
reference ones. The only remaining `dist/index.d.ts` difference is an unused
`Relation` name the bundler adds to the Core import line (the exported internal
`readRoleRelation` returns `Relation`; its declaration is tree-shaken, the
import specifier is not). It is not visible in any hover, completion or
diagnostic.

## DX parity fixes

`tooling/rebuild/dx-audit.mjs` (see `docs/rebuild/DX-AUDIT.md`) showed that the
private `role-schema.ts` aliases were editor-visible: the `RoleSchemaClass`
export hover and 18 member hovers printed `DeclaredRoleFields<...>` instead of
`RoleSchemaFields<TMemberSchema, RoleSchemaSelfDefinition<TClassName>, ...>`,
the `[schemaResultCapabilitiesType]` member printed
`RoleResultCapabilities<...>` instead of the
`RequestRoleReferenceCarrier & RoleMemberCommands<...> & RoleHierarchyCommands<...>`
intersection, `RoleSchemaOptions.indexes` / `.access` printed
`DeclaredRoleFields` / `SchemaReference<TClassName>` instead of
`RoleSchemaFields<...>` / `RoleSchemaBaseClass<TClassName>`, and consumer
hovers (typegen role language-service fixture, application `AppRole` types)
expanded the same aliases.

Restored verbatim from the reference (types only, runtime unchanged):
`ExactRoleSchemaDefinition`, the private `RoleSchemaBaseClass`,
`RoleSchemaClass`, `ConfiguredRoleSchemaOptions`, `ConfiguredRoleSchemaClass`
and `RoleSchemaOptions`; the private `DeclaredRoleFields`,
`RoleResultCapabilities` and `RoleSchemaCapabilities` aliases are gone. Inside
`define()` the field map is a function-local `Fields` alias and the result
capabilities object is annotated with the reference intersection (neither is
emitted). +28 production lines (2015 -> 2043).

After the fix the audit reports, for `roles-plugin` and its usage sites
(`typegen`, `tests`, `examples/*`): the unused `Relation` import specifier
above (not visible), and `Simplify$1` instead of `Simplify` in the `role`
usage hovers of `tests/role-schema-intellisense.test.ts` and
`typegen/src/generator-role-language-service.test.ts`, which come from Core's
declarations and are fixed with Core.

Validation after the DX parity fixes (branch `rebuild/dx-fix-plugins`, all four
plugin fixes together): `yarn build` pass (before and after `tsc --build`);
`yarn vitest run --project unit --project types` 558 files, 2709 tests passed,
no type errors; `--project e2e` on the four packages and `tests/e2e` (the
`tests/e2e` filter also matches every `packages/*/tests/e2e`) 218 of 219
passed, the known `create-app-packed` 120 s timeout passed alone (6 tests,
51.8 s); `--project postgres-e2e` on the same filters 55 files, 191 tests
passed (package-only filters: e2e 5 files / 8 tests, postgres-e2e 11 files /
53 tests); `--project website-content` 17 files, 66 tests; `yarn
test:pack:built` 32 files, 173 tests; eslint 0 errors (only the existing
`max-lines` warnings), `prettier --check`, `tsc --build` and
`tsc -p tsconfig.test.json` pass for the four packages.

## Removed checks and proofs

- `Discovered role schema lost its declaration` (`plugin.ts`,
  `observePreparedMutation`): role schemas are discovered by filtering on
  `getRoleSchemaDeclaration(schema) !== undefined`. The declaration `WeakMap`
  is written once in `RoleSchema.define()` and never deleted. The rebuild
  stores the declaration found during discovery next to the schema.
- The resolver's second declaration lookup in `resolveMembership` (the
  `Promise.resolve(undefined)` branch): its only callers first get the domain
  from `getDomain`. `getDomain` already returns `undefined`, which denies, for
  a schema without a declaration, and the declaration entry is never deleted.
  The domain now carries that declaration.
- `entry === undefined` in the membership queue: the loop index never
  exceeded the array length, so the branch was unreachable. A `for...of` loop
  has no index.
- The sparse-array branch of `resolveUniqueRoleNameMatch` is merged, not
  removed. An empty or sparse result still throws `ROLE_REFERENCE_UNKNOWN`
  with `Unknown role name: <name>`.

Every other runtime check is kept with its message. This covers the
untrusted-input checks on references, selectors, options, operation nodes,
relation accessors, persisted ids and the identity option.

## Reference bugs found

No security defect was found. One observation, kept as is:
`RoleDeletionError` declares the code `ROLE_DELETE_BULK_UNSUPPORTED`, which is
never thrown, because bulk deletion runs the per-item policy. The code is part
of the public type, so it stays.

## Behavior differences

None. One internal detail changed without affecting the observable contract:
`toRequestRoleReference` is now a method-shorthand function (not
constructible) instead of a function expression. Its name and receiver checks
are the same.

## Test mapping

- No test file was edited: nothing under `tests/`, no `*.test-d.ts`, no
  internal `src/**/*.test.ts`, and no test outside the package.
- Deep imports still resolve to the same exports:
  - `src/plugin.js`: `rolesPlugin`
  - `src/role-schema.js`: `RoleSchema`, `getRoleSchemaDeclaration`
  - `src/role-schema-identity.js`: `roleSchemaIdentityOptionName`
  - `src/role-access.js`: `hasRole`, `createStoredRoleResolver`, `StoredRoleResolverDependencies`
  - `src/role-reference.js`: `createRoleReference`, `getRoleReferenceState`, `normalizeRoleName`
  - `src/role-hierarchy.js`: `assertRoleHierarchyAcyclicGraph`, `readPersistedRoleId`, `RoleHierarchyError`
  - `src/role-membership.js`: `resolveRoleMembershipGraph`
  - `src/role-resolution.js`: `resolveRoleReferenceId`, `resolveUniqueRoleNameMatch`, `RoleReferenceResolutionError`
- `tests/role-schema-intellisense.test.ts` reads `src/role-access.ts` and the
  README as text. Both still contain `requestRoleResolverCapability` and
  `PLUGIN_CAPABILITY_MISSING`.

## Pre-existing failures (untouched tree)

None in the package suites. Baseline results on `8c8bf6e`:

| Command                                                                                                                        | Result                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn build`                                                                                                                   | pass                                                                                                                                                                                                       |
| `yarn vitest run --project unit --project types packages/roles-plugin`                                                         | 10 files, 45 tests passed, no type errors                                                                                                                                                                  |
| `yarn vitest run --project e2e packages/roles-plugin`                                                                          | no test files (the package has no `e2e` project file; vitest exits with code 1)                                                                                                                            |
| `yarn vitest run --project postgres-e2e packages/roles-plugin`                                                                 | 1 file, 8 tests passed                                                                                                                                                                                     |
| `yarn vitest run --project unit --project types examples packages/create-app packages/typegen packages/acl-permissions-plugin` | 50 files, 183 tests passed, no type errors                                                                                                                                                                 |
| `yarn vitest run --project e2e tests/e2e`                                                                                      | 44 files passed, 3 failed: timeouts under load in `create-app-packed` (120 s), `core-archive-declarations` (10 s) and `core-field-builder` (20 s); none involves roles. All three passed in the final run. |
| `yarn vitest run --project postgres-e2e tests/e2e`                                                                             | 55 files, 191 tests passed                                                                                                                                                                                 |
| `node tooling/measure-rebuild.mjs .`                                                                                           | `roles-plugin` 2192                                                                                                                                                                                        |

A first baseline run of the unit suite raced with the background baseline
build (`@ultimabase/testing` unresolved, one packed IntelliSense test empty);
rerun after the build finished, it passed as shown.

## Validation (final tree)

| Command                                                                                                         | Result                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn build`                                                                                                    | pass                                                                                                                                                                                                          |
| `yarn vitest run --project unit --project types packages/roles-plugin`                                          | 10 files, 45 tests passed, no type errors                                                                                                                                                                     |
| `yarn vitest run --project e2e packages/roles-plugin`                                                           | no test files (same as baseline)                                                                                                                                                                              |
| `yarn vitest run --project postgres-e2e packages/roles-plugin`                                                  | 1 file, 8 tests passed                                                                                                                                                                                        |
| `yarn vitest run --project unit examples packages/create-app packages/typegen packages/acl-permissions-plugin`  | 46 files, 174 tests passed                                                                                                                                                                                    |
| `yarn vitest run --project types examples packages/create-app packages/typegen packages/acl-permissions-plugin` | 4 files, 9 tests passed, no type errors                                                                                                                                                                       |
| `yarn vitest run --project e2e tests/e2e`                                                                       | 47 files, 219 tests passed                                                                                                                                                                                    |
| `yarn vitest run --project postgres-e2e tests/e2e`                                                              | 54 files passed, 1 failed: `tests/e2e/virtual-field-public-vertical` (3 tests, `Schema ExampleArticle has not been compiled by an application`; no roles import). Rerun alone: 1 file, 3 tests passed.        |
| `yarn vitest run --project website-content`                                                                     | 17 files, 66 tests passed                                                                                                                                                                                     |
| `yarn test:pack:built`                                                                                          | 32 files, 173 tests passed                                                                                                                                                                                    |
| `yarn eslint packages/roles-plugin`                                                                             | 0 errors, 2 `max-lines` warnings (`src/role-schema.ts` 497 lines, under the 600-line budget, and the unchanged postgres e2e test); the reference had 3 (`plugin.ts` 448, `role-schema.ts` 540, the same test) |
| `yarn prettier --check packages/roles-plugin`                                                                   | pass                                                                                                                                                                                                          |
| `yarn tsc --build packages/roles-plugin`                                                                        | pass                                                                                                                                                                                                          |
| `yarn tsc -p packages/roles-plugin/tsconfig.test.json`                                                          | pass                                                                                                                                                                                                          |
| `yarn build` (after `tsc --build`)                                                                              | pass                                                                                                                                                                                                          |
| `node tooling/measure-rebuild.mjs .`                                                                            | `roles-plugin` 2015                                                                                                                                                                                           |

Consumers (`git grep -l "@ultimabase/roles-plugin" -- packages tests examples apps`):
`examples/minimal`, `examples/todo-backend`, `packages/create-app`,
`packages/typegen`, the two `acl-permissions-plugin` PostgreSQL e2e files,
`tests/e2e/access-provider-composition`, `official-plugin-manifests`,
`package-archives`, and the website pages (covered by `website-content`). Their
e2e and PostgreSQL e2e files are included in the two `tests/e2e` runs.
