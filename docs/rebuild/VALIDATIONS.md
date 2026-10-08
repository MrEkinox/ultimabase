# Validation correspondence: reference and rebuild

This document maps every validation of the reference implementation (commit
`0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`, imported unchanged as `edf3032`)
to its equivalent in the rebuild, lists the rebuild-specific evidence, and
records the known load-sensitive tests. A validation that was not executed
does not count as passed.

## Unchanged validation surface

The rebuild changed no validation entry point. `git diff edf3032 -- package.json
vitest.config.ts tooling/vitest tooling/issues tooling/documentation
tooling/tsconfig eslint.config.ts tsconfig.json` is empty (for `tooling/ci` and
`.github`, see the CI-only change below), and no test
file, fixture or `*.test-d.ts` assertion was weakened (see the test mapping of
each `REBUILD*.md`). Every command below therefore has the **same name and the
same definition** on both trees; only the code under test differs.

One CI-only change was made after the rebuild was published (2026-10-08): on
GitHub-hosted runners, the Typegen performance suites
(`hybrid-authoring`, `typegen-editor`) timed out or exceeded their ratio
budgets under V8 coverage, on the reference's own `main` as well as on the
rebuild. The `Complete coverage` job now runs
`yarn test:coverage --exclude '**/*.performance.test.ts'`, and
`tooling/ci/run.ts` runs performance suites in the package and transversal
jobs instead (without instrumentation), so they still run once per CI plan.
Root scripts and `vitest.config.ts` are unchanged: locally,
`yarn test:coverage` and `yarn test` still include the performance project.

Uninstrumented, `hybrid-authoring` still exceeded its own 180 s test timeout on
a hosted runner. On a quiet 12-core machine the test takes about 160 s on both
trees (reference 161.2 s and 159.2 s, rebuild 159.7 s and 160.0 s), so the
timeout leaves no margin for slower runners. At the user's explicit request,
its timeout was raised to 360 s. This is the only post-rebuild test edit: the
budgets and every assertion are unchanged.

The only tooling the rebuild added is evidence tooling, which no root script
runs: `tooling/measure-rebuild.mjs`, `tooling/rebuild-worktree.sh` and
`tooling/rebuild/dx-audit.mjs` (with `tooling/rebuild/dx-audit/`).

## Root commands

| Command (reference = rebuild) | Definition                                                                                                                                                      | What it covers                                                                                                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn validate`               | `format:check`, `typecheck`, `test`, `lint`, `build`, in that order                                                                                             | The ordinary repository gate ([ADR-0275](../adr/0275-canonical-repository-validation.md)).                                                                                                                          |
| `yarn validate:full`          | `validate`, then `test:coverage`, `check:issues`, `constraints`, `website:validate`                                                                             | The complete gate required for behavior-preserving refactors, which is what every rebuild step is.                                                                                                                  |
| `yarn format:check`           | `prettier . --check`                                                                                                                                            | Formatting of every tracked file, including Markdown.                                                                                                                                                               |
| `yarn typecheck`              | `tsc --build tsconfig.json tooling/tsconfig/test.json`                                                                                                          | Production project references of every package (emitting declarations), then the complete root test program.                                                                                                        |
| `yarn test`                   | Vitest projects `unit`, `types`, `performance`                                                                                                                  | Package unit tests and internal tests, compile-time `*.test-d.ts` assertions, language-service (completion, hover, diagnostics) tests, tooling guards, and the serial performance budgets.                          |
| `yarn lint`                   | `lint:core` (`eslint packages/core`), `lint:packages`, `lint:workspace`                                                                                         | Strict typescript-eslint, no `any`, file budgets (production fails above 600 lines, tests above 700), across packages, apps, examples, tests and tooling.                                                           |
| `yarn build`                  | `yarn workspaces foreach --all --topological --no-private run build`                                                                                            | `tsdown` bundles and declarations of every publishable package; unit and E2E suites consume these `dist` outputs.                                                                                                   |
| `yarn test:e2e`               | `build`, then Vitest projects `e2e` and `postgres-e2e` (`test:e2e:built`)                                                                                       | Built-export package and cross-package E2E, packed language-service checks, and PostgreSQL verticals on Testcontainers (Docker required; one schema per worker).                                                    |
| `yarn test:pack`              | `build`, then the 32 archive suites of `test:pack:built`                                                                                                        | Packed archives of every publishable package: exports, declarations, field and output builders, manifests, conformance and protection suites.                                                                       |
| `yarn test:coverage`          | Projects `unit`, `types`, `performance`, `coverage-e2e`, `coverage-postgres-e2e` with V8 coverage, `--maxWorkers=${ULTIMABASE_COVERAGE_WORKERS:-4}`             | Source-mode coverage with the repository thresholds; archive and compiled-artifact audits stay built-only.                                                                                                          |
| `yarn check:issues`           | `vitest run --project unit tooling/issues`                                                                                                                      | Backlog metadata (statuses, dependencies, milestones, merged targets) and the `CURRENT_PLAN.md` checkpoint and plan catalog. In the rebuild these guard the frozen archive, which must stay internally consistent.  |
| `yarn constraints`            | Yarn 4 built-in constraints                                                                                                                                     | Workspace manifest consistency. The repository commits no `yarn.config.cjs`, so no custom rule runs on either tree.                                                                                                 |
| `yarn website:validate`       | `@ultimabase/website` `validate:docs`: content generation, then Vitest project `website-content`                                                                | Public documentation pages: `sources` frontmatter pointing at existing files, ownership, navigation, prose rules, compiled landing samples.                                                                         |
| CI selection (`tooling/ci`)   | `.github/workflows/ci.yml`: `plan.ts` selects affected packages, dependants and integration suites; `run.ts repository`, `run.ts package`, `run.ts transversal` | The same commands, restricted to affected scopes on GitHub; documentation-only changes run the documentation and checkpoint guards plus `website:validate`. Manual dispatch runs complete validation with coverage. |

Focused commands used throughout the rebuild ([PROTOCOL.md](PROTOCOL.md)) are
subsets of the commands above: `yarn vitest run --project <project> <path>`,
`yarn eslint <path>`, `yarn prettier --check <path>`, `yarn tsc --build
packages/<pkg>` and `yarn tsc -p packages/<pkg>/tsconfig.test.json`.
`yarn vitest run --project unit tooling` additionally runs the documentation
guards (`tooling/documentation`), which validate links and examples in active
Markdown and the [architecture index](../current-architecture.md).

## Rebuild-specific evidence

The suites above are the primary oracle: they are unchanged, so a green run on
the rebuild proves the same observable contract as on the reference. The
rebuild adds evidence for what those suites cannot see.

| Evidence                                                                         | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Per-package `REBUILD.md` (Core: `packages/core/REBUILD-core-*.md`)               | Module mapping, production lines before and after, mapping of every ported internal test (no assertion removed), removed unreachable checks with their proof, casts, pre-existing failures on the untouched tree, and exact validation commands and results.                                                                                                                                                                   |
| Parity oracles recorded in those files                                           | Side-by-side runs of reference and rebuilt builds on the same inputs, beyond the tests. For example: Core query probe (303 cases), GraphQL printed SDL on 85 test applications, Typegen output (80 distinct outputs), create-app renders (196,608 project renders), validation-plugin and roles-plugin random differential runs (3,000 each), plugin-kit (57 cases), testing (33 cases), Password Auth contracts and bindings. |
| Emitted declarations                                                             | `dist/index.d.ts` byte-identical to the reference for most packages, or identical export lists and sorted declarations (Core: 1,118 names) where only private alias names or region order differ; each case is recorded in the package `REBUILD*.md`.                                                                                                                                                                          |
| `node tooling/rebuild/dx-audit.mjs <ref> <rebuild>` ([DX-AUDIT.md](DX-AUDIT.md)) | Editor-visible parity: declarations, export lists, export and member hovers, usage-site hovers, completions and diagnostics, reference against rebuild. Language-service tests did not catch private-alias hover changes; this audit does, and is part of the final validation.                                                                                                                                                |
| `node tooling/measure-rebuild.mjs [root]`                                        | Reproducible size measurement (Git-tracked files, non-blank lines) on either tree: production 114,742 → 104,141 lines, tests 127,477 on both.                                                                                                                                                                                                                                                                                  |
| [DIFFERENCES.md](DIFFERENCES.md)                                                 | Every known observable difference from the reference, each limited to untyped or forged inputs (`__proto__` keys, getters read twice, a `null` options object) and justified as a security or robustness defect of the reference.                                                                                                                                                                                              |
| Coordinator review                                                               | Each branch diff reviewed (files outside scope, added casts) before a `--no-ff` merge, then the merged `main` revalidated ([HANDOFF.md](HANDOFF.md)).                                                                                                                                                                                                                                                                          |

## Known load-sensitive tests

These failures were observed while several agents shared one machine. Their
qualification is the one recorded in [HANDOFF.md](HANDOFF.md) and the package
`REBUILD*.md` files. None is caused by a rebuild change as far as recorded;
the items marked "requalify" still need the calm-machine run below.

| Test                                                                                                                                                         | Symptom                                                                                                                      | Qualification                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/create-app/tests/e2e/create-app-packed.e2e.test.ts` › "writes a valid graph for each official plugin selected alone"                               | Exceeds its 120 s timeout under load.                                                                                        | Same failure on the reference under load (`yarn test:e2e` 409/410). On the rebuild it exceeded 120 s at load ≈ 60, even alone, and passed alone at load ≈ 26 (6/6, 58.7 s). A/B runs swapping only `packages/create-app/dist` passed on both trees (62–85 s). Time is dominated by `npm run build` of 16 generated projects whose files are byte-identical. **Requalify** on a calm machine, on both trees.                                                                                 |
| `packages/core/tests/e2e/core-archive-declarations.e2e.test.ts` (and the packed audits `core-field-builder`, `create-app-packed`, `typegen-generated-types`) | Timeouts (10 s on the "configured Schema definition factory" case; 20 s project default) while other suites compete for CPU. | Environmental: pass when rerun alone, on both trees.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `packages/typegen/tests/performance/hybrid-authoring.performance.test.ts`                                                                                    | Budget overruns or 180 s timeouts.                                                                                           | Reference `yarn validate:full` stopped at `yarn test` with this single failure (language-service initialization 511.7 ms against 510.3 ms, +0.3 %). Alternating reference and rebuilt `dist` in one tree failed on both builds under load; the current form emits the same 590,807-byte declaration on both. **Requalify** on a calm machine, on both trees.                                                                                                                                |
| `postgres-e2e` suites using the minimal example                                                                                                              | Intermittent `SchemaCompilationError: Schema ExampleArticle has not been compiled by an application`.                        | Pre-existing in the reference: 1 complete run in 8 on each tree. Cause proven by delay injection (3/3 on both trees): a Vitest 4.1 / Vite 8.1 module-runner race. Parallel `vi.importActual` calls in `loadMinimalExample` (`tests/e2e/rest-public-vertical-support.ts`) with `invalidate: !cached` evaluate `examples/minimal/src/schema.ts` twice in one worker; the test keeps one `ExampleArticle` copy while the application compiles the other. Tests left unchanged (protocol rule). |
| `postgres-e2e` timeout cascades                                                                                                                              | "Another UltimaBase application is active" after an earlier test times out.                                                  | The project has no explicit `testTimeout`, so Vitest's 5 s default applies; a slow test under load leaves its application active for the next one. Observed on both trees. Possible mitigations outside the rebuild scope: an explicit `testTimeout` for the project, or importing `schema.ts` before the other modules in `loadMinimalExample`.                                                                                                                                            |
| `create-app-api.postgres.e2e.test.ts`                                                                                                                        | `127.0.0.1:1337` already in use.                                                                                             | Environmental (another agent's server on the shared machine); passes when rerun alone.                                                                                                                                                                                                                                                                                                                                                                                                      |

## Recorded results so far (loaded machine)

Reference clone (`/Users/mrekinox/Desktop/claude-test/ub-ref`, 2026-10-07):

| Command                 | Result                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `yarn validate:full`    | Stopped at `yarn test`: 2,712/2,713 (only the Typegen hybrid-authoring budget failed). |
| `yarn test:e2e`         | 409/410 (only `create-app-packed`, 120 s timeout).                                     |
| `yarn test:pack`        | 32/32 files, 173/173 tests.                                                            |
| `yarn lint`             | Pass.                                                                                  |
| `yarn check:issues`     | Pass.                                                                                  |
| `yarn constraints`      | Pass.                                                                                  |
| `yarn website:validate` | 17 files, 66/66.                                                                       |
| `yarn test:coverage`    | Not executed.                                                                          |

Rebuild, last full record (Core integration pass, before the documentation
archive; see `packages/core/REBUILD-core-integration.md`):

| Command                                          | Result                                  |
| ------------------------------------------------ | --------------------------------------- |
| `yarn build`                                     | Pass.                                   |
| `yarn vitest run --project unit --project types` | 558 files, 2,709 tests, no type errors. |
| `yarn vitest run --project performance`          | 3 files, 4 tests.                       |
| `yarn vitest run --project e2e`                  | 47 files, 219 tests.                    |
| `yarn vitest run --project postgres-e2e`         | 55 files, 191 tests.                    |
| `yarn vitest run --project website-content`      | 17 files, 66 tests.                     |
| `yarn test:pack:built`                           | 32 files, 173 tests.                    |
| `yarn test:coverage`                             | Not executed.                           |

These partial records do not replace the final run below.

## Final calm-machine results (to be filled by the coordinator)

Run on an otherwise idle machine, on both trees, with Docker available:

```sh
yarn install --immutable && yarn build
yarn validate:full
yarn test:e2e
yarn test:pack
node tooling/rebuild/dx-audit.mjs <reference-root> <rebuild-root>
node tooling/measure-rebuild.mjs <root>
```

<!-- final-validation:start -->

Calm-machine run, 2026-10-08, one tree at a time on the same 12-core machine
(load average 2.6 at the start, no other job running): reference clone
`ub-ref` at `0ae7767f` (00:03–00:27), then the rebuild `main` at `f6b0f5a`
(00:27–00:49). Both trees were clean before and after (`git status` empty).

| Command                                         | Reference (`ub-ref`)                                                                                  | Rebuild (`main` at `f6b0f5a`)                                                                         | Notes                                                                                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn validate:full` (exit code)                | 0 (18 min 30 s)                                                                                       | 0 (17 min 10 s)                                                                                       | Runs every row down to `website:validate`.                                                                                                                                                                     |
| `yarn format:check`                             | pass                                                                                                  | pass                                                                                                  |                                                                                                                                                                                                                |
| `yarn typecheck`                                | pass                                                                                                  | pass                                                                                                  |                                                                                                                                                                                                                |
| `yarn test` (unit, types, performance)          | 561 files, 2,713 tests passed                                                                         | 561 files, 2,713 tests passed                                                                         | Includes the Typegen `hybrid-authoring` performance budgets: passed on both.                                                                                                                                   |
| `yarn lint` (core / packages / workspace)       | 0 errors; 53 / 29 / 1 warnings                                                                        | 0 errors; 54 / 18 / 1 warnings                                                                        | All warnings are `max-lines` (400-line warning; the 600-line budget holds).                                                                                                                                    |
| `yarn build` (incl. publint / attw)             | pass                                                                                                  | pass                                                                                                  |                                                                                                                                                                                                                |
| `yarn test:coverage`                            | 640 files, 2,977 tests passed; statements 91.26 %, branches 84.75 %, functions 96.58 %, lines 91.82 % | 640 files, 2,977 tests passed; statements 92.31 %, branches 86.11 %, functions 97.33 %, lines 92.90 % | Same tests over less code. Covered statements 23,772/26,047 → 21,096/22,853.                                                                                                                                   |
| `yarn check:issues`                             | 2 files, 22 tests passed                                                                              | 2 files, 22 tests passed                                                                              | Archive kept in place.                                                                                                                                                                                         |
| `yarn constraints`                              | pass                                                                                                  | pass                                                                                                  |                                                                                                                                                                                                                |
| `yarn website:validate`                         | 17 files, 66 tests passed                                                                             | 17 files, 66 tests passed                                                                             |                                                                                                                                                                                                                |
| `yarn test:e2e` (e2e + postgres-e2e)            | 102 files, 410 tests passed                                                                           | 102 files, 410 tests passed                                                                           |                                                                                                                                                                                                                |
| `yarn test:pack`                                | 32 files, 173 tests passed                                                                            | 32 files, 173 tests passed                                                                            |                                                                                                                                                                                                                |
| `create-app-packed`                             | passed inside `yarn test:e2e`                                                                         | passed inside `yarn test:e2e`                                                                         | Not run alone: it did not fail on a calm machine.                                                                                                                                                              |
| postgres-e2e, 3 extra runs                      | 191/191, **1 failed + 3 skipped (2 files)**, 191/191                                                  | 191/191, 191/191, 191/191                                                                             | The reference failure is the pre-existing Vitest module-runner race (`Schema ExampleArticle has not been compiled by an application`, `graphql-cross-transport-parity` and `relation-filter-public-vertical`). |
| `dx-audit.mjs` (differences)                    | n/a                                                                                                   | 2 of 35,775 records, none editor-visible                                                              | Unused import names in the access-plugin and roles-plugin declaration bundles.                                                                                                                                 |
| `measure-rebuild.mjs` (production / test lines) | 114,742 (731 files) / 127,477                                                                         | 104,141 (622 files) / 127,477                                                                         | −9.2 % production.                                                                                                                                                                                             |

<!-- final-validation:end -->
