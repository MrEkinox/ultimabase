# access-plugin rebuild

Work in progress. Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`.

## Checkpoint 1

- Authoring: `normalization.ts`, `field-declarations.ts` and `declarations.ts`
  merged into `authoring/declarations.ts`; `plan-contracts.ts`,
  `plan-mutable.ts`, `plan-finalization.ts` merged into `authoring/plan.ts`
  (contracts) and `authoring/compiler.ts` (compilation).
- Runtime: one `AccessScope` replaces positional `(runtime, request, plan,
  schemaPlan)` threading; `schema-mutation-access.ts`, `field-paths.ts` and
  `authoring/filter.ts` merged into the runtime modules that use them.
- Baseline (untouched tree): every focused suite passed (see final section).
- Package unit/types suites pass on this checkpoint; e2e not yet rerun.
