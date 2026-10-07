# `@ultimabase/validation-plugin` rebuild notes

Rebuilt from reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`
following `docs/rebuild/PROTOCOL.md`, on branch `rebuild/small-plugins-a`
(base `953e832`). The public entry (`src/index.ts`) is unchanged and the built
`dist/index.d.ts` is byte-identical to the build of the base commit. Core,
`plugin-kit` and `shared` are consumed only through their public exports.

Most of the package is public contract (the Standard Schema compatibility
types, the field option, the issue types) and boundary checks whose messages
and order are observable. The rebuild only touches the arithmetic-projection
path and duplicated helpers.

## Production lines (`node tooling/measure-rebuild.mjs .`)

|           | validation-plugin |
| --------- | ----------------- |
| Before    | 663               |
| After     | 622               |
| Reduction | 41 lines (6.2%)   |

| File                          | Before | After |
| ----------------------------- | -----: | ----: |
| `field-validation-fixture.ts` |     11 |    11 |
| `field-validation.ts`         |    139 |   140 |
| `index.ts`                    |     11 |    11 |
| `operation-validation.ts`     |    323 |   280 |
| `options.ts`                  |     53 |    53 |
| `plugin.ts`                   |     66 |    66 |
| `standard-schema.ts`          |     60 |    61 |

All modules stay (`field-validation.ts` and `operation-validation.ts` are
website page `sources`; `field-validation-fixture.ts` is imported by
`field-validation.test.ts`).

## Design summary

| Module                    | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operation-validation.ts` | `collectArithmeticIssues` handles `upsert-many` first, then the three update kinds directly; the nested `validate(kind, update, path)` helper (always called with `['update']`) is gone. The seven-parameter `validateTargetProjection` became a local `validateProjection(update, target, targetPath)` closure over `schema`, `plans`, `fields` and `callbacks`. `operation.update` is still read once. `throwValidationIssues` is inlined into `validateMutationInput`. Transient issue arrays are no longer copied and frozen at each level: the thrown `issues` snapshot, every issue record and every issue path stay frozen, exactly as exposed before. |
| `field-validation.ts`     | Uses the shared `isObjectOrFunction` guard.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `standard-schema.ts`      | Exports `isObjectOrFunction` (`@internal`; not re-exported from `index.ts`), which was duplicated in `field-validation.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| unchanged                 | `index.ts`, `options.ts`, `plugin.ts`, `field-validation-fixture.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Unchanged behaviour (checked): Standard Schema protocol checks and messages at
option normalization and again at execution; synchronous-only validation;
"validators cannot transform values"; issue path normalization and the
default issue for an empty issue list; children-first traversal that skips
descendants of a failed path; `null` and arithmetic inputs skipped by direct
validation; projected arithmetic validated on the snapshotted target and
projection; the `targets` / targetless-upsert / bulk-upsert rejection issues
and their order; `VALIDATION_ERROR` with the same public and internal details;
lazy per-schema plan cache.

### Differential check against the reference

A temporary harness (scratch only, not committed) imported the reference
`operation-validation.ts` next to the rebuilt module and ran 3000 random
mutation inputs through both `validateMutationInput` and
`requiresValidationTargets`: `update-one`, `update-many`, `upsert-one`,
`upsert-many` and `create-one`, random `increment` / `decrement` / `set` on
validated and unvalidated fields, a string field whose validator returns an
empty issue list, `target` `null` / `undefined` / record, and `targets`
absent / empty / several records. It compared the thrown error (code,
message, public and internal details, frozen state), every validator call in
order and the boolean result. All 3000 matched. Outcomes covered: success and
`VALIDATION_ERROR` for every update/upsert kind (including the unavailable
target issues), the missing-target `TypeError`, and an identical rejection of
the harness's deliberately incomplete `create-one` node.

### `as` casts

One before, one after, unchanged: `readValidator` returns
`value as FieldStandardSchema` for the field option that
`fieldValidationOption.normalize` already asserted.

## Removed checks and proofs

None. `createProjectableUpdate` keeps its `normalized update` guard, and the
`schema definition` / `prepared target` `TypeError`s are kept in the same
order.

## Behaviour differences

None.

## Test mapping

No test was edited: nothing under `tests/`, no `*.test-d.ts`, no internal
`src/**/*.test.ts`, no test outside the package. Deep imports keep the same
exports: `./operation-validation.js` (`createValidationPlanCache`,
`validateMutationInput`), `./plugin.js` (`validationPlugin`),
`./field-validation-fixture.js` (`readValidationIssues`).

## Pre-existing failures (untouched tree)

None in the package suites (unit + types 8 files / 43 tests; e2e 1 / 1;
postgres-e2e 1 / 1). `src/field-validation.test.ts` carries the pre-existing
`max-lines` warning (692 lines).

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
