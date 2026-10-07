# Core runtime-pipeline partition rebuild

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`.

Scope (`packages/core/src/runtime/…`): `pipeline`, `enforcement`, `behaviors`,
`validation`, `operations`, `contributions`, `relation-filters`, `relations`,
`virtual-fields`, `nested-writes`.

## How the work was done

An earlier agent was interrupted and left an unvalidated WIP: one checkpoint
commit and one WIP commit, 39 files, +2684/−3896. That WIP compiled
(`tsc --build`, `tsconfig.test.json`) and passed the Core unit and type suites,
so it was **continued, not reset**. The branch was rebased twice on `main`: once
at the start, and once after the `core-schema` merge. Neither `main` change
touched this scope.

The whole WIP diff was then reviewed against the reference for parity. Three
observable differences were found and fixed:

1. Runtime interceptor and enforcement option validation had moved to
   `assertExactPlainObject`, which uses `Reflect.ownKeys` and therefore rejects
   symbol keys. The reference checked only enumerable string keys. Restored with
   `isPlainRecord` + `assertExactEnumerableKeys`, which give the same messages
   and the same order.
2. Composed behavior stages had started spreading the whole stage input into
   each transform envelope. The reference rebuilt each envelope with an exact
   key list and key order, for example
   `{ context, nestedWrite?, operation, result, outcome?, selectedFieldsOverride? }`.
   Restored.
3. Adapter materialization snapshots had changed their key order (`kind`
   first). Restored to the reference order (`current`, `kind`, `previous`).
   `current` is still validated before `previous`.

After the review, a few more simplifications were made. They are listed below.

## Production lines

Physical non-blank lines, using `tooling/measure-rebuild.mjs` rules.

| Measure                                 | Before (`main`) |   After | Delta          |
| --------------------------------------- | --------------: | ------: | -------------- |
| This scope (10 directories, prod `.ts`) |          12 290 |  11 261 | −1 029 (−8.4%) |
| Production files in scope               |              71 |      61 | −10            |
| `packages/core` production (measure)    |          62 311 |  61 282 | −1 029         |
| Repository production (measure)         |         111 544 | 110 515 | −1 029         |

Tests: 127 476 lines before and after (unchanged).

## Design summary

The public contract is unchanged:

- every `src/index.ts` export, signature, generic and JSDoc;
- every symbol listed in `docs/rebuild/core-interfaces/iface-core-runtime-pipeline.txt`
  (same module path, name and type);
- stage order, transactions, rollback and post-commit, hook and behavior order,
  nested writes, relation filters, enforcement and protected policies,
  validation order, error classes, codes and messages.

The emitted `dist/index.d.ts` was compared with a build of `main`. It is
identical except for the order of two `#region` blocks: the validation
declarations moved between files.

Module mapping (deleted modules first):

| Reference module                                                                                | Now in                                                 | Simplification                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pipeline/stage-validation.ts`                                                                  | `pipeline/runtime-pipeline.ts`                         | The four name lists and loops became one `assertStageFunctions(stages, names, label, optional)`. Checks and messages run in the same order.                                                                                                                       |
| `pipeline/private-execution.ts`                                                                 | `enforcement/state.ts`, `pipeline/runtime-pipeline.ts` | `combineDatabaseRowFilters` now sits next to the state that already ANDs row filters, and `appendEnforcementRowFilter` reuses it. `RuntimePipelineExecutionState` and `retainExecutionOperation` were removed: the retained operation was written but never read. |
| `pipeline/inclusion-enforcement.ts`                                                             | `pipeline/stage-inputs.ts` (`enforceRuntimeOperation`) | Root operations and eager inclusion targets shared the same sequence: evaluate, enforce, resolve the relation filter, combine row filters, prepare relation predicates. They now use one function, in the same order.                                             |
| `pipeline/inclusion-finalization.ts`                                                            | `pipeline/inclusion-projection.ts` (`#finalizeTarget`) | The hydrator callback and the stage/boundary parameters are gone. The private method uses the projector's own fields.                                                                                                                                             |
| `behaviors/virtual-result-boundary.ts`                                                          | `behaviors/result-snapshot.ts`                         | The duplicate `throwVirtualBoundaryIssue` became the shared `throwBoundaryIssue` (same code, messages and description).                                                                                                                                           |
| `behaviors/validation-boundary-materialization.ts`                                              | `behaviors/validation-boundary-helpers.ts`             | The three copies of the create/delete/update branch became one key table. The record snapshotter is injected, so the helper no longer needs the plans.                                                                                                            |
| `validation/runtime-update-validation.ts`, `runtime-upsert-validation.ts`, `operation-kinds.ts` | `validation/runtime-mutation-validation.ts`            | Merged the update-expression and upsert-create validators. The kind sets are local constants.                                                                                                                                                                     |
| `validation/runtime-validation-errors.ts`                                                       | `validation/runtime-field-validation.ts`               | `runtime-validation.ts` still re-exports `throwRuntimeValidationIssues` and the types.                                                                                                                                                                            |
| `validation/runtime-validation-options.ts`                                                      | `validation/runtime-validation.ts`                     | `RuntimeValidationOptions` and `normalizeRuntimeValidationOptions` are defined at their frozen path instead of being re-exported there.                                                                                                                           |

Simplified modules that kept their path:

| Module                                                         | Simplification                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pipeline/runtime-pipeline.ts`                                 | `#executeOperation` takes one `RuntimeOperationScope` (`nested`, `relationFilters`, `virtualFields`) instead of four optional positional parameters. The early return for a request without a nested-write marker removes one level of nesting. The singular-kind check uses a set. The mutation-batch projector registry moved here from `inclusion-projection.ts`.                                                                                                        |
| `pipeline/database-execution.ts`                               | One straight-line mutation path replaces the `resolveMutationInput`, `runMutationObservers` and `readPreparedMutationRecords` closures and their duplicated `preparesAfterResolution` branches. Creates still prepare after input resolution, and other mutations before it, through `prepared ??=`. `replaceOperation` counts value-changing replacements, so reevaluation and the second `enforcePreparedMutation` run exactly as before.                                 |
| `pipeline/stage-inputs.ts`                                     | The seven single-use envelope factories were replaced by the exported `createRuntimeStageInput`.                                                                                                                                                                                                                                                                                                                                                                            |
| `pipeline/database-capability-validation.ts`                   | The four capability checks share `assertCapability`. Messages and check order are unchanged.                                                                                                                                                                                                                                                                                                                                                                                |
| `behaviors/composition.ts`                                     | Owner attribution moved from an eleven-branch wrapper object into one `collect(key, interceptorPosition)`. Interceptor placement is unchanged: `beforeOperation` first, and `transformPreparedOperation` and `transformResult` last. The two prepared-mutation transforms share `composePrepared`.                                                                                                                                                                          |
| `behaviors/validation-boundaries.ts`                           | The per-instance closure became module functions. Validation plans come from the shared `readRuntimeValidationPlans` cache. `snapshotRuntimeBoundaryResult` takes a record snapshotter, so the four included and non-included cardinality copies became one.                                                                                                                                                                                                                |
| `validation/runtime-validation.ts`                             | One `WeakMap` cache of compiled plans (`readRuntimeValidationPlans`) replaces three per-stage caches. Plans are a pure function of an immutable schema. `revalidateRuntimeMutationOperation` is the same function as `snapshotRuntimeMutationOperation`, as it was in effect before. `upsert-one` and `upsert-many` items share `validateUpsert`.                                                                                                                           |
| `validation/runtime-field-validation.ts`                       | Supplied, resolved and defaulted values go through one validation branch. The immediately invoked switch was removed.                                                                                                                                                                                                                                                                                                                                                       |
| `contributions/*`, `enforcement/*`                             | `readOwnedRuntimeContributions` and `createContributionCallbackDescriptor` are shared by interceptors and enforcement. `normalizeRuntimeOperationKinds` (now in `operations/characteristics.ts`) replaces two copies, and `assertMasterMode` replaces two more. `matchesProtectedPolicy` was the same as `matchesEnforcementContribution`. The protected-policy guards share `requireMatchingPolicies`. `bypassesMaster` names the master-bypass test used in three places. |
| `nested-writes/*`                                              | `readNestedPointerTarget` replaces three copies of the connect/create pointer derivation. `assertResolvedMutation` checks create and update in one loop. The host shares `executeNode`, `executeDetached` and `readMappedBy`, and no longer passes an unused `graph` to the pipeline executor.                                                                                                                                                                              |
| `relations/relation-mutation.ts`                               | The disconnect-on-required-field error is thrown before building the update, with the same message at the same point. The single-use `combinePrivateFilters` was inlined. The unreachable second target loop was removed (see below).                                                                                                                                                                                                                                       |
| `relation-filters/execution.ts`, `virtual-fields/execution.ts` | Both use the shared `isFrameworkControlFailure` instead of a private copy.                                                                                                                                                                                                                                                                                                                                                                                                  |

### Removed unreachable code

- `readRuntimeRelationMutation`: the error `Runtime relation update contains an
invalid target` could not be raised. The same `every(Pointer.is)` condition
  had already failed with `contains an invalid delta`. A non-pointer target
  still fails with `contains an invalid delta`.
- `readRuntimeSelectedFieldsOverride`: `?? permittedFields` was dead, because
  the selection reader always returns an array.
- `getRuntimeOperationFields` and the `createRuntimeNestedUpdateExpression`
  export had no importer.

### Casts

No `as` cast was added. The number of `as` expressions in the scope went from
94 to 80. Every remaining cast predates the rebuild; some only moved with their
code, for example the upsert target casts, the prepared-record correlation
cast and the inclusion result restoration.

## Test mapping

No test file changed. That covers everything under `packages/core/tests/**`,
every `*.test-d.ts`, every in-scope `src/**/*.test.ts` and every test outside
the scope. Every deep import from tests still resolves, because the frozen
modules keep their paths and exports.

Files changed outside the scope: only this document.

## Pre-existing and load-related failures

- `packages/core/tests/e2e/core-archive-declarations.e2e.test.ts > exposes the
documented configured Schema definition factory` timed out (10 s) during the
  full e2e run on a shared, loaded machine. Rerun alone: 22/22 passed. The
  handoff already lists `core-archive-declarations` timeouts under load on the
  reference.

## Reference bugs found

None.

## Behavior differences

None. The three differences introduced by the interrupted WIP were removed (see
above). `docs/rebuild/DIFFERENCES.md` needs no new row.

## Validation (worktree, on `main` `a988010` + this branch)

These commands were run in this order on the final tree. Docker was available.

| Command                                                                                   | Result                                                                        |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `yarn build`                                                                              | pass                                                                          |
| `yarn vitest run --project unit --project types packages/core`                            | 274 files, 1414 tests passed, no type errors                                  |
| `yarn vitest run --project unit --project types` (whole repository)                       | 558 files, 2709 tests passed, no type errors                                  |
| `yarn vitest run --project e2e packages/core tests/e2e`                                   | 47 files, 219 tests passed                                                    |
| `yarn vitest run --project postgres-e2e packages/core tests/e2e packages/postgres-plugin` | 55 files, 191 tests passed                                                    |
| `yarn eslint packages/core`                                                               | 0 errors, 53 warnings: `max-lines` only, the same count as before the rebuild |
| `yarn prettier --check packages/core`                                                     | pass                                                                          |
| `yarn tsc --build packages/core`                                                          | pass                                                                          |
| `yarn tsc -p packages/core/tsconfig.test.json`                                            | pass                                                                          |
| `yarn build` (again, after `tsc --build`)                                                 | pass                                                                          |
| `node tooling/measure-rebuild.mjs .`                                                      | production 110 515 (core 61 282), tests 127 476                               |

On the pre-rebase run of the same tree, the full e2e run had one load-related
timeout (see "Pre-existing and load-related failures"): 1 failed and 218 passed.
Rerun alone, that file passed 22/22. On the final run, every e2e test passed.

In-scope files above the 400-line `max-lines` warning threshold:
`behaviors/validation-boundaries.ts`, `enforcement/definitions.ts`,
`operations/field-values.ts`, `pipeline/contracts.ts`,
`pipeline/database-execution.ts`, `pipeline/inclusion-projection.ts`,
`pipeline/runtime-pipeline.ts`, `relations/relation-mutation.ts`,
`validation/runtime-mutation-validation.ts` and `validation/runtime-validation.ts`.
`contributions/composition.ts` dropped below the threshold. The merged
`runtime-mutation-validation.ts` (530 physical lines) is new on the list. All
production files are under the 600-line budget.
