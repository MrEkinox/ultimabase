# 3111: Reconcile the affected public website journeys

- Status: planned
- Milestone: 31
- Packages: apps/website; affected package READMEs and examples
- Depends on: 3110
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Audit the public documentation site end to end after the delivered simplifications, including retained candidates.

## Acceptance criteria

- [ ] Review apps/website/content/docs using documentation-ownership.json, page sources and the final decision/removal ledger. Include Core/schema, plugin authoring, Hooks, Access, Typegen, PostgreSQL, testing and installation journeys.
- [ ] Verify public examples and explanations match delivered code: no removed imports/options, imaginary replacement API, unsupported migration implementation or future registry/package presented as available.
- [ ] Check relevant REST/GraphQL and authentication/Soft Delete examples still describe the preserved contract. Their behavior is not new scope for this issue.
- [ ] Maintain a linear setup -> declarations -> usage -> lifecycle/testing -> limits journey. Preserve pre-release/unpublished-package guidance and manual/local installation routes.
- [ ] Record pages reviewed, edits and justified no-change outcomes. Earlier implementation issues must already have updated affected public pages; repair any missed synchronization with a documented audit finding.
- [ ] Verify TypeScript examples against actual built exports/Typegen and executable database/transport flows where applicable. Keep website prose descriptive, never Runtime truth.

## Tests

- [ ] Run yarn website:validate, website:typecheck, website:lint and website:build, plus affected browser/accessibility/theme/viewport checks when rendered content changes.
- [ ] Run literal-example validation and repository metadata/link/format checks; document any existing unchanged page coverage reused.

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

Landing redesign, new product documentation for unimplemented capabilities, deployment, or postponing earlier required docs to this issue.

## Handoff

Not started. The preparation request does not authorize implementation.
