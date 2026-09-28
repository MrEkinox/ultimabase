# 6302: Accept the configured source-typed application ADR

- Status: planned
- Milestone: 63
- Packages: architecture documentation
- Depends on: 6301
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Turn the approved DX target and successful proof into one durable architecture
decision that precisely supersedes the generated-authoring and explicit
application-selection rules being removed.

## Acceptance criteria

- [ ] ADR-0279 records `UltimaBase.use()`, `App.Schema.define()`, explicit schema registration, direct class execution, source-typed plugin surfaces, and the retained Typegen cross-schema graph as one coherent decision.
- [ ] The ADR names every superseded clause in ADRs 0173, 0184, 0187, 0192, 0197, 0198, 0201, 0248, 0254, 0258, 0262, 0265, 0267, 0273, 0276, and 0277 without rewriting history.
- [ ] Privilege timing, flat plugin graphs, exact instances, deterministic order, lifecycle, request isolation, Master authority, immutable classes, and JavaScript behavior remain explicit invariants.
- [ ] The decision explains how pure compilation and package-specialized schemas use source inference while literal relationship names resolve only through the retained Typegen graph, without late class mutation.
- [ ] The current architecture index, root architecture, and ADR index identify the new current contract.
- [ ] The measured issue-6301 limits are part of the decision evidence.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Architecture link and current-status guards.
- [ ] Issue metadata validation.
- [ ] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [ ] Record the starting revision and prove issue 6301 is completed, committed, budget-compliant, and free of unresolved findings.
- [ ] Audit the complete decision diff against every named superseded clause, proof result, retained capability, security/lifecycle invariant, current architecture index, and rejected alternate path.
- [ ] Record each finding and correction in the handoff; repeat the entire decision audit after every edit until no contradiction, stale current ADR, or unapproved behavior remains.
- [ ] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; documentation-only scope does not waive `yarn validate:full`.
- [ ] Complete every acceptance/test checkbox and exactly one Documentation impact classification before setting `completed`.
- [ ] Create one dedicated local commit only after the green audit, inspect its complete diff and line counts, and amend/re-audit if needed. Do not push.

## Out of scope

- Production implementation.
- Compatibility aliases for rejected authoring forms.
- Weakening a locked evidence budget without explicit user approval.
