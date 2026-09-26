# 4501: Consolidate Runtime mutation boundary decoding

- Status: completed
- Milestone: 45
- Packages: `@ultimabase/core`, `@ultimabase/access-plugin`, `@ultimabase/hooks-plugin`
- Depends on: 4403
- ADR: ADR-0245, ADR-0259, ADR-0272

## Goal

Make Core the single runtime-validating owner of prepared mutation records and
materialization outcomes, then remove the equivalent official-engine bridges.

## Acceptance criteria

- [x] Core exposes one focused prepared-target decoder used internally and by official engines.
- [x] Access reuses Core's existing mutation-outcome boundary instead of maintaining an upsert decoder.
- [x] Hooks and Access no longer duplicate prepared-record validation.
- [x] Runtime order, values, errors, and capabilities remain equivalent.
- [x] The production diff removes more lines than it adds.
- [x] Focused and repository-wide validation pass.
- [x] Documentation impact is recorded.

## Out of scope

- Changing adapter contracts or prepared-operation ownership.
- Merging native CRUD and plugin schema-mutation execution.
- Generalizing another unproven boundary or adding configurable decoding.

## Outcome

Core now exports `readRuntimePreparedMutationRecords()` as the single validated
boundary for erased prepared targets and target collections. Core's database
execution, Access, and Hooks all use it. Access also delegates complete upsert
outcome validation to the existing Core behavior boundary instead of decoding
materializations itself.

Native CRUD and plugin schema mutations remain separate. Runtime order,
authority, transactions, adapter inputs, Access decisions, Hook inputs, and
all supported capabilities are unchanged. Malformed internal values still
fail with `TypeError`; their diagnostic now consistently identifies the Core
Runtime boundary.

## Quantitative audit

The complete issue changes 16 files with 331 additions and 222 deletions (net
+109). Production TypeScript changes contain 155 additions and 196 deletions
(net -41). Tests add 43 lines; engineering and public documentation, issue
tracking, and the current plan account for the remaining 133 additions and 26
deletions.

Four separate validation traversals are replaced by one target-collection
check plus Core's existing outcome validator. The four forced casts in the
targeted files are unchanged: they correlate already-validated records with
the adapter's generic operation schema and are not duplicate decoders.

## Validation

- `yarn typecheck`
- `yarn test`: 540 files, 2,572 tests, no type errors
- `yarn lint`: 0 errors; 50 Core, 28 package, and 2 workspace pre-existing
  file-budget warnings
- `yarn build`: every package passed build, API checks, and package linting
- Core, Access, and Hooks package suites: 293 files, 1,464 tests
- `yarn website:validate`: 17 files, 66 tests

## Documentation impact

Both. The Core README and Runtime engineering guide document the shared
decoder, while the public plugin-author Runtime guide explains when to use it
and Core's complete mutation-outcome boundary.
