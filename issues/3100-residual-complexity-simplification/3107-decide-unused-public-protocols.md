# 3107: Decide the three unused public protocol candidates

- Status: planned
- Milestone: 31
- Packages: architecture documentation; @ultimabase/core, @ultimabase/typegen, @ultimabase/postgres-plugin, @ultimabase/testing
- Depends on: 3106
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Resolve three independent public-contract decisions before any conditional removal, using current consumers and required invariants.

## Acceptance criteria

- [ ] RC-04: inventory runtimePipelineStage and its normalization/commit-only contribution path. Distinguish it from runtimeInterceptorCapability/provideRuntimeInterceptor and preparedOperation, which ACL actually uses.
- [ ] RC-05: inventory TypegenEmitterCapability/typegenEmitterCapability, its provider and absence of a reader. Explicitly document loss of single-provider conflict/inspection/requirement semantics if removed; generation and deterministic output must remain.
- [ ] RC-06: inventory the exact migration-exclusive exports, privileges, snapshot fields, planning helpers, PostgreSQL contribution/preparation tokens and testing helpers. Classify private-storage/physical-schema/provenance consumers separately.
- [ ] Resolve FakeAdapterMigrationHistory and other real engineering usage explicitly. Preserve any retained conformance/security need; do not dismiss it merely because it is a test tool. No used API disappears without a specific accepted exception.
- [ ] For each candidate separately, present exact old/new behavior, affected public contracts/site pages, smallest deletion scope, preserved invariants and any alternative. Stop for the user's decision before accepting ADRs.
- [ ] Record approved removal or retention per RC ID and cross-reference C-035, C-039, C-023/C-026 and P-016 from the final milestone 30 matrix. Broad old R-001–R-010 approval is insufficient.
- [ ] Keep 3108–3110 conditional until their own decisions are resolved. For retained candidates, record the accepted reason and mark their removal issue superseded, not completed. Reconcile affected future migration backlog dependencies without implementing that feature.
- [ ] Do not replace removed powers with a renamed public marker, callback registry, private official-plugin path or new testing API.

## Tests

- [ ] Audit repository and packed public consumers, privilege/conformance coverage, Typegen initialization and PostgreSQL/private-storage boundaries for each candidate.
- [ ] Validate new ADRs and scope consistency, links, metadata, formatting and git diff --check.

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

Production removals, treating all three decisions as one implicit approval, or eliminating used adapter/provenance infrastructure.

## Handoff

Not started. The preparation request does not authorize implementation.
