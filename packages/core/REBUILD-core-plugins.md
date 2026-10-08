# Core rebuild: `core-plugins` partition

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`.

Scope (relative to `packages/core/src`): `plugins/**`, `application/**`,
`errors/**`, `foundation.ts`, `index.ts`.

## Starting point

The branch held an interrupted, unvalidated WIP commit from a previous agent
(29 files). It did not compile: two errors, a stale import of the deleted
`errors/public-error-state.js` and an `exactOptionalPropertyTypes` mismatch in
`manifest.ts`. After those two fixes it built and passed every Core unit and
type test, so the WIP was **continued, not reset**. It was then reviewed line by
line against `main` (messages, error codes, internal details, check order,
frozen results). The review found four regressions, all fixed (see "WIP review
fixes"). The branch was rebased onto `main` after the `core-schema` merge; that
merge did not touch this scope.

## Production lines (scope only, non-blank lines, `*.test.ts`/`*.test-d.ts` excluded)

|        | Files | Lines        |
| ------ | ----: | ------------ |
| Before |    82 | 14 525       |
| After  |    69 | 13 822       |
| Delta  |   −13 | −703 (−4.8%) |

`node tooling/measure-rebuild.mjs .`: Core production 62 311 → 61 608 lines.

## Public contract

`index.ts` and `foundation.ts` are unchanged: same export names, signatures,
generics and JSDoc. Every module and symbol listed in
`docs/rebuild/core-interfaces/iface-core-plugins.txt` still exists at the same
path with the same type contract. Public classes keep their private members, so
their nominal typing is unchanged (`ApplicationSchemaHandleBase`,
`ApplicationModelHandle` still declare `lifetime`, `surface` and
`executeSchemaMutation`).

## Design summary (module mapping)

| New module                                                                                                                                                                                                          | Replaces                                                                                                                                                                  | Simplification                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `errors/framework-error.ts`                                                                                                                                                                                         | `framework-error.ts`, `public-error-state.ts`                                                                                                                             | The private `PublicError` base and its option/payload types live next to their only two subclasses. `plugin-error.ts` imports them from here.                                                                                                                                                             |
| `plugins/capabilities.ts`                                                                                                                                                                                           | `capabilities.ts` (barrel), `capability-requirements.ts`, `capability-declarations.ts`, `capability-declaration-normalization.ts`, `capability-declaration-validation.ts` | One module owns requirements, the declaration buckets and their normalization. The two one-line validation wrappers became direct calls to `assertNonEmptyString` and `assertExactObjectKeys`. `capability-token.ts` and `capability-providers.ts` stay (frozen paths).                                   |
| `plugins/capability-rules.ts` (new)                                                                                                                                                                                 | `capability-provider-planning.ts`, `adapter-capability-planning.ts`, `core-capability-planning.ts`, `plugin-contribution-compiler.ts#derivePluginCapabilityPrivileges`    | One table describes each protected protocol family (adapter capability, adapter contribution, Runtime, persistence rewriter): its requirement rule (privilege or forbidden) and its provider rule (exact helper, privilege). Planning and privilege derivation read the same table, so they cannot drift. |
| `plugins/capability-inventory.ts`                                                                                                                                                                                   | `capability-inventory.ts`, `capability-provider-planning.ts`, `capability-conflict.ts`                                                                                    | Plans are keyed once by token; validation is one `validatePlan` closure (duplicate ids, token privilege, family rules, Core-only providers, single cardinality) in the reference order.                                                                                                                   |
| `plugins/capability-host.ts`                                                                                                                                                                                        | `capability-host.ts`, `plugin-command-materializer.ts`                                                                                                                    | Command transports and handlers are bound inline around capability materialization. Factory-context privilege checks share `findActivePrivilegeRequest`. One `#retain` handles cleanup ownership.                                                                                                         |
| `plugins/plugin.ts`                                                                                                                                                                                                 | `plugin.ts`, `plugin-contribution-compiler.ts`                                                                                                                            | The contribution compiler is private to `plugin()`, its only caller. Capability-implied privileges come from `capability-rules.ts`.                                                                                                                                                                       |
| `plugins/plugin-command-contributions.ts`                                                                                                                                                                           | `plugin-command-contributions.ts`, most of `plugin-command-plan.ts`                                                                                                       | Operations and schema mutations share `assertCommandOptions`. Each contribution stores its compiled handler/transport plan at creation; the separate compile pass and its unreachable "lost its runtime" checks are gone. `plugin-command-plan.ts` keeps only the frozen plan types.                      |
| `plugins/normalization.ts`                                                                                                                                                                                          | `normalization.ts`, `plugin-errors.ts`                                                                                                                                    | One loop; the duplicate-plugin error factory lives with its first user.                                                                                                                                                                                                                                   |
| `plugins/graph.ts`                                                                                                                                                                                                  | same                                                                                                                                                                      | Single-use throw helpers inlined; required and optional dependencies resolved in one pass (same order).                                                                                                                                                                                                   |
| `plugins/manifest.ts`                                                                                                                                                                                               | same                                                                                                                                                                      | Adds `snapshotVocabularyList` (closed-vocabulary list validation), `snapshotPluginIdentity` and `pluginContributionOwner`, reused by manifests, privilege policy, `withPluginPrivileges`, the inventory and the declaration host.                                                                         |
| `plugins/setup-registries.ts`                                                                                                                                                                                       | same                                                                                                                                                                      | The generic `OwnedContributionStore` (only `registerLocal` was used) became one array; `abortSetup`/`assertPrivilege` aliases removed. Compiler identities were already unique application-wide, so the per-owner name check was unreachable.                                                             |
| `plugins/declaration-host.ts`                                                                                                                                                                                       | same                                                                                                                                                                      | The two hand-written `fields`/`schemas` context types now use the same `PrivilegedDeclarationContext` as the other facades. The owner record uses `pluginContributionOwner`; the two static capability-read failures share one helper.                                                                    |
| `plugins/schema-field-patch-operations.ts`                                                                                                                                                                          | `schema-field-patch-operations.ts`, `schema-artifact-patch-operations.ts`                                                                                                 | All five patch factories share one `registerPatchOperation`.                                                                                                                                                                                                                                              |
| `plugins/typegen-declarations.ts`                                                                                                                                                                                   | `typegen-declarations.ts`, `compiled-typegen-graph.ts`                                                                                                                    | The compiled Typegen projection lives with its types.                                                                                                                                                                                                                                                     |
| `plugins/schema-runtime-options.ts`                                                                                                                                                                                 | same                                                                                                                                                                      | Schema and field occurrences share one `collect` step (same context keys and order, value read lazily as before).                                                                                                                                                                                         |
| `plugins/schema-declaration-contracts.ts`                                                                                                                                                                           | same                                                                                                                                                                      | `samePluginOwner` duplicated `isSamePluginIdentity`; removed.                                                                                                                                                                                                                                             |
| `plugins/plugin-contributions.ts`                                                                                                                                                                                   | same                                                                                                                                                                      | Declaration surfaces are one table (surface → privilege); application resource validation is one pass; `withPluginPrivileges` uses `snapshotVocabularyList`.                                                                                                                                              |
| `application/application-handles.ts`                                                                                                                                                                                | same                                                                                                                                                                      | Schema and model handles share one `withMutationMethods` proxy factory.                                                                                                                                                                                                                                   |
| `application/application-model-views.ts`                                                                                                                                                                            | same                                                                                                                                                                      | Collection and record views share one cache and one descriptor-copy helper (also used for model views).                                                                                                                                                                                                   |
| `application/plugin-privilege-policy.ts`, `plugin-privilege-diagnostics.ts`                                                                                                                                         | same                                                                                                                                                                      | Denial lists use `snapshotVocabularyList`; identities use `snapshotPluginIdentity`.                                                                                                                                                                                                                       |
| `plugin-operations.ts`, `plugin-schema-mutations.ts`, `operation-contract-validation.ts`, `typegen-contracts.ts`, `definition.ts`, `application-surface-declarations.ts`, `schema-mutation-surface-declarations.ts` | same                                                                                                                                                                      | Hand-written unknown-key loops replaced by the shared `assertExactEnumerableKeys` (same `Object.keys` order, same message prefix).                                                                                                                                                                        |
| `plugins/constraint-compilers.ts`                                                                                                                                                                                   | same                                                                                                                                                                      | Duplicate-compiler error and identity comparison inlined at their only call site.                                                                                                                                                                                                                         |

## WIP review fixes

- `capability-host.ts`: provider contributions of an inactive requirement were
  a fresh mutable `[]`; they are again the shared frozen empty array. The
  inlined resource check produced unsafe `Function` calls; the typed
  `assertApplicationResource` assertion was restored.
- `plugin.ts`: the compiled `commands` plan was a plain object stored in the
  definition's symbol-keyed native plan; it is frozen again.
- `plugin-command-materializer.ts`: inlined by the WIP but left in place; deleted.
- `constraint-compilers.ts`: the registry exposed an unbound reader method
  (lint `unbound-method`); it reads through a local closure again.

## Casts

No new `as` cast was introduced. Casts that moved with their code: the two
`as TPhase` in `requireCapability`/`optionalCapability`,
`readContributions(...) as readonly MaterializedCapabilityContribution<TToken>[]`,
`Object.keys(pluginPrivilegeMetadata) as PluginPrivilege[]` (moved from
`plugin-privilege-policy.ts` to `manifest.ts`), `snapshot as NormalizedPlugin`,
`bindings as TBindings` (×2), `requires as TRequirements`,
`names as TPrivileges`, `value as PluginContribution`,
`... as AddSchemaFieldOperation<...>`. Removed casts: the five
`options.x as DeclarationCallback | undefined`, the three
`claim as PluginEnvironmentClaim`, the two `value as TValue` and the two
`privilege as PluginPrivilege` in vocabulary checks,
`contribution as PluginOperationAuthoringContribution`,
`contribution as PluginDeclarationContribution` and
`immutableArray(bindings) as readonly TBinding[]`.

## Test mapping

Nothing under `packages/core/tests/**`, no `*.test-d.ts` and no test outside the
scope changed. One internal test changed only an import specifier:

| Test file                                             | Change                                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/plugins/schema-compilation/declarations.test.ts` | `addSchemaConstraint` import: `'../schema-artifact-patch-operations.js'` → `'../schema-field-patch-operations.js'` (module merged) |

No assertion, input or expectation changed.

## Removed unreachable checks

- `plugin operation contributions must be an array`,
  `plugin operation contribution lost its runtime`,
  `plugin schema mutation contribution lost its runtime`: the command list is
  built by `plugin()` itself and every nominal command contribution now carries
  its plan from creation.
- `plugin declaration contribution must be created by contributeDeclarations`
  (in `runPluginDeclarationContribution`): it now receives the already resolved
  runtime record.
- `Plugin "…" already registered contribution "…"` and the unused
  `registerUnique` / `Contribution "…" is already owned …` path in
  `setup-registries.ts`: the only registered contributions are constraint
  compilers, whose `(adapter, kind, version)` identity is rejected as a
  duplicate application-wide (`duplicate-database-constraint-compiler`) before
  registration; adapter and kind patterns exclude `:` and `@`, so two identities
  cannot share a storage name.
- `contribution name` assertions of the unused `has`/`get` store methods.

## Behaviour differences

None intended. Two internal-only effects worth noting for reviewers:

- Command handler plans are built when `contributeOperation` /
  `contributeSchemaMutation` is called instead of when `plugin()` compiles the
  list. Plans are immutable and contain no per-plugin state, so reuse of one
  contribution in several plugins behaves as before.
- Unattributed (Core-foundation) capability cleanup callbacks are still invoked
  as methods of the retained record, as in the reference.

## Reference bugs found

None.

## Pre-existing failures

See "Validation". Known reference failures (from `docs/rebuild/HANDOFF.md`):
the typegen hybrid-authoring performance budget and
`create-app-packed.e2e.test.ts` timeout under machine load.

## Validation

All commands were run in the worktree, on the branch rebased onto `main`
(`a988010`, after the `core-schema` merge). The machine was shared with other
agents.

| Command                                                             | Result                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `yarn build`                                                        | pass                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `yarn vitest run --project unit --project types packages/core`      | 274 files, 1414 tests passed, no type errors                                                                                                                                                                                                                                                                                                                                                                                   |
| `yarn vitest run --project unit --project types` (whole repository) | 558 files, 2709 tests passed, no type errors                                                                                                                                                                                                                                                                                                                                                                                   |
| `yarn vitest run --project e2e packages/core tests/e2e`             | 47 files, 219 tests passed                                                                                                                                                                                                                                                                                                                                                                                                     |
| `yarn vitest run --project postgres-e2e packages/core tests/e2e`    | 55 files, 191 tests passed                                                                                                                                                                                                                                                                                                                                                                                                     |
| `yarn test:pack:built`                                              | 31/32 files, 172/173 tests passed. The failure was a 10 s timeout in `core-archive-declarations.e2e.test.ts > exposes the documented configured Schema definition factory` (language-service quick info under load). Rerun alone: 1 file, 22/22 tests passed.                                                                                                                                                                  |
| `yarn eslint packages/core`                                         | 0 errors, 54 warnings, all `max-lines` (400-line warning threshold). In scope: `capability-host.ts` (557 physical lines), `framework-application.ts` (540), `capability-inventory.ts` (518), `plugin-contributions.ts` (501), `plugin.ts` (432), `plugin-privilege-policy.ts`, `schema-declaration-registry.ts`, `source-projections.ts`, plus three unchanged test files. Every production file is under the 600-line budget. |
| `yarn prettier --check packages/core`                               | pass                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `yarn tsc --build packages/core`                                    | pass                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `yarn tsc -p packages/core/tsconfig.test.json`                      | pass                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `yarn build` (again, after `tsc --build`)                           | pass                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `node tooling/measure-rebuild.mjs .`                                | production 111 544 → 110 841 lines; `core` 62 311 → 61 608 (−703, all in this scope)                                                                                                                                                                                                                                                                                                                                           |

No baseline run was repeated on the untouched tree; no failure needed one
(the only failure passed in isolation).
