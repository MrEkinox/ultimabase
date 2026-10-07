# 6302: Accept the configured source-typed application ADR

- Status: completed
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

- [x] ADR-0279 records `UltimaBase.use()`, `App.Schema.define()`, explicit schema registration, direct class execution, source-typed plugin surfaces, and the retained Typegen cross-schema graph as one coherent decision.
- [x] The ADR names every superseded clause in ADRs 0173, 0175, 0184, 0187, 0192, 0197, 0198, 0201, 0248, 0254, 0258, 0262, 0265, 0267, 0273, 0276, and 0277 without rewriting history.
- [x] Privilege timing, flat plugin graphs, exact instances, deterministic order, lifecycle, request isolation, Master authority, immutable classes, and JavaScript behavior remain explicit invariants.
- [x] The decision explains how pure compilation and package-specialized schemas use source inference while literal relationship names resolve only through the retained Typegen graph, without late class mutation.
- [x] The current architecture index, root architecture, and ADR index identify the new current contract.
- [x] The measured issue-6301 limits are part of the decision evidence.
- [x] Documentation impact is recorded.

## Tests

- [x] Architecture link and current-status guards.
- [x] Issue metadata validation.
- [x] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [x] Record the starting revision and prove issue 6301 is completed, committed, budget-compliant, and free of unresolved findings.
- [x] Audit the complete decision diff against every named superseded clause, proof result, retained capability, security/lifecycle invariant, current architecture index, and rejected alternate path.
- [x] Record each finding and correction in the handoff; repeat the entire decision audit after every edit until no contradiction, stale current ADR, or unapproved behavior remains.
- [x] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; documentation-only scope does not waive `yarn validate:full`.
- [x] Complete every acceptance/test checkbox and exactly one Documentation impact classification before setting `completed`.
- [x] Create one dedicated local commit only after the green audit, inspect its complete diff and line counts, and amend/re-audit if needed. Do not push.

## Out of scope

- Production implementation.
- Compatibility aliases for rejected authoring forms.
- Weakening a locked evidence budget without explicit user approval.

## Starting evidence

- Starting revision: `3ee12f5e`.
- Issue 6301 is completed by dedicated local commit `3ee12f5e`; it changed no
  production export, kept the proof fixture at 699 lines under the 700-line
  test limit, passed `yarn validate:full`, and left no unresolved audit finding.
- The accepted proof and raw measurements are recorded in
  [`evidence/6301-hybrid-benchmark.md`](./evidence/6301-hybrid-benchmark.md).
- Unavailable prerequisites at start: none.

## Decision and validation evidence

- ADR-0279 accepts the exact saved developer form and makes the hybrid boundary
  durable: plugin surfaces come from configured source definitions, while the
  existing generated graph remains the sole application-specific literal-name
  resolver.
- The root architecture now exposes the configured factory, explicit schema
  registration, sole-active-owner execution, flat plugin installation, and the
  narrowed Typegen responsibility as one system contract.
- The current architecture index routes application ownership, plugin
  installation and declarations, schemas, and Typegen to ADR-0279. The ADR
  index also restores the missing ADR-0278 entry before adding ADR-0279.
- Focused guards: 2 files and 8 architecture/documentation tests passed with no
  type errors; issue metadata passed 1 file and 9 tests.
- `yarn validate:full` passed: formatting; 551 ordinary test files and 2,605
  tests with no type errors; lint with warnings only below hard file limits;
  every package build plus publication checks; 626 coverage files and 2,853
  tests; issue metadata, constraints, and public documentation; and 17 website
  test files with 66 tests.
- Complete coverage remained Statements 90.91% (23,706/26,075), Branches
  84.48% (14,685/17,381), Functions 96.07% (5,000/5,204), and Lines 91.47%
  (22,994/25,137).

## Documentation impact

Classification: **internal engineering documentation**. This issue accepts and
indexes the migration architecture but changes no shipped production export or
behavior. Package READMEs, schema examples, and public website pages remain
accurate for the current implementation and are updated by the issues that
actually migrate those public boundaries.

## Audit iterations

| Iteration | Finding or evidence                                                                                                                                                                                                                                                                     | Correction or decision                                                                                                                                                                                                                             | Validation result                                                                                                                        | Remaining findings                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1         | The first complete architecture diff still contained a root statement that nested plugins were configuration sugar, and the ADR index omitted the already accepted ADR-0278.                                                                                                            | Replaced the stale example with the sole flat `.use()` chain and restored ADR-0278 before indexing ADR-0279.                                                                                                                                       | Architecture and active-contract guards passed: 2 files, 8 tests, no type errors.                                                        | Audit every superseded typing clause and ambiguous ownership edge.         |
| 2         | Clause review showed ADR-0175, not only ADR-0173, made generated declarations authoritative for source-decidable plugin typing. Portable-schema reuse and stale model ownership also needed explicit limits.                                                                            | Added ADR-0175 to the supersession matrix; specified that portable schemas keep portable source surfaces and advanced handles retain conditional commands; allowed only inert result-owner provenance, never an executor or application reference. | Formatting, architecture guards, and issue metadata passed.                                                                              | Run the complete repository validation and repeat the full decision audit. |
| 3         | The final decision preserves every retained Runtime, security, lifecycle, JavaScript, package-specialization, plugin-instance, and Typegen-name-graph capability; every rejected alternative matches the saved target. No production or compatibility implementation entered the issue. | Locked every migration point to both the original issue-6301 baseline and the immediately preceding migration measurement so local regressions remain visible.                                                                                     | `yarn validate:full` passed with 551/2,605 ordinary and 626/2,853 coverage files/tests; coverage 90.91/84.48/96.07/91.47; website 17/66. | None.                                                                      |
