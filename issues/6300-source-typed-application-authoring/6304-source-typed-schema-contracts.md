# 6304: Preserve exact schema contracts from source

- Status: planned
- Milestone: 63
- Packages: `@ultimabase/core`
- Depends on: 6303
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Make `App.Schema.define()` retain exact source field and schema contracts across
Core models and operations while keeping the current declaration object shape.

## Acceptance criteria

- [ ] `App.Schema.define({ className, fields, indexes, ... })` is the only ordinary schema declaration path and keeps the current syntax.
- [ ] `UltimaBase.Schema.define()` is the zero-plugin portable form of that same mechanism; any temporarily retained standalone `Schema` entry delegates the same compiler and is removed by issue 6314.
- [ ] Core fields, required/default/generated/immutable state, objects, lists, virtuals, pointers, relations, circular targets, indexes, system fields, and constraints infer without generated registry lookup.
- [ ] Drafts, persisted models, create/update/upsert inputs, where, order, select, include, nested writes, relation commands, and operation results retain their exact current types.
- [ ] Schema declarations stay inert and are registered only through explicit `new App({ schemas })` roots.
- [ ] The implementation does not mutate a prior configured factory, exported schema class, or prototype after definition.
- [ ] Reusable package schemas and separately compiled inert applications retain exact identity and isolation.
- [ ] Compatible root/ancestor schemas compose into configured descendant applications, while incompatible plugin-dependent schemas fail with focused source and Runtime diagnostics.
- [ ] Superseded generated schema-name and type-info lookup paths are deleted as their last Core consumers move.
- [ ] Source and packed hover output remains named, concise, and documented.
- [ ] Schema examples and public documentation are updated.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Compile-time contracts for every Core field and operation family.
- [ ] Circular pointer/relation and cross-module schema fixtures.
- [ ] Runtime schema compilation, identity, and explicit-registration regressions.
- [ ] Source and packed editor tests against 1, 10, and 50-schema profiles.
- [ ] Locked TypeScript performance and memory budgets.
- [ ] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [ ] Record the starting revision and inventory every generated/Core schema contract and reusable/specialized schema consumer before migration.
- [ ] Audit the complete diff for lost field/input/result precision, recursive type expansion, circular-target regressions, hidden registration, duplicate compilers, unbounded migration paths, late mutation, stale generated lookups, editor degradation, and documentation/example drift.
- [ ] Record each finding and correction in the handoff; rerun affected checks, budgets, and the complete audit until no finding remains.
- [ ] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; do not delete a retained editor assertion or generated-path test before equivalent source coverage exists.
- [ ] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [ ] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- Concrete plugin option typing.
- Automatic schema discovery through imports.
- A new schema declaration syntax.
