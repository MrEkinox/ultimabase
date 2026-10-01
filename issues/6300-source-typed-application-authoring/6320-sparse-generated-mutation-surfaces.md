# 6320: Remove empty and duplicate generated mutation surfaces

- Status: completed
- Milestone: 63
- Packages: `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 6315
- ADR: ADR-0285

## Goal

Implement the user-approved bounded cleanup without removing current plugin,
standalone, named-handle, relationship, or callback capabilities. This correction
does not resume the blocked final milestone audit or its descriptor experiment.

## Acceptance criteria

- [x] Empty generated operation/surface interfaces and empty schema-surface entries are omitted; inert snapshot facts remain intact.
- [x] Generated `schemaClass` signatures are removed, with class methods derived from canonical descriptors and schema visibility.
- [x] Source and built editor checks retain exact class, handle, model and related-model methods, completion, hover types, and negative diagnostics.
- [x] Real Soft Delete and complete Access/Hooks consumers remain valid; no source-only graph retry or extra public export is introduced.
- [x] Regenerated Todo and minimal artifacts, package contracts, public guide, and Core schema examples reflect the smaller output.

## Validation and audit gate

- [x] Focused generator, type, editor, example and root typechecks pass.
- [x] Three before/after actual-production 50-schema samples show no material regression, with raw evidence retained.
- [x] `yarn validate:full` passes with exact coverage totals recorded.
- [x] Audit the diff, fix findings, repeat affected checks, record line categories and exactly one Documentation impact classification.
- [x] Create and inspect one dedicated local commit; do not push.

## Baseline and stop rule

Baseline `2503dfa0`. Pre-existing dirty files are the 6316 stop evidence and
plan handoff, not product edits; preserve and exclude them from this commit.
Todo output is 1,563 lines / 60,359 bytes; minimal is 1,072 lines / 41,749 bytes.
The in-memory proof removes 2,053 minimal bytes without diagnostics in source
or built checks. Do not remove `schema`, `model`, or `schemaMutations`: existing
consumers fail without them. Stop if this narrow derivation causes a meaningful
performance or architectural regression; do not expand the public descriptor.

## Audit and handoff

Audit iteration 1 corrected new test-fixture mistakes: relation declarations use
`{ target }`, the empty-entry assertion must not reject the preserved schema
registry, and QuickInfo exposes a structural callable rather than its alias name.
These were test errors, not a product or architectural blocker. The corrected
source/built editor cases have zero diagnostics and retain negative checks,
method completion, exact selections, payload requirements, and related models.
The focused matrix passes 4 files / 14 tests; root and both example typechecks pass.

Audit iteration 2 reviewed every product, test, generated, and documentation
diff, the removed reader/renderer, snapshot retention, ABI invalidation, dependency
direction, exports, line budgets, and before/after performance evidence. The full
correctly permissioned `yarn validate:full` passes: 557 ordinary files / 2,655
tests; 636 coverage files / 2,917 tests; 1 metadata file / 9 tests; 17 website
files / 66 tests. Formatting, typecheck, lint, build/export checks, constraints,
and the locked 1/10/50-schema performance gate pass. Existing file-size warnings
remain unchanged. Zero implementation findings remain in this bounded scope.

The final milestone audit consolidates the two recorded iterations above.

| Iteration | Finding                                                                                                           | Correction and evidence                                                                | Remaining work at that checkpoint                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1         | Relation syntax, empty-entry assertion and callable QuickInfo expectations were inaccurate in new tests.          | Corrected the fixtures; four focused files/14 tests, root and example typechecks pass. | Complete diff and full validation.                                            |
| 2         | Removed generated readers/renderers must preserve canonical mutations, snapshots, ABI and per-surface visibility. | Complete diff review and the correctly permissioned full gate pass as recorded above.  | No bounded-cleanup finding; historical milestone budgets remain open in 6316. |

Documentation impact: both. Core/Typegen READMEs, the public generation guide,
the Core schema-mutation example, and ADR-0285 explain the smaller replaceable
declaration without changing developer syntax or Runtime behavior. Nothing
exceeds the approved scope; empty operation interfaces are included in the
approved empty-interface cleanup.

### Output and current-production comparison

| Artifact                     | Before                     | After                      | Removed                |
| ---------------------------- | -------------------------- | -------------------------- | ---------------------- |
| Todo declaration             | 1,563 lines / 60,359 bytes | 1,535 lines / 59,598 bytes | 28 lines / 761 bytes   |
| Minimal declaration          | 1,072 lines / 41,749 bytes | 1,031 lines / 39,696 bytes | 41 lines / 2,053 bytes |
| Actual 50-schema declaration | 622,608 bytes              | 590,807 bytes              | 31,801 bytes (5.11%)   |

Three isolated sequential samples per revision use the **identical current**
production fixture, Node 24.20.0 and TypeScript 6.0.3. Raw evidence is in
[6320-production-50-raw.json](evidence/6320-production-50-raw.json).
Median cold typecheck is 8,162.49 → 8,155.84 ms (-0.08%); edit-to-diagnostic
6,725.25 → 6,592.03 ms (-1.98%); generation 82.38 → 82.55 ms (+0.21%).
Observed peak heap is 1,506.44 → 1,535.15 MiB (+1.91%); ranges overlap
(before 1,503.91–1,530.12, after 1,514.45–1,538.35). This small sample shows
similar timings, not a proven speed or memory win. Every sample has zero initial
diagnostics and exactly one deliberate edit diagnostic; completions and hover
text are identical. This does not replace the historical 6316 comparison.

### Coverage and complexity

| Metric     | 6315 baseline            | After                    |
| ---------- | ------------------------ | ------------------------ |
| Statements | 23,788 / 26,145 (90.98%) | 23,789 / 26,146 (90.98%) |
| Branches   | 14,690 / 17,381 (84.51%) | 14,693 / 17,384 (84.52%) |
| Functions  | 4,998 / 5,201 (96.09%)   | 4,999 / 5,202 (96.09%)   |
| Lines      | 23,064 / 25,191 (91.55%) | 23,065 / 25,192 (91.55%) |

No threshold, exclusion, or required check changed. Handwritten production is
+56/-30, net **+26** (Core +14, Typegen +12), not a production-line reduction.
Tests are +85/-7, net +78. The two generated artifacts are +2/-71, net -69.
Raw timing evidence adds 291 data lines, not product implementation.
The repository measurement is 126,432 production lines, 1,739 public exports
(unchanged), and 939,352 aggregate package declaration bytes (+312). The smaller
application output costs one Core type derivation; it does not meet the final
milestone's production/export/declaration ceilings.

Typegen still owns named relationships, complete Where inputs, exact callback
contexts, Password User results, standalone specialized authoring contracts,
advanced handle maps, and canonical mutation descriptors. No second graph,
public descriptor redesign, or compatibility reader was added. Milestone 63 and
issue 6316 remain blocked. Review that architecture with the user before further
implementation; do not reopen the rejected source-only inference experiments.

Dedicated commit scope: 17 files. Exact line categories against `2503dfa0`:
production +56/-30; tests +85/-7; generated artifacts +2/-71;
documentation/navigation +175/-4; raw timing evidence +291/-0.
Total +609/-112 (net +497). The full staged diff was reviewed with zero findings.
Pre-existing 6316 notes and current-plan evidence remain outside this commit.
No push is authorized.
