# 3103: Remove the unused Access declaration circuit

- Status: planned
- Milestone: 31
- Packages: @ultimabase/access-plugin
- Depends on: 3102
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Remove the empty side registry and unused normalization path without changing the current Access option/provider engine.

## Acceptance criteria

- [ ] Reconfirm the unused schemaAccessDeclarations WeakMap, declareSchemaAccess/getSchemaAccessDeclarations circuit and normalizeRelationFieldAccessDeclarations. Remove only the unreachable circuit and exclusive dependencies.
- [ ] Check splitFieldAccessOptions separately: it has a self-test, so removal requires proving its semantics are already represented in the live option path. Preserve any retained regression scenario.
- [ ] Preserve current direct Access declarations, compatible provider composition, relation policies, operation/item/field enforcement, callback ownership, Master bypass and monotonic output restrictions.
- [ ] Verify source/packed exports and inference remain equivalent. Core and Access must not acquire Soft Delete or authentication vocabulary.
- [ ] Record exact removals and retained test coverage. Review the website Access page; record why no public edit is needed if its contract remains accurate.

## Tests

- [ ] Run Access authoring, field/relation, provider, security and type tests plus affected built/PostgreSQL conformance.
- [ ] Run the plan's implementation gates and retained-coverage comparison.

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

New permissions, removal of real rule normalization, changing Access public syntax or cross-plugin coupling.

## Handoff

Not started. The preparation request does not authorize implementation.
