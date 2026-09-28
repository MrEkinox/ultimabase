# 6303: Introduce the immutable configured application factory

- Status: planned
- Milestone: 63
- Packages: `@ultimabase/core`
- Depends on: 6302
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Introduce chained `UltimaBase.use(plugin())` as the immutable canonical plugin
installation path and let the resulting configured class own ordinary
construction, compilation, lifecycle, and schema authoring without duplicating
the internal plugin graph during the bounded repository migration.

## Acceptance criteria

- [ ] Every `.use()` returns a new precisely typed configured application factory without mutating its parent.
- [ ] `UltimaBase` is the zero-plugin root factory and every configured application is an immutable descendant using the same construction and schema-authoring machinery.
- [ ] `new App({ schemas })` preserves all current application options that are not plugin installation.
- [ ] Plugin order, dependencies, peers, exact instances, privileges, claims, capabilities, setup exports, resources, diagnostics, and teardown retain their current semantics.
- [ ] Several inert configured factories may coexist while only one application may initialize per JavaScript realm.
- [ ] A compatible descendant may consume schemas declared by its root or ancestor factory without rebuilding or mutating their class identity; an incompatible factory fails precisely.
- [ ] During the bounded migration only, the old `plugins` constructor option and the configured factory feed one normalization, graph, privilege, compilation, and lifecycle implementation; no adapter graph or duplicated state is introduced.
- [ ] The old constructor form is not taught as an alternative and its complete removal is explicitly owned by issue 6314 after every consumer migrates.
- [ ] Plugins remain one flat application graph; `.use()` never nests lifecycle or hides dependencies.
- [ ] Pure `compile()`, setup-only `initialize()`, `start()`, `stop()`, disposal, inspection, and plugin-export lookup remain available through the configured application.
- [ ] Source and packed hovers keep the accumulated plugin tuple concise and documented.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Builder immutability, ordering, duplicate and explicit-instance behavior.
- [ ] Privilege denial before static or Runtime effects.
- [ ] Lifecycle and sequential replacement regressions.
- [ ] Source and packed-package editor contracts.
- [ ] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [ ] Record the starting revision and recheck every current application/plugin installation consumer before removal.
- [ ] Audit the complete diff for mutation, duplicate installation internals, nested graphs, changed order/identity/privileges, lifecycle leaks, unbounded migration branches, type expansion, documentation drift, and unrelated scope.
- [ ] Record each finding and correction in the handoff; rerun affected checks and the complete audit until no finding remains.
- [ ] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; do not add a compatibility adapter or weaken a test to continue.
- [ ] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [ ] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- Schema source inference, delivered by 6304.
- Plugin type projections, delivered by 6305.
- A mutable application builder or plugin collection object.
