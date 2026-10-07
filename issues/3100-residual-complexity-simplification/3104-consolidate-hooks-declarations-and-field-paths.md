# 3104: Consolidate Hooks declarations and field-path types

- Status: completed
- Milestone: 31
- Packages: @ultimabase/hooks-plugin; existing @ultimabase/core public types
- Depends on: 3103
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Remove the unused Hooks side registry and reuse Core's already public field-path types.

## Acceptance criteria

- [x] Reconfirm and remove the unused schemaHookDeclarations WeakMap and declareSchemaHooks/getSchemaHookDeclarations circuit, preserving the live option/provider declarations.
- [x] Compare Hooks SchemaFieldPath and FieldAtPath with Core's public types. Reexport or alias existing Core types through the current Hooks root names without adding a new public abstraction.
- [x] Check the Hooks resolver's only usages and the schema.fields versus schema.persistedFields difference. Remove an unused private resolver; never replace a live resolver based on superficial similarity.
- [x] Preserve type inference, valid and invalid nested paths, depth limits, autocomplete and hover behavior against source and compiled package roots.
- [x] Keep lifecycle order, field resolution, events, transactions, rollback and callback attribution unchanged.
- [x] Record actual file/production reductions separately from the initial 143-line candidate. Review the website Hooks page and explain any unchanged public documentation.

## Tests

- [x] Run focused Hooks runtime and field-path type/language-service checks against source and built exports; retain meaningful path validation scenarios.
- [x] Run the implementation gates, relevant Hooks built/PostgreSQL conformance and retained-coverage comparison.

## Audit and commit gate

- [x] Audit the complete diff against retained behavior, security, ownership,
      public types/exports, obsolete paths, tests, documentation and scope.
- [x] Correct every finding, rerun affected checks and repeat the complete audit
      until no finding remains. Architecture questions or blocked verification
      stop the issue for user direction; they are not bypassed by more retries.
- [x] Record audit iterations, validation evidence and exactly one Documentation
      impact classification in the handoff; update inventory/removal history.
- [x] Create the dedicated local commit only after the green audit, report exact
      added/deleted/net line counts and verify scope before the next issue.
      No push is authorized.

## Out of scope

A shared generic path framework, new Core exports or weakening field and Hook validation.

## Handoff

Completed after `4759aef3`. Type/editor parity, production-path scenarios,
full coverage and built/PostgreSQL conformance pass; final audit is green.

### Implementation and audit evidence

Removed the unused schema Hook WeakMap, writer and reader (21 lines) and the
143-line duplicate field-path implementation. Hooks now reexports the two
existing Core types under the same root names. Both complete type sections,
including depth budget and JSDoc, were text-identical before consolidation.
All ten remaining declarations in declarations.ts are unchanged. Production
net: -164 lines; no new runtime path or Core source change.

The removed private resolver only had its own three tests; it selected
schema.fields, whereas Core's private resolver selects persistedFields. No
live resolver was substituted. Useful scenarios now exercise the real Hook
contribution plan: nested listed objects, dotted names, system fields, exact
identity, and malformed/missing/scalar-traversing targets. Source and compiled
language-service checks cover root imports, list/required field identity,
plugin kinds, widened schemas, invalid/empty paths, depth 16/17, nested
completion and both public type hovers. They passed before the refactor.

Audit iteration 1 corrected test-only issues: the source fixture must use the
same public Core dependency as Hooks to preserve nominal identities, and the
readonly expected completion list must be copied for Vitest's mutable argument.
Validation also exposed that incremental tsc emits into dist and can replace
a bundled root with references to absent unbundled files. Restore canonical
builds before consumer checks and keep typecheck/build/tests ordered; this is
a validation artifact issue, not authorization for a tooling redesign.
After restoring build -> typecheck -> canonical build order, typecheck and all
2,536 root source/type/performance tests pass without type errors. The 1,726
export names remain identical. Only Hooks' declaration file changes: the two
public type copies and six private supporting aliases disappear in favor of
Core imports; 115 other named declarations are text-identical (some reorder).
All 22 other full declaration hashes match 3101; total bytes fall by 2,244.
Final validation: `yarn typecheck`, `yarn build` (including package publication
checks), `yarn test` (2,536 tests / 533 files), `yarn test:coverage` (2,780 tests /
608 files), `yarn lint`, and `yarn constraints` pass. Targeted built and
PostgreSQL Hooks suites plus optional-engine/public-API suites pass 38 tests in
five files, including the compiled language-service check.

Coverage comparison against 3101 maps all 690 unchanged instrumented files
and nine edited files without a retained-location regression. The three missing
files are exactly the removed Core/Access/Hooks private modules. Covered
unmapped declarations are deleted function initializers and empty registry
creation, not lost live branches. The removed Hooks resolver self-test scenarios
now exercise live contribution validation. Aggregate coverage is 90.30% statements,
83.62% branches, 95.81% functions and 90.92% lines. The small aggregate branch
percentage decrease reflects removal of covered self-test-only code; retained
branches keep their coverage. No threshold or exclusion changes.

Audit iteration 2 reviews the final complete diff: ten retained declaration
bodies are identical, no caller/export is orphaned in Hooks, runtime ownership,
lifecycle and error paths are unchanged, both editor roots pass, public exports
remain stable, and obsolete self-tests have useful current-path replacements.
Documentation, metadata, formatting and diff checks pass. No unresolved finding
within 3104. A newly noticed pre-existing Core resolver orphan is recorded in
the inventory for an explicit scope decision; it is not silently added here.

The Hooks README and website Hooks page were reviewed. No documented lifecycle,
provider syntax, field resolution, event, transaction or attribution behavior
changes. No file-size baseline applies to the edited production files.

Documentation impact: internal engineering documentation. Issue handoff,
inventory, plan and root history are updated. Public README and website Hooks
contracts remain accurate because the same two type names retain identical
inference/JSDoc, while only private unused runtime machinery disappears.

Production: 126,659 -> 126,495 lines; Hooks reduction 164, Core unchanged.
Test/support lines increase by 89. Total declaration bytes fall by 2,244.
No implementation exceeds the original acceptance criteria. Exact complete
commit counts are reported after the dedicated local commit; no push.
