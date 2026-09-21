# 3112: Run the final parity and simplification audit

- Status: completed
- Milestone: 31
- Packages: all affected packages, website and engineering records
- Depends on: 3111
- Execution contract: [milestone 31 plan](../../docs/plans/2026-09-21-residual-complexity-simplification.md)
- Evidence: [candidate inventory](../../docs/plans/2026-09-21-residual-complexity-inventory.md)

## Goal

Close milestone 31 only after every retained contract, approved removal and required validation is reconciled against its baseline.

## Acceptance criteria

- [x] Verify each delivered issue has its green audit loop, accurate terminal status, dedicated commit and exact line-count handoff. Superseded conditional removals must name the accepted retention decision and its audited commit; they need no empty implementation commit.
- [x] Reconcile all inherited B/P/C contracts and the milestone 31 delta ledger. Every observable difference maps to an exact approved decision; no retained product, plugin, authority, lifecycle or public type regression.
- [x] Audit source/built/packed exports, dependencies, removed implementation branches, generated artifacts, examples and website pages. No compatibility wrapper, speculative substitute or weakened validation remains.
- [x] Compare retained statement/function/branch coverage and scenarios with 3101. Do not hide losses through deleted tests, lower thresholds, exclusions or a better aggregate percentage.
- [x] Measure production/test/tooling/doc deltas separately, public exports/declarations, representations/registries, representative change fan-out and existing runtime performance/memory scenarios under comparable conditions.
- [x] Run the complete required local verification; report limits honestly. CI timing requires a separately authorized push and matching run conditions; no CI improvement is claimed without new evidence.
- [x] Record the final report and root removal history, close the milestone and archive the plan with a final resume point of none.
- [x] Create the final dedicated commit, report its exact added/deleted/net counts and stop expressly after 3112. No next milestone, paused feature, push or deployment is authorized.

## Tests

- [x] Run yarn typecheck, yarn test, yarn lint, yarn build, yarn constraints, full coverage and full built/packed/PostgreSQL suites; verify source/packed API parity and boundaries.
- [x] Run website content/type/lint/build and relevant browser/example gates, metadata, links, formatting and git diff --check; repeat only where changes or findings require it.

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

New simplification scope, forcing positive performance numbers, marking blocked checks green or continuing beyond this milestone.

## Handoff

Documentation impact: internal engineering documentation. The final report,
root removal history, milestone, roadmap and execution records close the work.
No public API, website prose or example changes in this issue; the site reviewed
and corrected in 3111 remains accurate. No package README needs another edit.

### Audit loop

| Pass | Evidence / finding                                                                                                                                                                      | Correction and validation                                                                                                                                                                                                                                          | Remaining          |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| 1    | Reconcile all 74 inherited IDs, the six resolved candidates and exact accepted exceptions; compare declarations, consumers, generated files, dependency/configuration and coverage maps | All 33 retained named protocols exist, six exact historical/approved tokens are absent; 21 exports removed and none added; no retained comparable coverage loss. Reconcile rewritten compiler scenarios with ADR-0263 and 3106 rather than relying on percentages. | No product finding |
| 2    | Audit measurement classification and closure records; root plan/roadmap still describe active work                                                                                      | Use the unchanged measurement definitions, including source test-support files; archive the execution log, close issue/milestone status and set resume point to none. Validate records, links, content and formatting, then review the complete diff.              | None               |

The final baseline-to-result audit is in the
[report](../../docs/plans/2026-09-21-milestone-31-final-audit.md). It includes all
contract IDs and accepted public changes, exact package/declaration totals,
retained scenario reconciliation, local performance/memory limits, issue
commits and validation provenance. Production is 123,468 lines (-3,625),
Core 65,584 (-3,196), tests/support 130,601 (-219), tooling 2,119 (unchanged).
Exactly 21 approved export names retire; 18 of 23 bundled declaration files
remain byte-identical to baseline. There is no new public substitute.

### Verification and reused evidence

Fresh 3112 artifacts are at `/tmp/ultimabase-m31-3112`. Git confirms package
source/tests/tooling/configuration have no change after 3110; final declaration
hashes match its canonical build. Reuse its complete successful package gates:
forced root typecheck with identical projects/settings, canonical build,
2,533 source/type/performance tests, 2,777 full-coverage tests, 384
built/packed/PostgreSQL tests, root lint and constraints. This is explicitly
reused exact-code evidence, not a claim those suites ran again in 3112.

3111 provides website type/lint/build, 66 content checks, all 59 browser tests,
additional corrected-page checks and executable literal examples. Fresh 3112
verification covers metadata/active contracts, website content, relative links,
formatting/diff checks (14 metadata/contract tests, 66 content tests and 111
resolved relative links), all contract identifiers, current public snapshots,
coverage reconciliation and the unchanged size/runtime measurement commands.
The coverage comparison verifies 652 identical maps and 2,069 retained mapped
locations in 21 changed files; the moved provenance validator is separately
identical. Compiler invariants and exclusive removed bodies are accounted for
in the report. Thresholds, exclusions and line-budget baselines are unchanged.

Every completed issue has its audit loop and dedicated commit, including the
approved 3102 follow-up. No required verification is blocked. The final issue
adds only engineering records; exact Git added/deleted/net counts and its
self-external hash are reported after commit. Scope exceeds no acceptance
criterion. The suspended stash and paused features remain untouched.

Reviewed scope: baseline `1f04e5e3` through `cdcc33fb`, plus this complete
closure diff. Stop after the dedicated 3112 local commit. **Resume point: none.
No push, next milestone, feature work or deployment is authorized.**
