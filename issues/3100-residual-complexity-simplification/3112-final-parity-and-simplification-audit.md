# 3112: Run the final parity and simplification audit

- Status: planned
- Milestone: 31
- Packages: all affected packages, website and engineering records
- Depends on: 3111
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Close milestone 31 only after every retained contract, approved removal and required validation is reconciled against its baseline.

## Acceptance criteria

- [ ] Verify each delivered issue has its green audit loop, accurate terminal status, dedicated commit and exact line-count handoff. Superseded conditional removals must name the accepted retention decision and its audited commit; they need no empty implementation commit.
- [ ] Reconcile all inherited B/P/C contracts and the milestone 31 delta ledger. Every observable difference maps to an exact approved decision; no retained product, plugin, authority, lifecycle or public type regression.
- [ ] Audit source/built/packed exports, dependencies, removed implementation branches, generated artifacts, examples and website pages. No compatibility wrapper, speculative substitute or weakened validation remains.
- [ ] Compare retained statement/function/branch coverage and scenarios with 3101. Do not hide losses through deleted tests, lower thresholds, exclusions or a better aggregate percentage.
- [ ] Measure production/test/tooling/doc deltas separately, public exports/declarations, representations/registries, representative change fan-out and existing runtime performance/memory scenarios under comparable conditions.
- [ ] Run the complete required local verification; report limits honestly. CI timing requires a separately authorized push and matching run conditions; no CI improvement is claimed without new evidence.
- [ ] Record the final report and root removal history, close the milestone and archive the plan with a final resume point of none.
- [ ] Create the final dedicated commit, report its exact added/deleted/net counts and stop expressly after 3112. No next milestone, paused feature, push or deployment is authorized.

## Tests

- [ ] Run yarn typecheck, yarn test, yarn lint, yarn build, yarn constraints, full coverage and full built/packed/PostgreSQL suites; verify source/packed API parity and boundaries.
- [ ] Run website content/type/lint/build and relevant browser/example gates, metadata, links, formatting and git diff --check; repeat only where changes or findings require it.

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

New simplification scope, forcing positive performance numbers, marking blocked checks green or continuing beyond this milestone.

## Handoff

Not started. The preparation request does not authorize implementation.
