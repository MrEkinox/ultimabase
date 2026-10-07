# `@ultimabase/soft-delete-plugin` rebuild notes

Rebuilt from reference snapshot `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`
following `docs/rebuild/PROTOCOL.md`, on branch `rebuild/small-plugins-a`
(base `953e832`). The public entry (`src/index.ts`) is unchanged: same runtime
and type exports, signatures, generics, literal types and JSDoc. Core,
`plugin-kit` and `shared` are consumed only through their public exports.

The package is mostly public contract: the `SoftDeletePlugin<TMode>` source
projection that drives typing, explicit annotations required by
`isolatedDeclarations`, and three mutation definitions. The data-visibility
code (`visibility.ts`), the replace-delete rewriter (`replace-delete.ts`), the
explicit mutation and its wire bindings (`explicit.ts`) and the administration
mutations (`administration.ts`) are **byte-identical** to the reference:
tombstoned rows stay hidden from every ordinary operation (including Master),
`create-one` / `create-many` are left alone, only this instance's `restore` /
`purge` see tombstoned rows, and only schemas whose tombstone was contributed
by this exact plugin instance are targeted.

## Production lines (`node tooling/measure-rebuild.mjs .`)

|           | soft-delete-plugin |
| --------- | ------------------ |
| Before    | 710                |
| After     | 689                |
| Reduction | 21 lines (3.0%)    |

| File                | Before | After |
| ------------------- | -----: | ----: |
| `administration.ts` |     63 |    63 |
| `contracts.ts`      |     45 |    45 |
| `explicit.ts`       |     72 |    72 |
| `index.ts`          |      7 |     7 |
| `options.ts`        |     85 |    84 |
| `plugin.ts`         |    312 |   292 |
| `replace-delete.ts` |     39 |    39 |
| `visibility.ts`     |     87 |    87 |

All modules stay: `plugin.ts`, `visibility.ts`, `explicit.ts` and
`administration.ts` are `sources` of website pages; `contracts.ts`,
`options.ts` and `replace-delete.ts` are deep-imported by internal tests.

## Design summary

| Module         | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin.ts`    | Nine single-use source aliases (`ExplicitSoftDeleteFieldSource`, `ReplaceSoftDeleteFieldSource`, `DefaultSoftDeleteFieldSource`, and six `…MutationSource` / `…AdministrationSource`) became two generic aliases, `TombstoneSource<Selector>` and `SurfaceSource<Selector, Surface>`, applied in the same union. The visibility provider, the replace-delete provider and the other contributions are created inline in the contribution list, in the same order. |
| `contracts.ts` | The `softDeleteNoInputTypegen` export (used only to build `softDeleteNoInput`) is inlined into the `defineOperationValue` call.                                                                                                                                                                                                                                                                                                                                   |
| `options.ts`   | The normalizer returns its object directly (its return type was already annotated).                                                                                                                                                                                                                                                                                                                                                                               |
| unchanged      | `index.ts`, `visibility.ts`, `replace-delete.ts`, `explicit.ts`, `administration.ts`                                                                                                                                                                                                                                                                                                                                                                              |

### Type identity of the source projection

`SoftDeletePlugin<TMode>` is the type that controls which schema options,
fields and commands an application sees. Before committing, the reference
aliases were appended to the rebuilt `plugin.ts` in a scratch copy together
with an exact type-equality check (`(<T>() => T extends A ? 1 : 2) extends
(<T>() => T extends B ? 1 : 2)`). It proved
`OldSoftDeleteSource<M>` ≡ `SoftDeleteSource<M>` for `'disabled'`,
`'explicit'`, `'replace-delete'` and the widened `SoftDeleteMode`, plus the
mode-independent part and one default branch alone. A negative control
(`'explicit'` vs `'disabled'`) failed to compile as expected.

### Emitted declarations

`dist/index.d.ts` differs from the base build only in private names: the two
generic aliases and three selector aliases replace the nine removed aliases,
the `explicitSoftDeleteSurface` / `softDeleteAdministrationSurface` value
declarations are no longer needed (the aliases name the surface types
directly), and the Core import adds `SchemaSelectorOptions`. Every exported
name resolves to the same type (above), and the language-service tests
(`tests/soft-delete-intellisense.test.ts`, `src/plugin.test-d.ts`) pass.

### `as` casts

None before, none after (`as const` excluded).

## Removed checks and proofs

None. Option, schema-option, unit-input and ownership checks keep their
messages and order.

## Behaviour differences

None.

## Test mapping

No test was edited: nothing under `tests/`, no `*.test-d.ts`, no internal
`src/**/*.test.ts`, no test outside the package. Deep imports keep the same
exports: `./contracts.js` (`SoftDeleteSchemaOption`), `./options.js`
(`normalizeSoftDeletePluginOptions`, `resolveSoftDeleteMode`,
`softDeleteSchemaOption`), `./plugin.js` (`softDeletePlugin`),
`./replace-delete.js` (`createSoftDeletePersistenceRewriter`).

## Pre-existing failures (untouched tree)

None in the package suites (unit + types 6 files / 21 tests; e2e 1 / 3;
postgres-e2e 3 / 16).

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
