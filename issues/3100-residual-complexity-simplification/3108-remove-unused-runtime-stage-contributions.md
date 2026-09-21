# 3108: Remove unused Runtime stage contributions if approved

- Status: planned
- Milestone: 31
- Packages: @ultimabase/core; affected public conformance/docs
- Depends on: 3107
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)
- Accepted decision: [ADR-0264](../../docs/adr/0264-remove-unused-runtime-stage-contributions.md), accepted 2026-09-21

## Goal

Remove only the approved unused normalization/commit stage contribution API.

## Acceptance criteria

- [ ] Require the accepted RC-04 decision. Delete the exact factory/types, private implementation registry, collection/assembly branches and exports identified by 3107.
- [ ] Keep normal Runtime normalization and transaction commit, Hook beforeCommit/afterCommit, callback ownership and rollback behavior.
- [ ] Keep used runtimeInterceptorCapability/provideRuntimeInterceptor and preparedOperation contributions, including ACL enforcement. No neutral product stage or renamed substitute is introduced.
- [ ] Remove exclusive API self-tests while retaining invariant coverage and adding focused rejection/public-export regressions for the approved removal.
- [ ] Update the public plugin-authoring website, relevant README/architecture contracts and examples in the same change. Record the exact public delta and removal history.

## Tests

- [ ] Run Runtime order, transactions, callback ownership, ACL, optional-product cost and source/built/packed public contract tests.
- [ ] Run the implementation gates, full coverage for the cross-cutting execution change and affected PostgreSQL/transport conformance.

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

Removing all interceptors, changing commit semantics or eliminating retained internal performance measurements.

## Handoff

Not started. The exact decision was accepted in 3107; follow issue dependencies
and the per-issue validation/audit/commit gate.
