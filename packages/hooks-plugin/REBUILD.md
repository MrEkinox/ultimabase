# hooks-plugin rebuild

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`.

## Production lines (`node tooling/measure-rebuild.mjs .`)

|        | Lines         |
| ------ | ------------- |
| Before | 4145          |
| After  | 3447          |
| Delta  | -698 (-16.8%) |

The previous figure here (3109) did not match the measurement script: on the
tree before the DX parity fixes `node tooling/measure-rebuild.mjs .` reports
3421 production lines; the fixes below add 26 (3421 -> 3447).

## DX parity fixes

`tooling/rebuild/dx-audit.mjs` (see `docs/rebuild/DX-AUDIT.md`) found
editor-visible differences caused by private type simplifications. The
reference type declarations were restored verbatim (types only, runtime
unchanged, +26 production lines):

- `plugin.ts`: the private `HooksSource` alias. Without it the `HooksPlugin`
  hover printed `source: PluginDeclarationSource<PluginDeclarationContribution<readonly [], HooksOptionSource>>`
  instead of `source: HooksOptionSource`.
- `authoring/contracts.ts`: the private `SchemaBeforeMutationInputForKind`
  alias, which `SchemaBeforeMutationHook`'s `input` parameter (and its hover)
  names.
- `authoring/schema-mutation-contracts.ts`: the separate
  `SchemaMutationBeforeOperationHooks` / `SchemaMutationAfterOperationHooks`
  projections and the inline merges in `SchemaBeforeOperationHooks` /
  `SchemaAfterOperationHooks`. The private `CombineOperationHooks` helper
  reordered the key union in hovers (custom mutation keys first instead of
  the native lifecycle keys first), visible
  on the two exported aliases, their members, and `SchemaHooks` /
  `SchemaHooksOption.beforeOperation` / `.afterOperation`.
- `authoring/source-contracts.ts`: the private `SourceHandler` and
  `SourceHandlerDeclaration` aliases used by `SourceFieldHooksOption`.

After the fix the audit reports no `hooks-plugin` difference except the
usage hovers of `item` / `originalItem` in `src/schema-mutation-hooks.test-d.ts`
(8 sites), which differ only by Core's private `Simplify$1` alias name
(`@ultimabase/core` declarations); they are fixed with Core, not here.

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

## Design summary

The public contract (every `src/index.ts` export, its signatures, generics,
literal types and public JSDoc), the observable hook order, recursion keys,
transactions, rollback, post-commit event delivery, diagnostics, error classes,
codes and messages are unchanged. Core is consumed only through
`@ultimabase/core` public exports, as before.

Module layout (28 production files before, 16 after):

| New module                               | Replaces                                                                                                                               | Simplification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authoring/declarations.ts`              | `normalization.ts`, `declarations.ts`, `field-declarations.ts`, `family-keys.ts`                                                       | One declaration boundary. Handler lists use one `Array.from` pass (holes still fail at their index). The `schemaHookGroups` object plus casts became a `Map` of `group.branch` to phase. The `normalizeExactHookDeclaration` wrapper and the `HookSpecificityOrder` alias were removed.                                                                                                                                                                                                                       |
| `context/hook-context.ts`                | `hook-context.ts`, `execution-context.ts`                                                                                              | `HookExecutionContext` now lives next to the class that implements it.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `plugin.ts`                              | `plugin.ts`, `options.ts`                                                                                                              | The option definitions are private to the plugin that declares them. Redundant type annotations on non-exported requirement constants were removed. Event consumers are built with one `map`.                                                                                                                                                                                                                                                                                                                 |
| `contributions.ts`                       | same                                                                                                                                   | `requireSchemaHooks` and `requireFieldHooks` were merged into one `requireHooks`.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `runtime/contribution-plan.ts`           | same                                                                                                                                   | Field drafts are indexed straight into a `Map` during the recursive walk; the separate array, the second index and the `MutableFieldPlan` to `FieldHookContributionPlan` copy are gone. The mutation-branch check is inlined. Owner description is inlined into the only error that uses it.                                                                                                                                                                                                                  |
| `runtime/dispatcher.ts`                  | `dispatcher.ts`, `contribution-execution.ts`, `input-resolution.ts`, `schema-phases.ts`, `schema-mutation-phases.ts`, `composition.ts` | One closure over `plan`, `runtime` and `boundaries` replaces parameter threading through 5 modules. Native and custom-mutation handler collection share one `collectHandlers`. The before and after custom-mutation runners share one `runSchemaMutationHooks`. `readNative*Operation` guards were replaced by kind narrowing. The single-use input factories (`createSchemaAfterInput`, `createSchemaPreparedInput`, `createSchemaResolveInput`, `materializeSchema*`) are inlined at their only call sites. |
| `runtime/execution-runtime.ts`           | `execution-runtime.ts`, `execution-descriptor.ts`                                                                                      | The invocation outcome is a plain local discriminated union. Diagnostics are built by one `report` closure (no separate create and notify methods). The descriptor no longer stores a precomputed `key`: the recursion key is computed in `invoke`, from the same five identity fields. The 22-entry queryable-phase allow-list became the equivalent 3-entry deny-list (`event`, `post-commit-event`, `prepared-operation`) over the same `HookDiagnosticPhase` union. Event failures are thrown inline.     |
| `runtime/hook-context-runtime.ts`        | same                                                                                                                                   | Inlined the closed-context error factory and payload snapshot helper.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `runtime/lifecycle.ts`                   | `phase-order.ts`, `materializations.ts`                                                                                                | The phase table and item pairs (what runs for which terminal, with which items) are in one module. Boundary checks share `requireBoundary`.                                                                                                                                                                                                                                                                                                                                                                   |
| `runtime/events.ts`                      | same                                                                                                                                   | `defineEvent` and `onEvent` share `assertExactOptions`. Trusted lookups share `readTrusted`. Messages are unchanged.                                                                                                                                                                                                                                                                                                                                                                                          |
| `authoring/source-contracts.ts`          | same                                                                                                                                   | Unchanged (the reuse of `HookHandlerDeclaration` was reverted for hover parity, see DX parity fixes).                                                                                                                                                                                                                                                                                                                                                                                                         |
| `authoring/schema-mutation-contracts.ts` | same                                                                                                                                   | Unchanged (the merged `SchemaMutationOperationHooks`/`CombineOperationHooks` were reverted for hover parity, see DX parity fixes).                                                                                                                                                                                                                                                                                                                                                                            |
| `authoring/contracts.ts`                 | same                                                                                                                                   | Unchanged (the inlined `SchemaBeforeMutationInputForKind` alias was restored for hover parity, see DX parity fixes).                                                                                                                                                                                                                                                                                                                                                                                          |

Internal-only mechanisms that are still asserted by internal tests were kept,
in compact form:

- the `specific-first` family order
- set-based before-item pairs
- the shared frozen empty sequence

None of their assertions was removed.

## Test mapping

Nothing under `packages/hooks-plugin/tests/**` changed, no `*.test-d.ts`
changed, and no test outside the package changed. `src/plugin.ts`,
`src/runtime/events.ts`, `src/runtime/diagnostics.ts` and
`src/context/hook-context.ts` stay at the paths that `tests/` and the
`*.test-d.ts` files deep-import.

The internal `src/**/*.test.ts` files changed only their import specifiers.
All inputs, assertions and expectations are byte-identical:

| Test file                                                                                                                                         | Change                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/authoring/family-keys.test.ts`                                                                                                               | `./family-keys.js` → `./declarations.js`                                                                                             |
| `src/authoring/normalization.test.ts`                                                                                                             | `./normalization.js` → `./declarations.js`                                                                                           |
| `src/runtime/execution-runtime.test.ts`                                                                                                           | `../authoring/normalization.js` → `../authoring/declarations.js`; `./execution-descriptor.js` (2 imports) → `./execution-runtime.js` |
| `src/runtime/materializations.test.ts`                                                                                                            | `./materializations.js` → `./lifecycle.js`                                                                                           |
| `src/runtime/phase-order.test.ts`                                                                                                                 | `./phase-order.js` → `./lifecycle.js`                                                                                                |
| `src/runtime/hook-context-runtime.test.ts`, `contribution-plan-security.test.ts`, `events.test.ts`, `diagnostics.test.ts`, `field-inputs.test.ts` | unchanged                                                                                                                            |

## Reference bug found (documented, not reproduced)

In the reference `flattenSchemaHookGroups`, custom mutation branches were
accumulated in a plain object: `mutations[branch] ?? {}`, followed by
`mutation[group] = value`. A branch named `__proto__` passes the identifier
check. It can arrive as an own key from `JSON.parse` or `defineProperty`. When
it does, `mutations.__proto__` resolves to `Object.prototype`, so the reference
writes `Object.prototype.beforeOperation` or `afterOperation` (prototype
pollution) and silently drops the declaration.

The rebuild accumulates branches in a `Map` and builds the result with
`Object.fromEntries`. A `__proto__` branch is therefore kept as an ordinary
command name, and startup rejects it like any other unknown command:
`Unknown schema mutation Hook branch: ...`. No test covers this input.
Reproducing the pollution would have meant writing deliberately unsafe code.

## Removed unreachable checks

Each of these errors could not be raised given the earlier guards on the same
path, so the check was removed:

- `Delete operations do not resolve mutation input`: deletes return before input resolution.
- `Schema resolveInput requires a prepared target`: every remaining kind is already checked by the update or upsert messages.
- `Prepared mutation hook requires one materialized original item`: the value is always `null` or an object.
- `Native Hooks require a database operation` and `... database mutation`.

The last two guards previously also routed a `plugin-schema-mutation`
operation that was not a plain record to that error. Core always builds
operation ASTs as frozen plain records, so the kind check alone now
discriminates.

## Pre-existing failures (untouched tree)

- `yarn vitest run --project e2e tests/e2e`: 1 failed out of 219. The failure is
  `packages/create-app/tests/e2e/create-app-packed.e2e.test.ts > packed
initializer outside the repository > writes a valid graph for each official
plugin selected alone`, which timed out at 120000 ms. It is pulled in by the
  `tests/e2e` filter and packs and installs a generated app. It passed on the
  rebuilt tree, so it looks like a flaky timeout.

All other baseline suites passed.

## Validation commands and results

| Command                                                        | Baseline                        | Rebuilt                              |
| -------------------------------------------------------------- | ------------------------------- | ------------------------------------ |
| `yarn build`                                                   | pass                            | pass                                 |
| `yarn vitest run --project unit packages/hooks-plugin`         | 17 files, 79 tests passed       | 17 files, 79 tests passed            |
| `yarn vitest run --project types packages/hooks-plugin`        | 4 files, 6 tests passed         | 4 files, 6 tests passed              |
| `yarn vitest run --project e2e packages/hooks-plugin`          | 2 files, 3 tests passed         | 2 files, 3 tests passed              |
| `yarn vitest run --project postgres-e2e packages/hooks-plugin` | 1 file, 5 tests passed          | 1 file, 5 tests passed               |
| Consumers, `--project unit` (1)                                | 112 files, 534 tests passed     | 112 files, 534 tests passed          |
| Consumers, `--project e2e` (1)                                 | 9 files, 43 tests passed        | 9 files, 43 tests passed             |
| Consumers, `--project postgres-e2e` (1)                        | 28 files, 114 tests passed      | 28 files, 114 tests passed           |
| `yarn vitest run --project e2e tests/e2e`                      | 1 failed, 218 passed (47 files) | 219 passed (47 files)                |
| `yarn vitest run --project postgres-e2e tests/e2e`             | 191 passed (55 files)           | 191 passed (55 files)                |
| `yarn eslint packages/hooks-plugin`                            | not run                         | 0 errors, 3 `max-lines` warnings (2) |
| `yarn prettier --check packages/hooks-plugin`                  | not run                         | pass                                 |
| `yarn tsc --build packages/hooks-plugin`                       | not run                         | pass                                 |
| `yarn tsc -p packages/hooks-plugin/tsconfig.test.json`         | not run                         | pass                                 |

(1) The consumer runs cover these packages:
`packages/access-plugin`, `acl-permissions-plugin`, `graphql-plugin`,
`rest-plugin`, `roles-plugin`, `soft-delete-plugin`, `validation-plugin`,
`create-app` and `typegen`. They also cover every Core test file that imports
`@ultimabase/hooks-plugin`.

(2) The 400-line warning threshold flags `runtime/dispatcher.ts` (534 physical
lines), `runtime/execution-runtime.ts` (474) and the unchanged
`tests/e2e/hooks-plugin-postgres.postgres.e2e.test.ts`. The reference already
had `execution-runtime.ts` at 493 lines. All files are under the 600-line
budget.

The emitted `dist/index.d.ts` was also compared against a build of the
reference. The exported names are identical. The only differences are the
private type aliases listed in the design summary.
