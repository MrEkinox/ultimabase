# 3106: Simplify canonical schema compilation

- Status: planned
- Milestone: 31
- Packages: @ultimabase/core; real downstream consumers only where required by 3105
- Depends on: 3105
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Implement only the accepted 3105 design and remove the superseded compiler plumbing in the same bounded change.

## Acceptance criteria

- [ ] Start only after the exact 3105 design is accepted. Replace the approved round trip with the smallest direct internal compilation path; do not retain a second live compiler, runtime switch or compatibility registry.
- [ ] Preserve contribution ownership, nominal field identity, normalized options, selector target freezing/order, duplicate rejection, Core system fields, relationship integrity and atomic publication before infrastructure effects.
- [ ] Provide existing command/surface consumers their required facts without making executable declarations public or changing the canonical graph's ownership.
- [ ] Remove obsolete IR/session/encoder/decoder contracts and validation branches only as authorized, after mapping every retained invariant to its final check and regression test.
- [ ] Verify plugin schemas, contextual fields, additive Soft Delete patches, Access/Hooks/Validation options, operations, mutations, Typegen output and both transports preserve behavior and errors.
- [ ] Review/update schema examples, authoritative engineering docs and any affected public website pages in this issue. Stop for any public difference outside the accepted decision.
- [ ] Record final representations, registries, source lines and measured compile/startup behavior; a smaller file count alone is not success.

## Tests

- [ ] Run full source/type/security/conformance and coverage validation; compare retained locations and generated declarations/fingerprints against the baseline.
- [ ] Run full built/packed/PostgreSQL validation, representative direct/REST/GraphQL flows, constraints and affected website checks, alongside all implementation gates.

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

Unapproved plugin/kernel API changes, new generic compiler extensibility or unchecked trusted-input shortcuts.

## Handoff

Not started. The preparation request does not authorize implementation.
