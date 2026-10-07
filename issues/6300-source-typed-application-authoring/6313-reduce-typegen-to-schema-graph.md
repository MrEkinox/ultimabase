# 6313: Reduce Typegen to its retained graph boundary

- Status: completed
- Milestone: 63
- Packages: `@ultimabase/typegen`, `@ultimabase/core`, repository tooling and consumers
- Depends on: 6319
- ADR: ADR-0279, ADR-0281, ADR-0284
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Remove Typegen projections superseded by source-typed plugin definitions while
retaining one capability-complete generated graph for literal cross-schema name
resolution and every schema `WhereInput` under ADR-0281. Do not assume that
another generated schema contract is removable until evidence identifies its
source-owned replacement.

## Baseline

- Current implementation baseline: `10b55be7`, clean working tree, remote
  `origin/main` unchanged with 17 local commits ahead. User confirmed autonomous
  continuation after 6319; inventory precedes every deletion. No push is authorized.

- The user approved the configured Password User form on 2026-10-01. Issue
  6319 delivered that bounded prerequisite with complete validation and audit;
  resume this inventory from its local commit. Standalone specialized declarations still need explicit
  classification before deleting any generated builder projection.

- Resumed implementation revision: `d7a507f6` (issue 6314's validated local
  commit; working tree clean). No push is authorized. Inventory and bounded
  source/packed deletion probes are underway; the generated relationship graph,
  all complete `WhereInput` contracts, and complete-schema callbacks remain
  protected.
- Initial inventory revision: `b48effa0`. The user approved executing 6314
  first; record a fresh implementation baseline after 6314 completes. No push
  is authorized.
- Inventory and classification are in progress before deletion. In particular,
  generated schema surfaces still have Access/Hooks and Core consumers; their
  removal cannot be inferred merely from source-typed plugin commands.
- Architecture stop (2026-10-01, after 6314): a bounded attempt removed only
  generated field-builder methods, their `methodType` registration metadata,
  and the corresponding Core merge interfaces. The root typecheck and focused
  Typegen unit/type checks passed, but the locked current-authoring benchmark
  exposed one cold diagnostic: `Property 'vector' does not exist on type
'FieldBuilder<...>'`. Its `User` is created by the still-public
  `PasswordUserSchema.define({ fields: (field) => ({ embedding:
field.vector(...) }) })`, which has no configured `App.Schema` input.
  Typegen currently supplies that method through the generated builder merge;
  the source-only configured factory cannot type this authoring path. The same
  probe reported two edit diagnostics instead of one. The entire experiment,
  including tests and documentation changes, was reverted; a clean rebuild and
  the one-schema benchmark again report zero cold diagnostics and exactly one
  edit diagnostic. The restored Typegen suite then passed 30 files/60 tests,
  including the locked 1/10/50-schema performance gate, with no type errors.
  No product code was committed or pushed. This is a real
  public-API dependency, not a stale fixture or a TypeScript timing fluctuation.
  Stop here for an architecture decision before another deletion attempt:
  either retain this generated builder projection as an explicit exception,
  or redesign specialized schema authoring to accept a configured factory
  while preserving the existing standalone capability. Neither choice is
  implicit in the current acceptance criteria.
- Architecture stop (2026-09-30): generated builder methods and direct plugin
  options still type the public standalone `Schema.define()` entry point, while
  issue 6314 removes that entry point.
  `FieldBuilder` defaults to `UltimaBaseGeneratedFieldBuilderMethods`; source
  projections are only available through configured `App.Schema.define()`.
  Generated operations and schema surfaces likewise still type public
  application handles in `application-handles.ts`. Removing these projections
  in 6313 would silently degrade a still-valid path before 6314 removes it.
  A bounded field-method deletion passed Core/Typegen unit tests and root
  typecheck, but those checks did not protect standalone plugin completion;
  the experiment was fully reverted, with no production change or commit.
  The user approved executing 6314 before this issue; resume the deletion only
  after 6314's committed-diff audit and validation pass.

## Acceptance criteria

- [x] Every current Typegen output, snapshot field, reference, privilege, public export, and consumer is classified as required cross-schema graph data, proven superseded plugin projection, or explicitly retained pending later evidence.
- [x] The application-specific name-to-schema graph remains the sole authority for pointers, relations, circular targets, nested writes, relationship filters, and other contracts that resolve a literal target name.
- [x] Every generated schema `WhereInput`, including plugin-field scalar filters, remains intact with its required snapshot facts, public value references, registry wiring, and source/packed editor tests; no `where` reduction is counted in this issue.
- [x] Superseded plugin projections are removed when no retained consumer needs them. Every remaining builder, option, command or operation descriptor has an inventoried standalone, advanced-handle or complete-graph consumer under ADR-0279/0284.
- [x] Removing or reconfiguring a plugin immediately changes those source completions and diagnostics without regeneration; changes to the application schema-name graph retain the existing generation and stale-output safeguards.
- [x] The Typegen workspace, loader, deterministic snapshot, fingerprint, writer, package exports, build integration, and clean-checkout workflow remain only where a retained contract uses them.
- [x] No Core registry, source-module scope, compiler plugin, generated client, compatibility package, or plugin-owned augmentation duplicates the retained Typegen graph.
- [x] Exact removed and retained production lines, exports, declaration bytes, generation time, edit-to-diagnostic latency, and consumers are recorded.
- [x] Documentation impact is recorded.

## Tests

- [x] Source and packed plugin surfaces remain exact when their generated plugin descriptors are absent.
- [x] Circular and cross-file target contracts retain their generated graph, fingerprint, stale-output, and rename diagnostics.
- [x] Removed descriptor/export/dependency absence guards and retained graph ownership guards.
- [x] Locked TypeScript performance, memory, generation, and declaration-size budgets.
- [x] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [x] Record the starting revision and a complete Typegen output/snapshot/reference/privilege/export/script/artifact/fixture/documentation consumer inventory before deletion.
- [x] Audit the complete diff for a second name graph, lost circular contracts, surviving generated plugin projections, moved generation logic, stale artifacts, weakened clean-checkout behavior, declaration growth, and deleted retained tests.
- [x] Record each finding and correction in the handoff; rerun ownership searches, source/packed/editor/budget checks, and the complete audit until no finding remains.
- [x] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; a speculative deletion may not be justified by the milestone's old Typegen-removal goal.
- [x] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [x] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- Removing `@ultimabase/typegen`, its sole cross-schema graph, or any generated schema `WhereInput`.
- Removing another generated schema contract without a proven source-owned replacement.
- OpenAPI, SDK, transport schema, or client generation.
- Runtime source rewriting or a TypeScript compiler plugin.

## Implementation evidence

The [pre-deletion inventory](evidence/6313-typegen-inventory.md) classifies all
output families, snapshot fields, references, privileges, exports and consumers.
ADR-0284 explicitly retains standalone specialized authoring; ADR-0279 also
retains advanced handles and generated contracts without a proven replacement.
Consequently this issue removes redundant output, not those supported consumers'
descriptors. The configured source path remains independent of these local
plugin projections; complete callbacks, User results and WhereInput retain their
accepted graph dependencies. No plugin reference registration, privilege, Core
merge interface or package export has been removed without a replacement.

Two bounded changes:

- Delete the duplicate `Application*Builder` aliases and their renderer. The
  existing Core contextual builder interfaces retain all methods; the semantic
  fixture now uses Core.FieldBuilder and keeps its vector/relationship checks.
- Emit each mutation definition once in schemaMutations and index that same
  entry from schemaClass/schema/model methods. Core already rejects duplicate
  aliases across surfaces. Source/built language-service checks also verify that
  schema-only and model-only commands never leak across surfaces.

Generator version 20 invalidates earlier output; snapshot version 11 and Core
ABI 20 are unchanged. Both tracked example declarations have been regenerated.
The README and public generation example also had an obsolete `application`
argument key; they now use the actual `ultimabase` option. This correction is
within the issue's clean-checkout and documentation review, not a new API.

Documentation impact: both. The inventory/handoff and Typegen README describe
the retained boundary; the public generation and plugin-author guides explain
the removed aliases, shared descriptors and remaining generation dependencies.

## Audit iterations

| Iteration | Finding and action                                                                                                                                                                                                                | Evidence                                                                                                        | Remaining work                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1         | Wholesale builder/options/surface removal would still break standalone or dynamic consumers. Retained them under ADR-0279/0284 and selected only duplicate aliases and repeated mutation definitions.                             | Saved inventory before deletion; five focused Typegen files/nine tests and root typecheck pass.                 | Strengthen per-surface checks; built/full gates. |
| 2         | Shared descriptors must not broaden schema/model method availability; generation examples used a stale option key. Added positive/negative source/built surface assertions and fixed both examples. No Core typing bridge needed. | Three focused files/four tests and built Typegen one file/four tests pass; deterministic artifacts regenerated. | Full validation and final metrics pending.       |

## Measured output

Same production generator fixture and applicationId `issue-6313` before/after:

| Schemas | Before bytes | After bytes |       Difference | Full definitions before/after |
| ------- | -----------: | ----------: | ---------------: | ----------------------------: |
| 1       |       17,259 |      17,145 |    -114 (-0.66%) |                         0 / 0 |
| 10      |      136,265 |     129,128 |  -7,137 (-5.24%) |                       90 / 27 |
| 50      |      660,585 |     622,608 | -37,977 (-5.75%) |                     490 / 147 |

One isolated 50-schema production editor probe on each revision (single samples,
not a speed-up claim or a replacement for the locked repeated budget suite):

| Metric                 |       Before |        After |
| ---------------------- | -----------: | -----------: |
| Generation             |     82.09 ms |     91.99 ms |
| Cold typecheck         |  8,085.87 ms |  8,480.02 ms |
| Service initialization |    362.43 ms |    376.53 ms |
| Edit-to-diagnostic     |  6,789.98 ms |  6,931.24 ms |
| Completion p95         |      0.93 ms |      0.93 ms |
| Hover p95              |      0.61 ms |      0.71 ms |
| Diagnostic p95         |      0.06 ms |      0.04 ms |
| Peak heap              | 1,532.37 MiB | 1,504.04 MiB |

Both probes report zero cold/steady diagnostics, exactly one intentional edit
diagnostic, identical completions and identical concise query hover. The
measurable gain is fewer declarations and a smaller generator; these samples
do not establish faster TypeScript. Raw local logs are
`/private/tmp/ultimabase-6313-before-editor-50.json` and
`/private/tmp/ultimabase-6313-after-editor-50.json`.

Built package metrics after the change: 126,406 handwritten production lines
(-48), including 3,367 Typegen lines (-48); Core remains 70,243 lines. There
are still 1,739 package-root exports, 939,040 aggregate package declaration
bytes and 9,964 Typegen package declaration bytes. Four emitted-file aliases
are removed, not four package-root exports. No dependency or package is removed.
Tests add 25 net lines. These results remain above the milestone's final
production/export/declaration ceilings; this issue does not claim otherwise.

## Final validation and audit

Iteration 3: complete diff, untracked inventory, generated artifacts, ownership
invariant, public exports, source/packed contracts and documentation reviewed;
zero remaining findings in the accepted preservation scope. The original broad
projection-removal criterion is reconciled above with ADR-0284's explicit
standalone retention and ADR-0279's advanced consumers. It is **not** evidence
that every plugin descriptor or public nominal reference was removed.

The final permission-correct `yarn validate:full` passes: 557 ordinary files /
2,652 tests, 636 coverage files / 2,914 tests, one metadata file / nine tests,
and 17 website files / 66 tests. Root typecheck, formatting, lint, all package
build/export checks and dependency constraints pass. Existing file-size warnings
are unchanged. The locked 1/10/50-schema gate passes in both ordinary and
coverage runs. The additional source/packed editor matrix passes six files /
37 tests, including no-generated-plugin projections and circular target checks.

| Coverage   |                   Before |                    After |
| ---------- | -----------------------: | -----------------------: |
| Statements | 23,800 / 26,158 (90.98%) | 23,787 / 26,145 (90.98%) |
| Branches   | 14,698 / 17,391 (84.51%) | 14,689 / 17,381 (84.51%) |
| Functions  |   5,003 / 5,206 (96.10%) |   4,998 / 5,201 (96.09%) |
| Lines      | 23,075 / 25,203 (91.55%) | 23,063 / 25,191 (91.55%) |

The displayed function percentage falls 0.01 point solely because the removed
alias renderer contained five covered functions (renderer, helper, filter, map,
and empty check). Uncovered functions stay exactly 203; no surviving function
loses coverage. Uncovered statements/lines also stay unchanged; uncovered branch
arms decrease by one. No test, assertion, exclusion or threshold is removed.
The retained implementation's effective coverage is preserved.

Production diff: +5/-53 (-48). Test diff: +26/-1 (+25). Tracked generated
artifacts: +13/-13 (same line count, fewer bytes). Documentation and planning
account for the other changes. The final commit records the exact overall
numstat; none of the removed lines were moved into Core or another package.
Local logs: `/private/tmp/ultimabase-6313-validation.log` and
`/private/tmp/ultimabase-6313-packed-matrix.log`.

Line categories in the audited commit:

| Category            | Added | Removed |  Net |
| ------------------- | ----: | ------: | ---: |
| Production          |     5 |      53 |  -48 |
| Tests               |    26 |       1 |  +25 |
| Generated artifacts |    13 |      13 |    0 |
| Documentation/plans |   312 |      32 | +280 |
| Total (16 files)    |   356 |      99 | +257 |
