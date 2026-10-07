# 5501: Consolidate schema command input contracts

- Status: completed
- Milestone: 55
- Package: `@ultimabase/core`
- Depends on: 1301
- ADR: ADR-0132, ADR-0149, ADR-0162, ADR-0164

## Goal

Represent schema-command wrapper shapes once and share collection-array
validation without changing any accepted input, diagnostic, or execution path.

## Acceptance criteria

- [x] One private contract table declares required and optional wrapper keys.
- [x] Commands and batch items reuse the exact matching contract.
- [x] One private assertion owns collection-array diagnostics.
- [x] Unknown keys, missing keys, malformed arrays, and singular targets preserve
      exact diagnostic messages and evaluation order.
- [x] Batch operation construction, selection, inclusion, and atomicity remain unchanged.
- [x] No public export, command, type, input form, or behavior changes.
- [x] Production TypeScript removes more lines than it adds.
- [x] Focused and repository-wide validation pass.
- [x] Documentation impact is recorded.

## Out of scope

- Changing schema-command types, names, projections, or transport normalization.
- Changing unique targeting, empty-batch behavior, or mutation execution.
- Generalizing the validator outside this private command boundary.

## Documentation impact

Internal engineering documentation. The milestone, issue, invariants, and line
audit are recorded here and in `CURRENT_PLAN.md`. No package README, public
website page, or ADR changes because command names, accepted inputs, diagnostics,
result projections, batch semantics, and public types remain unchanged.

## Outcome

`commandKeyContracts` now stores the required and optional keys for each exact
wrapper family. Create and update collection wrappers deliberately share the
same data-plus-projection contract, while singular targets and batch-item
contracts remain distinct. The validator iterates the retained arrays in their
original order, preserving unknown-key precedence and required-key diagnostics.

`assertCommandArray()` replaces four copied runtime checks for create, update,
upsert, and delete collections. It retains the exact command-specific path in
each existing error. Operation construction, unique targeting, selection,
inclusion, itemization, and atomic batch execution are untouched.

## Quantitative audit

Production TypeScript adds 42 lines and removes 64, a net reduction of 22.
`schema-command-execution.ts` falls from 559 to 537 lines. Tests add 6 lines to
cover the previously implicit updateMany and deleteMany malformed-array paths.
No public declaration or generated file changes.

## Validation

- Focused schema-command validation: 3 files, 23 tests
- `yarn workspace @ultimabase/core test`: 266 files, 1,354 tests
- `yarn typecheck`
- `yarn test`: 545 files, 2,582 tests, no type errors
- `yarn lint`: 0 errors; 49 Core, 26 package, and 2 workspace pre-existing
  file-budget warnings
- `yarn build`: every package passed build, API checks, and package linting
