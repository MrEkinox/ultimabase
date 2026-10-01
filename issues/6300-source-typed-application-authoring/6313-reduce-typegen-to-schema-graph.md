# 6313: Reduce Typegen to its retained graph boundary

- Status: ready
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

- [ ] Every current Typegen output, snapshot field, reference, privilege, public export, and consumer is classified as required cross-schema graph data, proven superseded plugin projection, or explicitly retained pending later evidence.
- [ ] The application-specific name-to-schema graph remains the sole authority for pointers, relations, circular targets, nested writes, relationship filters, and other contracts that resolve a literal target name.
- [ ] Every generated schema `WhereInput`, including plugin-field scalar filters, remains intact with its required snapshot facts, public value references, registry wiring, and source/packed editor tests; no `where` reduction is counted in this issue.
- [ ] Plugin manifests and definitions no longer carry Typegen declarations for field builders, direct options, methods, schema mutations, model commands, or application operations that now infer from their source definition.
- [ ] Removing or reconfiguring a plugin immediately changes those source completions and diagnostics without regeneration; changes to the application schema-name graph retain the existing generation and stale-output safeguards.
- [ ] The Typegen workspace, loader, deterministic snapshot, fingerprint, writer, package exports, build integration, and clean-checkout workflow remain only where a retained contract uses them.
- [ ] No Core registry, source-module scope, compiler plugin, generated client, compatibility package, or plugin-owned augmentation duplicates the retained Typegen graph.
- [ ] Exact removed and retained production lines, exports, declaration bytes, generation time, edit-to-diagnostic latency, and consumers are recorded.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Source and packed plugin surfaces remain exact when their generated plugin descriptors are absent.
- [ ] Circular and cross-file target contracts retain their generated graph, fingerprint, stale-output, and rename diagnostics.
- [ ] Removed descriptor/export/dependency absence guards and retained graph ownership guards.
- [ ] Locked TypeScript performance, memory, generation, and declaration-size budgets.
- [ ] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [ ] Record the starting revision and a complete Typegen output/snapshot/reference/privilege/export/script/artifact/fixture/documentation consumer inventory before deletion.
- [ ] Audit the complete diff for a second name graph, lost circular contracts, surviving generated plugin projections, moved generation logic, stale artifacts, weakened clean-checkout behavior, declaration growth, and deleted retained tests.
- [ ] Record each finding and correction in the handoff; rerun ownership searches, source/packed/editor/budget checks, and the complete audit until no finding remains.
- [ ] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; a speculative deletion may not be justified by the milestone's old Typegen-removal goal.
- [ ] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [ ] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- Removing `@ultimabase/typegen`, its sole cross-schema graph, or any generated schema `WhereInput`.
- Removing another generated schema contract without a proven source-owned replacement.
- OpenAPI, SDK, transport schema, or client generation.
- Runtime source rewriting or a TypeScript compiler plugin.
