# 3104: Consolidate Hooks declarations and field-path types

- Status: planned
- Milestone: 31
- Packages: @ultimabase/hooks-plugin; existing @ultimabase/core public types
- Depends on: 3103
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Remove the unused Hooks side registry and reuse Core's already public field-path types.

## Acceptance criteria

- [ ] Reconfirm and remove the unused schemaHookDeclarations WeakMap and declareSchemaHooks/getSchemaHookDeclarations circuit, preserving the live option/provider declarations.
- [ ] Compare Hooks SchemaFieldPath and FieldAtPath with Core's public types. Reexport or alias existing Core types through the current Hooks root names without adding a new public abstraction.
- [ ] Check the Hooks resolver's only usages and the schema.fields versus schema.persistedFields difference. Remove an unused private resolver; never replace a live resolver based on superficial similarity.
- [ ] Preserve type inference, valid and invalid nested paths, depth limits, autocomplete and hover behavior against source and compiled package roots.
- [ ] Keep lifecycle order, field resolution, events, transactions, rollback and callback attribution unchanged.
- [ ] Record actual file/production reductions separately from the initial 143-line candidate. Review the website Hooks page and explain any unchanged public documentation.

## Tests

- [ ] Run focused Hooks runtime and field-path type/language-service checks against source and built exports; retain meaningful path validation scenarios.
- [ ] Run the implementation gates, relevant Hooks built/PostgreSQL conformance and retained-coverage comparison.

## Audit and commit gate

- [ ] Audit the complete diff against retained behavior, security, ownership,
      public types/exports, obsolete paths, tests, documentation and scope.
- [ ] Correct every finding, rerun affected checks and repeat the complete audit
      until no finding remains. Architecture questions or blocked verification
      stop the issue for user direction; they are not bypassed by more retries.
- [ ] Record audit iterations, validation evidence and exactly one Documentation
      impact classification in the handoff; update inventory/removal history.
- [ ] Create the dedicated local commit only after the green audit, report exact
      added/deleted/net line counts and verify scope before the next issue.
      No push is authorized.

## Out of scope

A shared generic path framework, new Core exports or weakening field and Hook validation.

## Handoff

Not started. The preparation request does not authorize implementation.
